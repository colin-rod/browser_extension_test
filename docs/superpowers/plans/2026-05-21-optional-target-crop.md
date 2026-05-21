# Optional Target-Image Crop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional client-side cropping to the results popup so users can refine multi-item target images to a specific garment.

**Architecture:** Extend the existing `/match` endpoint to accept base64 `image_bytes` alongside `image_url`. Add a new pure `crop.js` module for box geometry and offscreen-canvas cropping. Wire an interactive overlay onto the query image in [results.js](../../extension/results.js), and migrate `findSimilar` to an options-object signature so the caller picks URL vs. bytes mode.

**Tech Stack:** Modal (FastAPI), Python 3.11, FashionCLIP via transformers, vanilla JS Chrome extension (no bundler), `node:test` for JS unit tests, `pytest` for Python tests.

---

## File Structure

**Backend:**
- Modify `src/embedding.py` — add `load_image_from_bytes`.
- Modify `modal_app.py` — `MatchService.match` accepts `image_bytes`.
- Modify `tests/test_match.py` — add validation + decoding tests (or split into a new file if it grows; current file is small enough to extend).

**Frontend:**
- Create `extension/crop.js` — pure crop-box geometry + canvas cropping, no DOM globals.
- Modify `extension/lookup.js` — `findSimilar({imageUrl?, imageBytes?, topK})`; keep `findSimilarWith` as the testable seam.
- Modify `extension/background.js` — call `findSimilar({imageUrl})`.
- Modify `extension/results.html` — restructure the query-image area so it can host the crop overlay; add action buttons.
- Modify `extension/results.css` — styles for the crop overlay, handles, and action buttons.
- Modify `extension/results.js` — wire crop module, manage in-popup state, handle refined search.
- Create `tests/test_crop.test.js` — unit tests for the crop module.
- Modify `tests/test_lookup.test.js` — cover the new options-object signature.

---

## Task 1: Add `load_image_from_bytes` to embedding module

**Files:**
- Modify: `src/embedding.py`
- Test: `tests/test_embedding_bytes.py` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/test_embedding_bytes.py`:

```python
from __future__ import annotations

import io

import pytest
from PIL import Image

from src.embedding import load_image_from_bytes


