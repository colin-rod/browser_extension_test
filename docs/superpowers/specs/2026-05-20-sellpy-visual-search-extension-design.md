# Sellpy Visual Search Browser Extension — MVP Design

**Date:** 2026-05-20
**Target:** Working MVP demo on 2026-05-21
**Author:** colin.rodrigues@sellpy.se

## Purpose

A Chrome extension that lets a user right-click any image on the web and find visually similar items in Sellpy's catalog, powered by FashionCLIP image embeddings.

The MVP must work end-to-end on real Sellpy inventory — no faked results, no scripted demo URLs. The architecture must support scaling from a 10k-item demo catalog to ~100k items without redesign.

## Scope

### In scope
- A single MV3 extension codebase that loads in **both Chrome and Firefox** (loaded unpacked / as a temporary add-on by testers)
- Right-click context menu on images
- Hosted Python endpoint that embeds a query image and returns top-N visually similar Sellpy items
- One-off batch job to embed a 10k-item subset of Sellpy's catalog
- Results rendered in the extension as a list of items with thumbnail, category, and link to the Sellpy product page

### Out of scope (for the MVP)
- **Distribution.** No Chrome Web Store, no AMO listing, no signed builds. Testers load the extension unpacked (Chrome) or as a temporary add-on (Firefox).
- Safari build (requires Xcode + Apple Developer account — separate project)
- Embedding the full 10M-item Sellpy catalog
- Approximate nearest neighbor indexing (FAISS, ScaNN, vector DBs)
- Per-retailer DOM scrapers (we use a universal right-click flow)
- User accounts, history, or personalization
- Production-grade auth, rate limiting, or monitoring on the endpoint

## Architecture

Three independent units, each owned by one file or small file set:

```
┌──────────────────────┐   right-click image    ┌────────────────────┐
│  Chrome extension    │ ─────────────────────▶ │  Modal endpoint    │
│  (MV3, JS)           │   POST { image_url }   │  (Python, FastAPI) │
│                      │ ◀───────────────────── │                    │
│  - context menu      │   { matches: [...] }   │  - load embeddings │
│  - results popup     │                        │  - embed query     │
└──────────────────────┘                        │  - cosine top-N    │
                                                └─────────┬──────────┘
                                                          │ reads at startup
                                                          ▼
                                                ┌────────────────────┐
                                                │  Modal Volume      │
                                                │  catalog.npz       │
                                                │  metadata.json     │
                                                └────────▲───────────┘
                                                         │ writes once
                                                ┌────────┴───────────┐
                                                │  Embedding job     │
                                                │  (Modal GPU func)  │
                                                │  - BigQuery query  │
                                                │  - download images │
                                                │  - FashionCLIP     │
                                                │  - save to Volume  │
                                                └────────────────────┘
```

The endpoint and the embedding job live in the same Modal app but are different functions with different resource decorators (CPU vs GPU). They communicate only through the Modal Volume.

## Components

### 1. Embedding job (`embed_catalog.py`)

A one-shot Modal function that runs on a GPU.

**Inputs:** none (configuration in code: catalog size, BigQuery query).

**Behavior:**
1. Query BigQuery for 10k recent Sellpy items with non-null image URLs. Pull objectid, category, image URL, product page URL.
2. Download images in parallel (skip on error, log skipped count).
3. Run FashionCLIP (`patrickjohncyh/fashion-clip`) on batches of ~64 images.
4. L2-normalize each embedding.
5. Save:
   - `catalog.npz` — a single `(N, 512)` float32 array of embeddings, in BigQuery row order
   - `metadata.json` — a list of `{objectid, category, image_url, product_url}` in the same order

**Outputs:** two files written to a Modal Volume named `sellpy-visual-search`.

**Why it's separate:** embedding is GPU-bound and run once per catalog refresh. The serving endpoint is CPU-only and runs continuously. Splitting them means the demo endpoint doesn't carry GPU cost or cold-start risk.

### 2. Inference endpoint (`endpoint.py`)

