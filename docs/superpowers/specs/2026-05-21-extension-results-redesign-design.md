# Extension Results Page Redesign — Design Spec

**Date:** 2026-05-21
**Owner:** colin.rodrigues@sellpy.se
**Scope:** Redesign the visually-similar results page rendered by `extension/results.html` / `results.js` / `results.css`, plus the matching Modal API payload extensions needed to support it. Aligned with Sellpy's web design system (palette, typography, spacing, radii).

## Goal

Transform the current debug-style results page into a shoppable interface that surfaces brand, price, size, and a meaningful category — while preserving a hidden debug mode for internal testers evaluating match quality.

## Audience

Two personas, served by the same page:

1. **Shoppers (default view)** — see a polished, brand-aligned results grid. No similarity scores, no internal IDs.
2. **Internal testers (debug mode)** — toggle a `···` button in the header to reveal similarity scores, objectids, query metadata, and total match count.

## Top-Level Approach

Polished marketplace cards in a responsive grid. Each card shows brand, finer category (e.g. "Sweater"), price, and size — the fields shoppers need to make a buying decision. Debug data is gated behind an unobtrusive toggle and persists in `localStorage` (also enabled via `?debug=1`).

## Backend — Modal API (`modal_app.py`)

Extend the `Match` response object to include richer metadata. The metadata is already fetched into memory by `src/catalog_query.py` and persisted by the `embed_catalog` job; the web endpoint just isn't reading it when building the response.

### Match payload (new fields)

| Field         | Type            | Notes                                                                     |
| ------------- | --------------- | ------------------------------------------------------------------------- |
| `objectid`    | string          | Already present. Used in debug view only.                                 |
| `image_url`   | string          | Already present.                                                          |
| `product_url` | string          | Already present.                                                          |
| `category_1`  | string \| null  | Finer category (e.g. "Sweater"). From `category_lvl_1`.                   |
| `brand`       | string \| null  | Brand label. Nullable — frontend falls back to `category_1` if missing.   |
| `size`        | string \| null  | Free-text size string from source.                                        |
| `price`       | number \| null  | SEK, integer-like float. Frontend renders as `"{n} kr"`.                  |
| `score`       | number          | Already present. Used in debug view only.                                 |

The existing `category` field is renamed in the response to `category_1` for clarity. Frontend reads `category_1`.

### Volume-metadata checkpoint

Before frontend work begins, verify that the metadata JSON written to the Modal Volume by the most recent `embed_catalog` run includes `brand`, `size`, `price`, and `category_1`. If only the four legacy fields are persisted, run `embed_catalog` once to regenerate. No model re-embedding is required — only metadata is being extended; the existing embedding vectors are unchanged.

## Frontend — Extension Results Page

### File touch points

- `extension/results.html` — minor structural changes (header re-layout, debug button).
- `extension/results.css` — substantial rewrite using Sellpy design tokens.
- `extension/results.js` — render new fields, debug toggle, skeleton loading.

### Page structure

```
┌────────────────────────────────────────────────────────────┐
│  [thumb]  Shop this sustainable on Sellpy            [···] │  ← header row
├────────────────────────────────────────────────────────────┤
│  [debug info bar — only when debug=on]                     │
├────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐                                │
│  │  image   │  │  image   │                                │
│  │          │  │          │                                │
│  ├──────────┤  ├──────────┤                                │
│  │ Brand    │  │ Brand    │                                │
│  │ Category │  │ Category │                                │
│  │ 149 kr M │  │ 249 kr L │                                │
│  └──────────┘  └──────────┘                                │
│  …                                                          │
└────────────────────────────────────────────────────────────┘
```

### Header (single row)

- Left: query thumbnail (~72px square, 4px radius, `object-fit: cover`, BLACK 900 background plate).
- Center-left: title **"Shop this sustainable on Sellpy"** (h6 typography — Ballinger 500, 20px / 24px, BLACK 100).
- Right: debug toggle `···` button. Plain text glyph button, BLACK 400 default, BLUE 400 on hover. Aria-label `"Toggle debug info"`.
- No secondary line, no match count.

### Card anatomy (default shopper view)

Top to bottom:

1. **Image** — full card width, ~180px tall, `object-fit: contain` on a BLACK 900 (`#F5F5F5`) plate so studio shots don't bleed into the surrounding white card.
2. **Brand line** — body3 Ballinger 500, 14px / 18px, BLACK 100. Single line, ellipsis on overflow. Falls back to `category_1` if `brand` is null.
3. **Category line** — body6 Ballinger 500, 12px / 14px, BLACK 400. Shows `category_1`. If brand was missing and `category_1` was promoted to the brand slot, omit this line.
4. **Price + size row** — flex row, space-between.
   - Price: body3 Ballinger 500, 14px / 18px, BLACK 100. Rendered as `"{n} kr"` (integer, no decimals).
   - Size pill: body6 12px on BLACK 800 (`#F5F5F5`), 4px radius, padding `2px 6px`.
   - If both are missing, entire row is omitted (no empty space).
   - If only one is present, the row keeps one element flush-left.

Card is a single `<a>` element linking to `product_url`, `target="_blank"`.

### Card anatomy (debug overlay)

When debug mode is on, each card gets an additional strip absolutely positioned at the bottom of the image area:

- Background: BLACK 100 at 70% opacity.
- Text: white, 10px monospace.
- Content: `similarity 0.771 · {objectid}` — clicking the objectid copies it to clipboard.

Default shopper styling is untouched; the overlay is purely additive.

### Loading state