def _png_bytes(color: tuple[int, int, int] = (255, 0, 0)) -> bytes:
    img = Image.new("RGB", (32, 32), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_bytes(color: tuple[int, int, int] = (0, 128, 0)) -> bytes:
    img = Image.new("RGB", (32, 32), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_load_image_from_bytes_decodes_png():
    img = load_image_from_bytes(_png_bytes())
    assert isinstance(img, Image.Image)
    assert img.mode == "RGB"
    assert img.size == (32, 32)


def test_load_image_from_bytes_decodes_jpeg():
    img = load_image_from_bytes(_jpeg_bytes())
    assert isinstance(img, Image.Image)
    assert img.mode == "RGB"
    assert img.size == (32, 32)


def test_load_image_from_bytes_rejects_non_image():
    with pytest.raises(ValueError):
        load_image_from_bytes(b"not an image at all")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_embedding_bytes.py -v`
Expected: FAIL with `ImportError` / `AttributeError` — `load_image_from_bytes` doesn't exist.

- [ ] **Step 3: Implement `load_image_from_bytes`**

In `src/embedding.py`, add after `load_image_from_url`:

```python
def load_image_from_bytes(data: bytes) -> Image.Image:
    """Decode raw image bytes (JPEG/PNG) to an RGB PIL Image."""
    try:
        return Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as e:
        raise ValueError(f"could not decode image bytes: {e}") from e
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_embedding_bytes.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/embedding.py tests/test_embedding_bytes.py
git commit -m "feat(embedding): add load_image_from_bytes for in-memory decoding"
```

---

## Task 2: Accept `image_bytes` in `MatchService.match`

**Files:**
- Modify: `modal_app.py:131-168`
- Test: `tests/test_match_payload.py` (new — isolates payload validation from Modal class wiring)

We don't want the test to instantiate `MatchService` (it would try to load the model). Extract the payload-validation + image-loading branch into a free function that the test can call directly.

- [ ] **Step 1: Write the failing test**

Create `tests/test_match_payload.py`:

```python
from __future__ import annotations

import base64
import io

import pytest
from fastapi import HTTPException
from PIL import Image

from modal_app import resolve_query_image, MAX_IMAGE_BYTES


def _b64_png(size: tuple[int, int] = (16, 16)) -> str:
    img = Image.new("RGB", size, (10, 20, 30))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def test_resolve_query_image_accepts_image_url(monkeypatch):
    sentinel = Image.new("RGB", (4, 4))
    called = {}

    def fake_loader(url, timeout=10):
        called["url"] = url
        return sentinel

    img = resolve_query_image({"image_url": "https://x/y.jpg"}, url_loader=fake_loader)
    assert img is sentinel
    assert called["url"] == "https://x/y.jpg"


def test_resolve_query_image_accepts_image_bytes():
    img = resolve_query_image({"image_bytes": _b64_png()})
    assert img.size == (16, 16)
    assert img.mode == "RGB"


def test_resolve_query_image_rejects_when_neither_provided():
    with pytest.raises(HTTPException) as exc:
        resolve_query_image({})
    assert exc.value.status_code == 400


def test_resolve_query_image_rejects_when_both_provided():
    with pytest.raises(HTTPException) as exc:
        resolve_query_image({"image_url": "https://x", "image_bytes": _b64_png()})
    assert exc.value.status_code == 400


def test_resolve_query_image_rejects_oversized_bytes():
    huge = base64.b64encode(b"\x00" * (MAX_IMAGE_BYTES + 1)).decode("ascii")
    with pytest.raises(HTTPException) as exc:
        resolve_query_image({"image_bytes": huge})
    assert exc.value.status_code == 400


def test_resolve_query_image_rejects_undecodable_bytes():
    bad = base64.b64encode(b"not an image").decode("ascii")
    with pytest.raises(HTTPException) as exc:
        resolve_query_image({"image_bytes": bad})
    assert exc.value.status_code == 400


def test_resolve_query_image_propagates_url_loader_failure():
    def fake_loader(url, timeout=10):
        raise RuntimeError("boom")

    with pytest.raises(HTTPException) as exc:
        resolve_query_image({"image_url": "https://x"}, url_loader=fake_loader)
    assert exc.value.status_code == 400
    assert "boom" in exc.value.detail
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_match_payload.py -v`
Expected: FAIL — `resolve_query_image` and `MAX_IMAGE_BYTES` not exported from `modal_app`.

- [ ] **Step 3: Add `resolve_query_image` and `MAX_IMAGE_BYTES` to modal_app.py**

In `modal_app.py`, add at module scope (above the `@app.cls(...)` decorator on `MatchService`):

```python
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB cap on decoded base64 payload


def resolve_query_image(payload: dict, url_loader=None):
    """Validate a /match payload and return a PIL.Image.

    Exactly one of payload["image_url"] or payload["image_bytes"] must be set.
    image_bytes is base64-encoded JPEG/PNG, capped at MAX_IMAGE_BYTES.
    Raises fastapi.HTTPException(400) on any validation or decode error.
    """
    import base64
    from fastapi import HTTPException

    from src.embedding import load_image_from_bytes, load_image_from_url

    image_url = payload.get("image_url")
    image_bytes_b64 = payload.get("image_bytes")

    has_url = isinstance(image_url, str) and image_url
    has_bytes = isinstance(image_bytes_b64, str) and image_bytes_b64

    if has_url and has_bytes:
        raise HTTPException(status_code=400, detail="provide image_url OR image_bytes, not both")
    if not has_url and not has_bytes:
        raise HTTPException(status_code=400, detail="image_url or image_bytes is required")

    if has_bytes:
        try:
            raw = base64.b64decode(image_bytes_b64, validate=True)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"image_bytes is not valid base64: {e}")
        if len(raw) > MAX_IMAGE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"image_bytes exceeds {MAX_IMAGE_BYTES} byte cap",
            )
        try:
            return load_image_from_bytes(raw)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    loader = url_loader or load_image_from_url
    try:
        return loader(image_url, timeout=10)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"could not load image: {e}")