A Modal web endpoint (FastAPI) on CPU.

**Startup:**
1. Mount the Modal Volume.
2. Load `catalog.npz` into memory as a torch tensor.
3. Load `metadata.json` into memory as a list.
4. Load FashionCLIP (model + processor) into memory.

**Endpoint:** `POST /match`

Request:
```json
{ "image_url": "https://...", "top_k": 10 }
```

Response:
```json
{
  "matches": [
    { "objectid": "...", "category": "...", "image_url": "...", "product_url": "...", "score": 0.87 },
    ...
  ]
}
```

**Behavior:**
1. Fetch the query image (timeout 10s).
2. Embed it with FashionCLIP, L2-normalize.
3. Compute `query @ catalog.T` (single matmul).
4. Take top-K indices.
5. Look up metadata for those indices, return as JSON.

**Configuration:**
- `memory=2048` (2 GB is plenty for FashionCLIP + 100k embeddings + headroom)
- `keep_warm=1` for the demo, so the endpoint stays hot
- `allow_concurrent_inputs=4` (defensive — demo is single-user)

**CORS:** allow all origins for the MVP. The extension calls this endpoint directly from `fetch()` in the service worker.

### 3. Browser extension (`extension/`)

Manifest V3. Single codebase that loads in both Chrome and Firefox unpacked. Minimal surface area.

**Cross-browser approach:**
- Use the `chrome.*` namespace in code. Firefox aliases `chrome.*` to its own `browser.*` APIs for the subset we use (`contextMenus`, `windows`, `storage`, `runtime`), so no shim is needed.
- Manifest V3 is supported by both browsers, but Firefox uses **event pages** instead of true service workers. Our `background.js` works under both because it only registers listeners at top level — no behavior that depends on service-worker-only semantics.
- One `manifest.json` works for both, with two specific tweaks: include a `browser_specific_settings.gecko.id` field (required by Firefox for `storage` access in unpacked add-ons), and declare `background` as `{ "service_worker": "background.js" }` (Chrome accepts this; Firefox MV3 also accepts this form and treats it as an event page).

**Files:**
- `manifest.json` — declares `contextMenus`, `storage`, host permission for the Modal endpoint URL, and the Firefox-specific `browser_specific_settings.gecko.id`.
- `background.js` — registers a context menu item ("Find on Sellpy") that appears when right-clicking images. On click, reads the image URL from the click target info, POSTs to the endpoint, opens a popup window (via `chrome.windows.create` with `type: "popup"`) showing the results.
- `results.html` + `results.js` — renders the matches as a grid of thumbnails. Clicking a result opens the Sellpy product page in a new tab.

**Lookup abstraction:** the function that calls the endpoint is its own module (`lookup.js`) with a single exported function `async function findSimilar(imageUrl): Promise<Match[]>`. This is the seam to swap implementations later (e.g. add caching, change provider) without touching UI code.