Skeleton grid: render the same grid layout with placeholder cards. Each placeholder is a BLACK 800 (`#F5F5F5`) block at the image's dimensions with a subtle shimmer to BLACK 700 (`#EEEEEE`) via CSS keyframes (no JS) so the motion is visible. Brand / category / price lines are simulated as small BLACK 700 bars. Six skeletons; if `top_k` differs significantly this is fine as a fixed placeholder count.

### Empty / error states

Centered text, body3 BLACK 400. No icons. Existing copy retained ("No matches.", "Couldn't find matches. …").

## Styling — Sellpy Design Tokens

### Typography

- Font stack: `"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif` for the title; system stack for body. Brand WOFF2 bundling is explicitly out of scope.
- Title: h6 — Ballinger 500, 20px / 24px line-height, BLACK 100.
- Brand / price: body3 — 14px / 18px.
- Category / size pill / debug toggle: body6 — 12px / 14px.
- Debug overlay: 10px monospace.

### Colors

| Role                       | Token       | Hex       |
| -------------------------- | ----------- | --------- |
| Page background            | BLACK 1000  | `#FAFAFA` |
| Card surface               | (BG/NR100)  | `#FFFFFF` |
| Card border (resting)      | BLACK 700   | `#EEEEEE` |
| Card border (hover)        | BLACK 500   | `#9E9E9E` |
| Image plate                | BLACK 900   | `#F5F5F5` |
| Size pill background       | BLACK 800   | `#F5F5F5` |
| Primary text               | BLACK 100   | `#000000` |
| Muted text                 | BLACK 400   | `#424242` |
| Debug toggle hover         | BLUE 400    | `#034BE4` |
| Debug overlay background   | BLACK 100   | `rgba(0,0,0,0.7)` |

No accent colors (RED/ORANGE/GREEN) in the default UI — reserved for semantic states elsewhere in the system.

### Spacing (8pt grid)

- Page padding: 16px (space-16).
- Header → grid: 24px (space-24).
- Grid gap: 12px (space-12).
- Card inner padding: 12px horizontal, 8px vertical.
- Image → brand gap: 8px (space-8).
- Brand → category gap: 2px (space-2).
- Thumbnail ↔ title gap (header): 12px (space-12).

### Radii

- Card: 4px (sharp · default).
- Size pill: 4px.
- Query thumbnail: 4px.
- Image plate: corner-flush with card edge via `overflow: hidden` on the card.

### Shadow

- Card resting: none (border-only).
- Card hover: card token — `0 1px 2px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)` — with a 1px translateY lift. (Verify against design-system token export at implementation; if alpha values differ, use the canonical ones.)
- Debug info bar: elevated token — `0 2px 4px rgba(0,0,0,0.2)`.

### Breakpoints

- Default (< 775px): 2 columns.
- tablet (≥ 775px): 3 columns.
- desktop (≥ 1020px): 4 columns.

No special handling below 350px.

## Debug Mode

### Enabling

- `···` button in the header toggles state.
- State persisted in `localStorage` under key `sellpy:results:debug` (`"1"` / `"0"`).
- URL param `?debug=1` forces debug on for that page load (does not overwrite stored state). `?debug=0` forces off.

### What debug reveals

1. **Info bar under header** — shows:
   - Query image URL (truncated with ellipsis, click-to-copy).
   - `top_k` value used.
   - Request timestamp (ISO 8601, local).
   - Total match count.
   - Styled as an "elevated" shadow card with BLUE 400 left-border accent (4px) to signal developer affordance.
2. **Per-card overlay strip** at the bottom of each image — `similarity 0.{score} · {objectid}`. Click objectid → copy to clipboard.

When debug is off (default for shoppers): zero similarity numbers, zero objectids, zero diagnostic chrome anywhere on the page.

## Data Flow (unchanged + delta)

```
Page (e.g. Zalando) → content script picks image URL
  → background.js POSTs to Modal endpoint
  → Modal returns matches[] (now richer)
  → results.js renders the grid
```

No changes to `lookup.js`, `background.js`, or `manifest.json`.

## Testing

- **Backend**: extend the existing test for the Modal `/match` endpoint to assert the new fields appear in the response and are correctly mapped from catalog metadata. Cover the null cases (missing brand, missing price, missing size).
- **Frontend (manual)**: load the extension against the deployed Modal endpoint with three test inputs — an item with full metadata, one with missing brand, one with missing price+size — and verify the card renders correctly in each case. Toggle debug mode and confirm the overlay strip and info bar appear / disappear. Confirm `?debug=1` URL forces on.
- **Visual regression** is not in scope (no infra for it on the extension).

## Out of Scope (explicit YAGNI)

- Filtering, sorting, pagination of matches.
- Favoriting / saving / sharing results.
- Condition display (parked — requires extending `visual_search_catalog` and re-running `embed_catalog`).
- Bundling Space Grotesk / Ballinger WOFF2 fonts (graceful fallback to system stack).
- Multi-image queries or query refinement.
- Analytics / telemetry on shopper interactions.
- Changes to embedding model, similarity scoring, lookup.js, background.js.
- i18n — copy stays in English.
- Responsive behavior below 350px.
- Visual regression testing infra.

## Open Questions / Risks

- **Volume metadata schema**: if the most recent `embed_catalog` run did not persist `brand`/`price`/`size`/`category_1`, a re-run is required before the API change is meaningful. This is a checkpoint, not a blocker — the API change itself is small.
- **Brand font availability**: until WOFF2 files are bundled, the title renders in the system stack. Acceptable for this round; the visual gap from "true Sellpy brand" is documented and parked.