```

Then in `MatchService.match` ([modal_app.py:131-168](../../modal_app.py#L131-L168)), replace the body's URL-validation + image-loading block with a call to `resolve_query_image`. The full method becomes:

```python
    @modal.fastapi_endpoint(method="POST")
    def match(self, payload: dict) -> dict:
        import torch

        from src.embedding import embed_images
        from src.similarity import top_k_matches
        from src.types import Match

        img = resolve_query_image(payload)
        top_k = int(payload.get("top_k", 10))

        with torch.no_grad():
            query_emb = embed_images(self.model, self.processor, [img]).numpy()[0]

        indices, scores = top_k_matches(query_emb, self.catalog.numpy(), k=top_k)
        matches = [
            Match(
                objectid=self.metadata[i]["objectid"],
                category=self.metadata[i].get("category"),
                category_1=self.metadata[i].get("category1"),
                image_url=self.metadata[i]["image_url"],
                product_url=self.metadata[i]["product_url"],
                brand=self.metadata[i].get("brand"),
                size=self.metadata[i].get("size"),
                price=self.metadata[i].get("price"),
                score=float(s),
            ).to_json()
            for i, s in zip(indices, scores)
        ]
        return {"matches": matches}
```

Note the removed imports (`HTTPException`, `load_image_from_url`) since `resolve_query_image` handles those now.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_match_payload.py tests/test_match.py -v`
Expected: all pass (test_match.py is unaffected; test_match_payload.py 7 passed).

- [ ] **Step 5: Commit**

```bash
git add modal_app.py tests/test_match_payload.py
git commit -m "feat(api): accept image_bytes alongside image_url in /match"
```

---

## Task 3: Migrate `findSimilar` to an options-object signature

**Files:**
- Modify: `extension/lookup.js`
- Modify: `extension/background.js`
- Test: `tests/test_lookup.test.js`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `tests/test_lookup.test.js` with:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";

import { findSimilarWith } from "../extension/lookup.js";

const fakeMatches = [
    { objectid: "abc", category: "Dresses", image_url: "u1", product_url: "p1", score: 0.9 },
];

function captureFetch(response) {
    const calls = [];
    const fetchImpl = async (url, opts) => {
        calls.push({ url, opts });
        return response;
    };
    return { calls, fetchImpl };
}

test("findSimilarWith sends image_url when given imageUrl", async () => {
    const { calls, fetchImpl } = captureFetch({
        ok: true, status: 200, json: async () => ({ matches: fakeMatches }),
    });
    const result = await findSimilarWith(fetchImpl, "https://endpoint", {
        imageUrl: "https://q.jpg",
        topK: 5,
    });
    assert.deepEqual(result, fakeMatches);
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.image_url, "https://q.jpg");
    assert.equal(body.top_k, 5);
    assert.equal(body.image_bytes, undefined);
});

test("findSimilarWith sends image_bytes when given imageBytes", async () => {
    const { calls, fetchImpl } = captureFetch({
        ok: true, status: 200, json: async () => ({ matches: fakeMatches }),
    });
    const result = await findSimilarWith(fetchImpl, "https://endpoint", {
        imageBytes: "BASE64DATA",
        topK: 8,
    });
    assert.deepEqual(result, fakeMatches);
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.image_bytes, "BASE64DATA");
    assert.equal(body.top_k, 8);
    assert.equal(body.image_url, undefined);
});

test("findSimilarWith rejects when both imageUrl and imageBytes are given", async () => {
    const { fetchImpl } = captureFetch({ ok: true, status: 200, json: async () => ({ matches: [] }) });
    await assert.rejects(
        () => findSimilarWith(fetchImpl, "https://endpoint", {
            imageUrl: "u", imageBytes: "b", topK: 1,
        }),
        /exactly one/i,
    );
});

test("findSimilarWith rejects when neither imageUrl nor imageBytes is given", async () => {
    const { fetchImpl } = captureFetch({ ok: true, status: 200, json: async () => ({ matches: [] }) });
    await assert.rejects(
        () => findSimilarWith(fetchImpl, "https://endpoint", { topK: 1 }),
        /exactly one/i,
    );
});

test("findSimilarWith throws on non-OK response", async () => {
    const fakeFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    await assert.rejects(
        () => findSimilarWith(fakeFetch, "https://endpoint", { imageUrl: "u", topK: 5 }),
        /500/,
    );
});

