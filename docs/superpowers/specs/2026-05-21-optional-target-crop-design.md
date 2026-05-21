# Optional target-image crop for multi-item refinement

## Problem

Target images often contain multiple garments (model wearing shirt + pants + shoes, plus background). FashionCLIP embeds the whole image into a single 512-dim vector, so matches blend everything in frame and drift toward whichever item dominates pixel-wise. There is no way for the user to say "I want *this* item."

## Goal

Add optional, client-side cropping to the results popup so the user can refine a search to a specific region of the target image. Default behavior (whole-image search) is unchanged — refinement is a follow-up action after initial results render.

## Non-goals

- Automatic object detection or suggested boxes (potential future work — see Alternatives considered).
- Persisting crops across popup sessions.
- Comparing whole-image vs. cropped results side-by-side.
- Cropping the source-page image via a content script.

## UX flow

**Whole-image (unchanged).** Right-click image → "Find on Sellpy" → popup opens → whole-image matches load.

**Refinement (new).** After matches render, the query image at the top of the popup is interactive:

1. User drags a rectangle on the query image. A "Search this area" button appears once a valid box exists. A "Clear" button appears alongside.
2. "Search this area" crops the image client-side, uploads the bytes, and replaces the matches in place (the matches list shows a loading state during the request).
3. "Clear" removes the box and hides both buttons. The currently displayed matches remain on screen; the next "Search this area" requires drawing a new box.
4. Closing and reopening the popup discards the crop and returns to the original whole-image matches (the crop is not persisted in `chrome.storage.session`).

## Architecture

### Frontend ([extension/](../../extension/))

- **[results.html](../../extension/results.html) / [results.css](../../extension/results.css):** the query image becomes a positioned container with a transparent `<canvas>` overlay for the crop box. New "Search this area" and "Clear" buttons, hidden until a valid crop box exists.
- **New module [extension/crop.js](../../extension/crop.js)** (pure, testable): pointer-event handlers that produce a `{x, y, w, h}` box in image-natural coordinates given a display scale; `cropToBlob(imgElement, box)` uses an offscreen canvas to produce a JPEG `Blob` and a base64 string. No DOM globals — unit-testable.
- **[results.js](../../extension/results.js):** wires `crop.js` to the rendered query image, manages crop state, calls `findSimilar` with either `{imageUrl}` or `{imageBytes}`, swaps the matches list on response, shows inline errors on failure.
- **[lookup.js](../../extension/lookup.js):** `findSimilar` accepts an options object — `findSimilar({imageUrl?, imageBytes?, topK})`. Exactly one of `imageUrl` / `imageBytes` must be supplied. Existing `findSimilar(url, topK)` callers are migrated to the object form (only [background.js](../../extension/background.js) currently calls it).
- **[background.js](../../extension/background.js):** unchanged. Initial whole-image search still fires from the context menu. Refinement happens entirely inside the popup window.

### Backend ([modal_app.py](../../modal_app.py), [src/](../../src/))

- **`MatchService.match` ([modal_app.py:131-168](../../modal_app.py#L131-L168)):** accept either `image_url` (existing) or `image_bytes` (new, base64-encoded JPEG/PNG). Validation: exactly one must be present; reject 400 otherwise. If `image_bytes` present, decode via `PIL.Image.open(io.BytesIO(...)).convert("RGB")` and skip the URL fetch. Cap decoded base64 payload at 5 MB.
- **[src/embedding.py](../../src/embedding.py):** add `load_image_from_bytes(data: bytes) -> Image.Image` next to `load_image_from_url`. Symmetric, ~3 lines.
- No changes to catalog, embedding model, or similarity code. The crop is a different pre-processing path producing the same `PIL.Image` input to `embed_images`.

## Data flow

### Whole-image (unchanged)

1. User right-clicks → `background.js` stores `{status: "loading", queryImage: url}` and opens popup.
2. `background.js` calls `findSimilar({imageUrl: url})` → POST `{image_url}` to `/match`.
3. Backend fetches URL, embeds, returns matches → stored in `chrome.storage.session`, popup renders.

### Refined (new)

1. Popup has finished rendering whole-image matches. User drags a box on the query image → `crop.js` updates an in-memory `cropBox` (image-natural coords) and shows the action buttons.
2. Click "Search this area" → `cropToBlob` produces a base64 JPEG → `results.js` shows a loading state over the matches list → calls `findSimilar({imageBytes, topK: 10})`.
3. POST `/match` with `{image_bytes: "<base64>"}` → backend decodes, embeds, returns matches → `results.js` swaps the matches list.
4. "Clear" removes the box and hides both buttons. The matches currently on screen stay visible.

## State

- **Persistent (`chrome.storage.session[requestId]`):** unchanged shape — `{status, queryImage, matches}`. The crop is not persisted. Closing/reopening the popup yields the original whole-image matches.
- **Ephemeral (in-popup only):** current `cropBox`, refinement loading state, refined matches displayed.

## Error handling

- Crop box smaller than 20 px on either side → "Search this area" button stays disabled; no request fires.
- Backend rejects bytes (>5 MB or unreadable) → inline error above the matches list, previous matches remain visible, "Clear" still works.
- Network failure during refinement → same: inline error, previous matches stay.
- Backend receives both `image_url` and `image_bytes`, or neither → HTTP 400 with a descriptive message.

## Testing

### Python unit tests ([tests/](../../tests/))

- `load_image_from_bytes` decodes JPEG and PNG; rejects non-image bytes with a clean error.
- `MatchService.match` payload validation: rejects when both `image_url` and `image_bytes` are missing; rejects when both are present; rejects oversized `image_bytes`.
- Embedding parity smoke test: embedding the same image via `load_image_from_url(file://...)` vs. `load_image_from_bytes(open(..., "rb").read())` produces identical vectors (sanity check that the two paths converge).

### JS unit tests

- `crop.js` pure functions: pointer events at given coordinates produce the expected `{x, y, w, h}` in image-natural coords for a known display scale; `cropToBlob` on a synthetic canvas produces the expected pixel region (assert via re-decoding the blob).
- `lookup.js`: `findSimilar({imageBytes})` sends an `image_bytes` field; `findSimilar({imageUrl})` sends an `image_url` field; rejects when both/neither are supplied.

### Manual verification (required before shipping)

- Right-click a single-item image → matches load (regression on default path).
- Right-click a multi-item editorial photo → crop one garment → "Search this area" → matches shift toward that garment.
- Clear crop → buttons hide, previous matches remain.
- Tiny crop (<20 px) → button stays disabled.

End-to-end browser automation is out of scope — the UX is the main thing to validate and will be exercised manually.

## Alternatives considered

- **Auto-detection of items (e.g., YOLO / Grounding DINO).** Much bigger backend lift; deferred until user-driven crop has validated the underlying assumption that per-item search materially improves results.
- **Send `{image_url, bbox}` and let the backend crop.** Smaller payload, but the backend must re-fetch the original URL (which may have expired, become rate-limited, or be unreachable from Modal). Client-side crop is more robust and keeps cropping logic in one place.
- **Stack or compare original and refined results.** Adds UI complexity in a 480 px popup; "replace" is the simpler default and the user can clear to re-run.
- **Crop on the source page via a content script.** More native-feeling, but requires host permissions for every site and a separate UI path. The in-popup crop is sufficient.