**Installation (for testers):**
- Chrome: `chrome://extensions` → enable Developer mode → "Load unpacked" → select `extension/`
- Firefox: `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → select `extension/manifest.json`. Note: Firefox temporary add-ons unload when the browser closes; testers must re-load on each Firefox restart. Documented as a known MVP limitation.

## Data flow

1. User on any web page right-clicks an image.
2. Chrome shows "Find on Sellpy" in the context menu.
3. User clicks it. `background.js` receives `info.srcUrl`.
4. `background.js` calls `findSimilar(info.srcUrl)`.
5. `lookup.js` POSTs `{image_url: info.srcUrl, top_k: 10}` to the Modal endpoint.
6. Endpoint fetches the image server-side (avoids CORS on the query image), embeds it, returns top-10 matches with metadata.
7. `background.js` opens `results.html` in a new popup window with the matches passed via `chrome.storage.session`.
8. `results.js` reads the matches and renders them.

## Error handling

Each layer handles only what it can:

- **Embedding job:** skip individual image download/embed failures, log count, continue. Job succeeds if ≥90% of items embed successfully.
- **Endpoint:** on query image fetch failure, return 400 with `{error: "could not load image"}`. On all other failures, return 500 with a generic message. No retries — the extension can re-trigger.
- **Extension:** on endpoint error or timeout (15s), show a single message in the results popup ("Couldn't find matches. Try again."). No automatic retry.

No silent failures. Every error path produces a visible message to the user.

## Testing

Given the timeline, formal tests are minimal. The validation plan:

1. **Embedding job:** run end-to-end on 10k items. Verify `catalog.npz` shape is `(N, 512)` where N ≥ 9000 (allowing for some download failures). Spot-check that `metadata.json` length matches embeddings length.
2. **Endpoint:** call `/match` with three known query images (a dress, a sneaker, a jacket — sourced from external retailers). For each, manually inspect top-5: do the matches look visually plausible? Same-category in top-3?
3. **Extension:** load unpacked in **both** Chrome and Firefox. In each, right-click an image on H&M, Zara, and a random news site. Verify the popup opens with results in <3s on a warm endpoint. Confirm the same code path works in both browsers; if a `chrome.*` call misbehaves in Firefox, document and fix.

If endpoint cold-start makes the first demo query feel bad, pre-warm it manually 30s before the demo.

## Deployment

**Modal app name:** `sellpy-visual-search`

**Single deploy command:** `modal deploy modal_app.py` deploys both the endpoint and the embedding job in one app. The embedding job is invoked manually (`modal run modal_app.py::embed_catalog`) once, before the demo.

**Extension:** loaded unpacked in Chrome and as a temporary add-on in Firefox from the `extension/` directory. Not published to any store for the MVP.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| BigQuery query returns items without usable image URLs | Filter for `image_url IS NOT NULL` in the query; the existing test script already does this for 18 items |
| Image downloads fail at scale during embedding | Use `concurrent.futures` with a thread pool, swallow individual failures, target ≥90% success |
| FashionCLIP CPU inference on the endpoint is too slow | Single-image embed on CPU is <1s in benchmarks. Acceptable. If it isn't, swap to a GPU container — one-line change. |
| Modal cold start hits during the demo | `keep_warm=1` + manual pre-warm before going on stage |
| Demo wifi is bad | Demo from a tethered phone or local-only fallback (run endpoint locally with `modal serve` and call from extension via `localhost`) |
| Some retailers block direct image fetches by the endpoint (referer, hotlink protection) | The endpoint fetches with a desktop User-Agent. If a specific site still blocks, the extension can fall back to fetching the image bytes in the browser and POSTing them. Defer this to post-MVP unless it actually breaks during testing. |

## What's deliberately deferred

- **Distribution.** Chrome Web Store (unlisted), Firefox AMO listing, signed builds. Today's testers load unpacked / temporary.
- **Safari support.** Requires Xcode + Apple Developer account + native app wrapping. Separate project.
- **Catalog growth beyond 100k.** At ~1M items, brute-force cosine still works (~50ms) but feels sluggish. Above that, switch to FAISS. Not before.
- **The full 10M-item backfill.** Multi-day GPU job. Real product decision, not an MVP one.
- **A real similarity-quality evaluation.** Post-MVP, build a small held-out set of "query image → expected matching Sellpy items" and measure recall@K.
- **Authentication on the endpoint.** Anyone with the URL can call it. For the MVP with a small trusted tester group, fine. Before any wider distribution, add a shared secret or proper auth.
- **Multi-image queries / text queries / hybrid search.** FashionCLIP supports text. Out of scope today.

## File layout

```
browser_extension_test/
├── test_fashion_clip.py          # existing — keep as a local sanity check
├── modal_app.py                  # new — defines embed_catalog + endpoint
├── bigquery_catalog.sql          # new — query for the 10k subset
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── lookup.js
│   ├── results.html
│   └── results.js
└── docs/superpowers/specs/
    └── 2026-05-20-sellpy-visual-search-extension-design.md   # this doc
```