test("findSimilarWith throws on missing matches field", async () => {
    const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
    await assert.rejects(
        () => findSimilarWith(fakeFetch, "https://endpoint", { imageUrl: "u", topK: 5 }),
    );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/test_lookup.test.js`
Expected: most tests fail (signature mismatch).

- [ ] **Step 3: Update `lookup.js`**

Replace `extension/lookup.js` with:

```javascript
import { ENDPOINT_URL } from "./config.js";

export async function findSimilar(options) {
    return findSimilarWith(fetch, ENDPOINT_URL, options);
}

export async function findSimilarWith(fetchImpl, endpointUrl, options) {
    const { imageUrl, imageBytes, topK = 10 } = options || {};
    const hasUrl = typeof imageUrl === "string" && imageUrl.length > 0;
    const hasBytes = typeof imageBytes === "string" && imageBytes.length > 0;
    if (hasUrl === hasBytes) {
        throw new Error("findSimilar: provide exactly one of imageUrl or imageBytes");
    }

    const body = { top_k: topK };
    if (hasUrl) body.image_url = imageUrl;
    if (hasBytes) body.image_bytes = imageBytes;

    const response = await fetchImpl(endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`Endpoint returned ${response.status}`);
    }
    const responseBody = await response.json();
    if (!Array.isArray(responseBody.matches)) {
        throw new Error("Endpoint response missing matches array");
    }
    return responseBody.matches;
}
```

- [ ] **Step 4: Update `background.js` to use the new signature**

In `extension/background.js`, replace line 29:

Old:
```javascript
const matches = await findSimilar(info.srcUrl, 10);
```

New:
```javascript
const matches = await findSimilar({ imageUrl: info.srcUrl, topK: 10 });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/test_lookup.test.js`
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add extension/lookup.js extension/background.js tests/test_lookup.test.js
git commit -m "refactor(extension): findSimilar takes options object with imageUrl|imageBytes"
```

---

## Task 4: Create the `crop.js` module

**Files:**
- Create: `extension/crop.js`
- Test: `tests/test_crop.test.js` (new)

The module exports pure functions. We test geometry directly. For `cropToBlob`, we feed a minimal stub `imgElement` with `naturalWidth`/`naturalHeight` and provide an `OffscreenCanvas`-shaped fake to keep the test free of `jsdom`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_crop.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";

import {
    pointerBoxToNatural,
    isValidCrop,
    cropToBase64,
    MIN_CROP_PX,
} from "../extension/crop.js";

test("pointerBoxToNatural scales display coords to image-natural coords", () => {
    // Display: 200x100. Image natural: 400x200 (2x scale).
    const box = pointerBoxToNatural(
        { startX: 10, startY: 20, endX: 60, endY: 70 },
        { displayWidth: 200, displayHeight: 100, naturalWidth: 400, naturalHeight: 200 },
    );
    assert.deepEqual(box, { x: 20, y: 40, w: 100, h: 100 });
});

test("pointerBoxToNatural normalizes inverted drag (end before start)", () => {
    const box = pointerBoxToNatural(
        { startX: 60, startY: 70, endX: 10, endY: 20 },
        { displayWidth: 100, displayHeight: 100, naturalWidth: 100, naturalHeight: 100 },
    );
    assert.deepEqual(box, { x: 10, y: 20, w: 50, h: 50 });
});

test("pointerBoxToNatural clamps to image bounds", () => {
    const box = pointerBoxToNatural(
        { startX: -10, startY: -10, endX: 250, endY: 250 },
        { displayWidth: 200, displayHeight: 200, naturalWidth: 100, naturalHeight: 100 },
    );
    assert.deepEqual(box, { x: 0, y: 0, w: 100, h: 100 });
});

test("isValidCrop rejects boxes smaller than MIN_CROP_PX on either side", () => {
    assert.equal(MIN_CROP_PX, 20);
    assert.equal(isValidCrop({ x: 0, y: 0, w: 19, h: 100 }), false);
    assert.equal(isValidCrop({ x: 0, y: 0, w: 100, h: 19 }), false);
    assert.equal(isValidCrop({ x: 0, y: 0, w: 20, h: 20 }), true);
    assert.equal(isValidCrop(null), false);
});

test("cropToBase64 draws the box region and returns a base64 JPEG", async () => {
    const drawCalls = [];
    const fakeCtx = {
        drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
            drawCalls.push({ img, sx, sy, sw, sh, dx, dy, dw, dh });
        },
    };
    const fakeCanvas = {
        width: 0,
        height: 0,
        getContext: () => fakeCtx,
        convertToBlob: async ({ type, quality } = {}) => {
            // pretend to return a 3-byte blob
            return { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, type: type || "image/jpeg", _quality: quality };
        },
    };
    const fakeImg = { naturalWidth: 800, naturalHeight: 600 };

    const result = await cropToBase64(fakeImg, { x: 100, y: 200, w: 300, h: 250 }, {
        createCanvas: (w, h) => { fakeCanvas.width = w; fakeCanvas.height = h; return fakeCanvas; },
    });

    assert.equal(fakeCanvas.width, 300);
    assert.equal(fakeCanvas.height, 250);
    assert.equal(drawCalls.length, 1);
    assert.deepEqual(drawCalls[0], {
        img: fakeImg, sx: 100, sy: 200, sw: 300, sh: 250, dx: 0, dy: 0, dw: 300, dh: 250,
    });
    // base64 of [1,2,3] is "AQID"
    assert.equal(result, "AQID");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/test_crop.test.js`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `crop.js`**

Create `extension/crop.js`:

```javascript
export const MIN_CROP_PX = 20;

export function pointerBoxToNatural(pointer, dims) {
    const { startX, startY, endX, endY } = pointer;
    const { displayWidth, displayHeight, naturalWidth, naturalHeight } = dims;
    const scaleX = naturalWidth / displayWidth;
    const scaleY = naturalHeight / displayHeight;
    const x0 = Math.min(startX, endX) * scaleX;
    const y0 = Math.min(startY, endY) * scaleY;
    const x1 = Math.max(startX, endX) * scaleX;
    const y1 = Math.max(startY, endY) * scaleY;
    const cx0 = Math.max(0, Math.min(naturalWidth, x0));
    const cy0 = Math.max(0, Math.min(naturalHeight, y0));
    const cx1 = Math.max(0, Math.min(naturalWidth, x1));
    const cy1 = Math.max(0, Math.min(naturalHeight, y1));
    return {
        x: Math.round(cx0),
        y: Math.round(cy0),
        w: Math.round(cx1 - cx0),
        h: Math.round(cy1 - cy0),
    };
}

export function isValidCrop(box) {
    if (!box) return false;
    return box.w >= MIN_CROP_PX && box.h >= MIN_CROP_PX;
}

function defaultCreateCanvas(w, h) {
    return new OffscreenCanvas(w, h);
}

export async function cropToBase64(imgElement, box, opts = {}) {
    const createCanvas = opts.createCanvas || defaultCreateCanvas;
    const quality = opts.quality ?? 0.9;
    const canvas = createCanvas(box.w, box.h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imgElement, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    const buf = await blob.arrayBuffer();
    return arrayBufferToBase64(buf);
}

function arrayBufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    // btoa is available in browser and in Node 16+ globals
    return btoa(binary);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/test_crop.test.js`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add extension/crop.js tests/test_crop.test.js
git commit -m "feat(extension): add pure crop module (geometry + canvas-to-base64)"
```

---

## Task 5: Restructure the query-image area in `results.html` and add CSS

**Files:**
- Modify: `extension/results.html`
- Modify: `extension/results.css`

The current `#query-thumb` is a small avatar-style thumbnail in the header. To support crop interaction, we need a larger interactive query-image area. Place it as a dedicated section above the matches grid, leaving the existing header thumbnail alone (it stays as the small identifier).

- [ ] **Step 1: Update `results.html`**

In `extension/results.html`, replace the `<main>` block (lines 16-25) and add a new `<section>` between the header and the existing main:

Old:
```html
    <main id="results">
        <div class="grid skeleton-grid" id="skeleton">
            <div class="card skeleton-card"></div>
            <div class="card skeleton-card"></div>
            <div class="card skeleton-card"></div>
            <div class="card skeleton-card"></div>
            <div class="card skeleton-card"></div>
            <div class="card skeleton-card"></div>
        </div>
    </main>
```

New:
```html
    <section id="query-pane" class="query-pane" hidden>
        <div class="query-stage">
            <img id="query-image" class="query-image" alt="" />
            <canvas id="crop-overlay" class="crop-overlay"></canvas>
        </div>
        <div class="query-actions">
            <button id="crop-search" class="crop-search" type="button" hidden>Search this area</button>
            <button id="crop-clear" class="crop-clear" type="button" hidden>Clear</button>
            <span id="crop-error" class="crop-error" hidden></span>
        </div>
    </section>
    <main id="results">
        <div class="grid skeleton-grid" id="skeleton">
            <div class="card skeleton-card"></div>
            <div class="card skeleton-card"></div>
            <div class="card skeleton-card"></div>
            <div class="card skeleton-card"></div>
            <div class="card skeleton-card"></div>
            <div class="card skeleton-card"></div>
        </div>
    </main>
```

- [ ] **Step 2: Add CSS for the query pane and crop overlay**

Append to `extension/results.css`:

```css
.query-pane {
    padding: 12px 16px 4px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.query-stage {
    position: relative;
    display: inline-block;
    max-width: 100%;
    align-self: center;
    user-select: none;
    touch-action: none;
}

.query-image {
    display: block;
    max-width: 100%;
    max-height: 240px;
    width: auto;
    height: auto;
    border-radius: 6px;
    pointer-events: none;
}

.crop-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
}

.query-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: 28px;
}

.crop-search,
.crop-clear {
    font: inherit;
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px solid #ccc;
    background: #fff;
    cursor: pointer;
}

.crop-search {
    background: #111;
    color: #fff;
    border-color: #111;
}

.crop-search:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.crop-error {
    color: #b00020;
    font-size: 13px;
}

.results-loading {
    opacity: 0.5;
    pointer-events: none;
}
```

- [ ] **Step 3: Commit**

```bash
git add extension/results.html extension/results.css
git commit -m "feat(extension): add query-image pane scaffolding for optional crop"
```

---

## Task 6: Wire the crop overlay and refined search in `results.js`

**Files:**
- Modify: `extension/results.js`

This task contains no automated tests — it's mostly DOM wiring. Manual verification at the end. Keep helpers small.

- [ ] **Step 1: Replace `extension/results.js`**

Replace `extension/results.js` with:

```javascript
import { renderCard, renderDebugInfo, isDebugEnabled, escapeHtml } from "./results_view.js";
import { pointerBoxToNatural, isValidCrop, cropToBase64 } from "./crop.js";
import { findSimilar } from "./lookup.js";

const DEBUG_STORAGE_KEY = "sellpy:results:debug";

const params = new URLSearchParams(window.location.search);
const requestId = params.get("id");

const queryThumbEl = document.getElementById("query-thumb");
const queryPaneEl = document.getElementById("query-pane");
const queryImageEl = document.getElementById("query-image");
const cropOverlayEl = document.getElementById("crop-overlay");
const cropSearchBtn = document.getElementById("crop-search");
const cropClearBtn = document.getElementById("crop-clear");
const cropErrorEl = document.getElementById("crop-error");
const resultsEl = document.getElementById("results");
const debugToggleEl = document.getElementById("debug-toggle");
const debugInfoEl = document.getElementById("debug-info");

let debugOn = isDebugEnabled(window.location.search, readDebugStored());
applyDebugToggleVisual();

let cropBox = null;     // {x, y, w, h} in image-natural coords
let dragState = null;   // { startX, startY } in display coords
let refining = false;

debugToggleEl.addEventListener("click", () => {
    debugOn = !debugOn;
    writeDebugStored(debugOn ? "1" : "0");
    applyDebugToggleVisual();
    render();
});

if (!requestId) {
    resultsEl.innerHTML = `<p class="status">Missing request id.</p>`;
} else {
    render();
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "session" && changes[requestId]) {
            render();
        }
    });
}

cropOverlayEl.addEventListener("pointerdown", onPointerDown);
cropOverlayEl.addEventListener("pointermove", onPointerMove);
cropOverlayEl.addEventListener("pointerup", onPointerUp);
cropOverlayEl.addEventListener("pointercancel", onPointerUp);
cropSearchBtn.addEventListener("click", onSearchCrop);
cropClearBtn.addEventListener("click", clearCrop);

async function render() {
    const data = (await chrome.storage.session.get(requestId))[requestId];
    if (!data) {
        resultsEl.innerHTML = `<p class="status">No data.</p>`;
        debugInfoEl.hidden = true;
        return;
    }

    if (data.queryImage) {
        queryThumbEl.innerHTML = `<img src="${escapeHtml(data.queryImage)}" alt="" />`;
        if (queryImageEl.src !== data.queryImage) {
            queryImageEl.src = data.queryImage;
            queryImageEl.crossOrigin = "anonymous";
        }
        queryPaneEl.hidden = false;
    } else {
        queryPaneEl.hidden = true;
    }

    if (data.status === "loading") {
        if (!resultsEl.querySelector(".skeleton-grid")) {
            resultsEl.innerHTML = skeletonGrid();
        }
        debugInfoEl.hidden = true;
        return;
    }
    if (data.status === "error") {
        resultsEl.innerHTML = `<p class="status">Couldn't find matches. ${escapeHtml(data.error || "Try again.")}</p>`;
        debugInfoEl.hidden = true;
        return;
    }
    if (data.status === "ok") {
        if (!data.matches || data.matches.length === 0) {
            resultsEl.innerHTML = `<p class="status">No matches.</p>`;
            debugInfoEl.hidden = true;
            return;
        }
        const cards = data.matches.map((m) => renderCard(m, { debug: debugOn })).join("");
        resultsEl.innerHTML = `<div class="grid">${cards}</div>`;
        renderDebugBar(data);
        attachObjectidCopy();
    }
}

function onPointerDown(e) {
    if (refining) return;
    cropOverlayEl.setPointerCapture(e.pointerId);
    const rect = cropOverlayEl.getBoundingClientRect();
    dragState = { startX: e.clientX - rect.left, startY: e.clientY - rect.top };
    cropBox = null;
    drawOverlay(null);
    updateActionButtons();
}

function onPointerMove(e) {
    if (!dragState) return;
    const rect = cropOverlayEl.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    cropBox = pointerBoxToNatural(
        { startX: dragState.startX, startY: dragState.startY, endX, endY },
        {
            displayWidth: rect.width,
            displayHeight: rect.height,
            naturalWidth: queryImageEl.naturalWidth,
            naturalHeight: queryImageEl.naturalHeight,
        },
    );
    drawOverlay(cropBox);
    updateActionButtons();
}

function onPointerUp(e) {
    if (!dragState) return;
    try { cropOverlayEl.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    dragState = null;
    updateActionButtons();
}

function drawOverlay(box) {
    const rect = cropOverlayEl.getBoundingClientRect();
    cropOverlayEl.width = rect.width;
    cropOverlayEl.height = rect.height;
    const ctx = cropOverlayEl.getContext("2d");
    ctx.clearRect(0, 0, cropOverlayEl.width, cropOverlayEl.height);
    if (!box) return;
    const scaleX = rect.width / queryImageEl.naturalWidth;
    const scaleY = rect.height / queryImageEl.naturalHeight;
    const dx = box.x * scaleX;
    const dy = box.y * scaleY;
    const dw = box.w * scaleX;
    const dh = box.h * scaleY;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(0, 0, cropOverlayEl.width, cropOverlayEl.height);
    ctx.clearRect(dx, dy, dw, dh);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(dx, dy, dw, dh);
}

function updateActionButtons() {
    const valid = isValidCrop(cropBox);
    cropSearchBtn.hidden = !cropBox;
    cropSearchBtn.disabled = !valid || refining;
    cropClearBtn.hidden = !cropBox;
}

function clearCrop() {
    cropBox = null;
    dragState = null;
    drawOverlay(null);
    updateActionButtons();
    hideCropError();
}

async function onSearchCrop() {
    if (!isValidCrop(cropBox) || refining) return;
    refining = true;
    hideCropError();
    cropSearchBtn.disabled = true;
    resultsEl.classList.add("results-loading");
    try {
        const imageBytes = await cropToBase64(queryImageEl, cropBox);
        const matches = await findSimilar({ imageBytes, topK: 10 });
        const existing = (await chrome.storage.session.get(requestId))[requestId] || {};
        await chrome.storage.session.set({
            [requestId]: { ...existing, status: "ok", matches, timestamp: Date.now() },
        });
    } catch (err) {
        showCropError(String(err && err.message ? err.message : err));
    } finally {
        refining = false;
        resultsEl.classList.remove("results-loading");
        updateActionButtons();
    }
}

function showCropError(msg) {
    cropErrorEl.textContent = msg;
    cropErrorEl.hidden = false;
}
function hideCropError() {
    cropErrorEl.textContent = "";
    cropErrorEl.hidden = true;
}

function renderDebugBar(data) {
    if (!debugOn) {
        debugInfoEl.hidden = true;
        return;
    }
    debugInfoEl.innerHTML = renderDebugInfo({
        queryImage: data.queryImage,
        topK: data.topK ?? data.matches?.length ?? null,
        matchCount: data.matches?.length ?? 0,
        timestamp: new Date(data.timestamp || Date.now()).toISOString(),
    });
    debugInfoEl.hidden = false;
    const urlEl = debugInfoEl.querySelector("dd.url");
    if (urlEl) {
        urlEl.addEventListener("click", () => {
            navigator.clipboard?.writeText(urlEl.dataset.url || "");
        });
    }
}

function attachObjectidCopy() {
    resultsEl.querySelectorAll(".debug-objectid").forEach((el) => {
        el.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            navigator.clipboard?.writeText(el.textContent || "");
        });
    });
}

function skeletonGrid() {
    return `<div class="grid skeleton-grid">
        ${Array.from({ length: 6 }, () => `<div class="card skeleton-card"></div>`).join("")}
    </div>`;
}

function readDebugStored() {
    try { return localStorage.getItem(DEBUG_STORAGE_KEY); } catch { return null; }
}
function writeDebugStored(v) {
    try { localStorage.setItem(DEBUG_STORAGE_KEY, v); } catch { /* noop */ }
}
function applyDebugToggleVisual() {
    debugToggleEl.classList.toggle("is-active", debugOn);
}
```

- [ ] **Step 2: Run all existing JS tests to confirm no regressions**

Run: `node --test tests/test_lookup.test.js tests/test_crop.test.js tests/test_results.test.js tests/test_results_filters.test.js`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add extension/results.js
git commit -m "feat(extension): interactive crop overlay + refined search in results popup"
```

---

## Task 7: Manual verification

**Files:** none (manual)

- [ ] **Step 1: Load the extension and deploy the backend**

Deploy backend: `modal deploy modal_app.py` (or use the existing dev endpoint).
Load extension: in Chrome, `chrome://extensions/` → Load unpacked → select `extension/`.

- [ ] **Step 2: Regression — single-item image still works**

Right-click on a single-item product image on any retailer site → "Find on Sellpy" → confirm matches load as before. Confirm the new query-image pane appears above the matches showing the same image.

- [ ] **Step 3: Refinement — multi-item editorial image**

Right-click a fashion editorial photo where a model is wearing multiple visible garments → confirm whole-image matches render → drag a box on the query image around one specific garment → confirm "Search this area" + "Clear" buttons appear → click "Search this area" → confirm matches list dims, then refreshes with garment-specific matches.

- [ ] **Step 4: Clear behavior**

After a refined search, click "Clear" → confirm buttons hide and the box overlay disappears. The currently displayed matches should remain.

- [ ] **Step 5: Tiny crop**

Try drawing a very small box (under 20 px in either dimension) → confirm "Search this area" button is disabled.

- [ ] **Step 6: Error path**

Temporarily break the backend (e.g., point `ENDPOINT_URL` in `config.js` at an invalid URL), draw a valid box, click "Search this area" → confirm an inline error message appears and previous matches stay visible. Restore the endpoint when done.

- [ ] **Step 7: Cross-origin sanity**

Try refining on an image hosted on a different origin than the page. The `crossOrigin="anonymous"` attribute and Chrome's permissive image fetching for extensions should allow `drawImage` without tainting the canvas; if you hit a canvas-tainted error, capture which site reproduces it and surface it in the inline error (existing error path already handles this).

---

## Self-Review Notes

**Spec coverage:**
- "Optional crop, default unchanged" → Tasks 5-6 add an inert pane until matches load; default flow untouched.
- "Client-side crop, uploads bytes" → Task 4 (`cropToBase64`), Task 6 (wiring).
- "Backend accepts `image_bytes` alongside `image_url`" → Tasks 1-2.
- "Exactly one of url/bytes; 5 MB cap; min 20 px crop" → Tasks 2 + 4.
- "Replace matches in place; clear removes box; not persisted" → Task 6 (`onSearchCrop` updates session, `clearCrop` resets in-memory state only).
- "Error handling: inline error, previous matches stay" → Task 6 (`showCropError`).
- "Migrate `findSimilar` to options object" → Task 3.

**Type consistency check:**
- Box shape `{x, y, w, h}` used in `pointerBoxToNatural`, `isValidCrop`, `cropToBase64`, `onPointerMove`, `drawOverlay`, `onSearchCrop` — consistent.
- `findSimilar({imageUrl?, imageBytes?, topK})` — consistent across `background.js`, `results.js`, and tests.
- Backend field names `image_url` / `image_bytes` — consistent between `lookup.js`, `resolve_query_image`, and tests.

**Placeholder scan:** No TBDs, no "add error handling" without showing it, no "similar to task N" references. All code blocks complete.
