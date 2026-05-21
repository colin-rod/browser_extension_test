# Extension Results Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the visually-similar results page into a shoppable interface that surfaces brand, price, size, and a meaningful category, with a hidden debug toggle for internal testers. Extends the Modal API to carry the richer metadata.

**Architecture:** Backend change is small — extend the `Match` dataclass and pull the additional fields out of the in-memory metadata already fetched by `src/catalog_query.py`. A one-time verification (and possibly a `embed_catalog` re-run) ensures the on-Volume metadata.json has the new fields. Frontend rewrites `results.css` against Sellpy design tokens, restructures `results.html` for the new header, and extends `results.js` to render brand/category/price/size, manage skeleton loading, and implement a `localStorage`-backed debug toggle.

**Tech Stack:** Python 3.11 + Modal + FastAPI (backend), vanilla JS ES modules + CSS (extension), pytest (backend tests), `node:test` (extension tests).

**Spec:** [docs/superpowers/specs/2026-05-21-extension-results-redesign-design.md](../specs/2026-05-21-extension-results-redesign-design.md)

---

## File Structure

**Backend (modify):**
- `src/types.py` — extend `Match` dataclass with `category_1`, `brand`, `size`, `price`.
- `modal_app.py:154-163` — read the new fields from `self.metadata[i]` when constructing each `Match`.

**Backend (tests, create):**
- `tests/test_match.py` — unit tests for `Match` serialization with the new fields.

**Frontend (modify):**
- `extension/results.html` — new header structure (thumbnail + title + debug button), debug info bar slot.
- `extension/results.css` — full rewrite against Sellpy design tokens.
- `extension/results.js` — render new fields with fallbacks, skeleton loading, debug toggle.

**Frontend (tests, create):**
- `tests/test_results.test.js` — unit tests for the pure render/format helpers extracted from `results.js`.

**Refactor note:** To make `results.js` testable, extract pure helpers (`renderCard`, `formatPrice`, `isDebugEnabled`) into module exports that can be imported by tests. The DOM-mutating entrypoint stays in `results.js`; tests target the helpers via a new `extension/results_view.js` module.

---

## Task 1: Backend — extend Match dataclass

**Files:**
- Modify: `src/types.py:24-34`
- Create: `tests/test_match.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_match.py`:

```python
from __future__ import annotations

from src.types import Match


def test_match_to_json_includes_all_fields():
    m = Match(
        objectid="abc",
        category_1="Sweater",
        image_url="https://img/1.jpg",
        product_url="https://www.sellpy.se/item/abc",
        brand="Acne",
        size="M",
        price=149.0,
        score=0.771,
    )
    j = m.to_json()
    assert j == {
        "objectid": "abc",
        "category_1": "Sweater",
        "image_url": "https://img/1.jpg",
        "product_url": "https://www.sellpy.se/item/abc",
        "brand": "Acne",
        "size": "M",
        "price": 149.0,
        "score": 0.771,
    }


def test_match_to_json_allows_null_brand_size_price():
    m = Match(
        objectid="abc",
        category_1="Sweater",
        image_url="https://img/1.jpg",
        product_url="https://www.sellpy.se/item/abc",
        brand=None,
        size=None,
        price=None,
        score=0.5,
    )
    j = m.to_json()
    assert j["brand"] is None
    assert j["size"] is None
    assert j["price"] is None


def test_match_to_json_allows_null_category_1():
    m = Match(
        objectid="abc",
        category_1=None,
        image_url="https://img/1.jpg",
        product_url="https://www.sellpy.se/item/abc",
        brand="Acne",
        size="M",
        price=149.0,
        score=0.5,
    )
    assert m.to_json()["category_1"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_match.py -v`
Expected: FAIL — `Match.__init__()` got unexpected keyword arguments `category_1`, `brand`, `size`, `price`.

- [ ] **Step 3: Modify `Match` in `src/types.py`**

Replace the `Match` dataclass (`src/types.py:24-34`) with:

```python
@dataclass(frozen=True)
class Match:
    """One similarity result, returned to the extension."""
    objectid: str
    category_1: str | None
    image_url: str
    product_url: str
    brand: str | None
    size: str | None
    price: float | None
    score: float

    def to_json(self) -> dict[str, Any]:
        return asdict(self)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_match.py -v`
Expected: all three tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types.py tests/test_match.py
git commit -m "feat(types): extend Match with brand/size/price/category_1"
```

---

## Task 2: Backend — wire Match construction in modal_app.py

**Files:**
- Modify: `modal_app.py:154-163`

- [ ] **Step 1: Write a regression-protection test**

Append to `tests/test_match.py`:

```python
def test_match_construction_from_metadata_dict():
    """Mirrors what modal_app.py does when building a Match from on-Volume metadata."""
    metadata = {
        "objectid": "xyz",
        "image_url": "https://img/xyz.jpg",
        "product_url": "https://www.sellpy.se/item/xyz",
        "category": "Clothing",
        "category1": "Sweater",
        "brand": "Acne",
        "demography": "women",
        "size": "M",
        "price": 149.0,
    }
    m = Match(
        objectid=metadata["objectid"],
        category_1=metadata.get("category1"),
        image_url=metadata["image_url"],
        product_url=metadata["product_url"],
        brand=metadata.get("brand"),
        size=metadata.get("size"),
        price=metadata.get("price"),
        score=0.771,
    )
    j = m.to_json()
    assert j["brand"] == "Acne"
    assert j["category_1"] == "Sweater"
    assert j["size"] == "M"
    assert j["price"] == 149.0
```

- [ ] **Step 2: Run test to verify it passes (no impl change yet — verifying construction signature)**

Run: `pytest tests/test_match.py::test_match_construction_from_metadata_dict -v`
Expected: PASS.

- [ ] **Step 3: Update `modal_app.py` Match construction**

Replace `modal_app.py:154-163` with:

```python
        matches = [
            Match(
                objectid=self.metadata[i]["objectid"],
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
```

Note: `CatalogItem.to_metadata()` (`src/types.py:20-21`) uses `asdict()`, which writes the `CatalogItem.category1` field as JSON key `"category1"` (no underscore). Hence `.get("category1")` here. The `Match` API field is `category_1` (with underscore) — the rename happens at the Match boundary.

- [ ] **Step 4: Run all backend tests**

Run: `pytest tests/ -v`
Expected: all tests pass (including the existing `tests/test_similarity.py`).

- [ ] **Step 5: Commit**

```bash
git add modal_app.py tests/test_match.py
git commit -m "feat(api): surface brand/size/price/category_1 in match response"
```

---

## Task 3: Backend — verify Volume metadata schema

This is a verification checkpoint, not a code change. The on-Volume `metadata.json` must contain `brand`, `size`, `price`, and `category1` keys for the API change to be meaningful.

- [ ] **Step 1: Inspect Volume metadata**

Run (from repo root, assuming Modal CLI is configured):

```bash
modal volume get sellpy-visual-search-catalog metadata.json /tmp/metadata.json
python -c "import json; d = json.load(open('/tmp/metadata.json'))[0]; print(list(d.keys()))"
```

Expected output keys: `['objectid', 'image_url', 'product_url', 'category', 'category1', 'brand', 'demography', 'size', 'price']`.

- [ ] **Step 2: If keys are missing, re-run embed_catalog**

If `brand`, `size`, `price`, or `category1` are absent, run:

```bash
modal run modal_app.py::embed_catalog --limit 10000
```

Then re-inspect (step 1) to confirm the new keys are present. This re-uses the existing embeddings logic — there's no cost optimization to skip; embedding is the slow part and it runs anyway.

- [ ] **Step 3: No commit needed**

This step does not modify the repo. Note the result in the PR description.

---

## Task 4: Frontend — extract pure render helpers into a testable module

**Files:**
- Create: `extension/results_view.js`
- Create: `tests/test_results.test.js`

Rationale: the existing `results.js` mutates the DOM directly and is hard to unit-test. Extracting pure functions (`renderCard`, `formatPrice`, `escapeHtml`, `isDebugEnabled`) lets us TDD the rendering before wiring it back in.

- [ ] **Step 1: Write the failing test**

Create `tests/test_results.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";

import {
    escapeHtml,
    formatPrice,
    renderCard,
    isDebugEnabled,
} from "../extension/results_view.js";

test("escapeHtml escapes HTML special chars", () => {
    assert.equal(escapeHtml("<b>&\"'"), "&lt;b&gt;&amp;&quot;&#39;");
});

test("formatPrice renders integer SEK", () => {
    assert.equal(formatPrice(149), "149 kr");
    assert.equal(formatPrice(149.0), "149 kr");
});

test("formatPrice returns empty string for null", () => {
    assert.equal(formatPrice(null), "");
    assert.equal(formatPrice(undefined), "");
});

test("renderCard shows brand, category, price, size", () => {
    const html = renderCard({
        objectid: "abc",
        category_1: "Sweater",
        image_url: "https://img/1.jpg",
        product_url: "https://www.sellpy.se/item/abc",
        brand: "Acne",
        size: "M",
        price: 149.0,
        score: 0.771,
    }, { debug: false });
    assert.match(html, /Acne/);
    assert.match(html, /Sweater/);
    assert.match(html, /149 kr/);
    assert.match(html, />M</);
    assert.doesNotMatch(html, /0\.771/);
    assert.doesNotMatch(html, /abc/); // objectid hidden in non-debug
});

test("renderCard falls back to category_1 in brand slot when brand missing", () => {
    const html = renderCard({
        objectid: "abc",
        category_1: "Sweater",
        image_url: "https://img/1.jpg",
        product_url: "https://p",
        brand: null,
        size: "M",
        price: 149.0,
        score: 0.5,
    }, { debug: false });
    assert.match(html, /class="brand">Sweater</);
    // category line should NOT also appear, since category_1 was promoted
    const categoryLineMatches = html.match(/class="category"/g) || [];
    assert.equal(categoryLineMatches.length, 0);
});

test("renderCard omits price+size row when both null", () => {
    const html = renderCard({
        objectid: "abc",
        category_1: "Sweater",
        image_url: "https://img/1.jpg",
        product_url: "https://p",
        brand: "Acne",
        size: null,
        price: null,
        score: 0.5,
    }, { debug: false });
    assert.doesNotMatch(html, /class="price-row"/);
});

test("renderCard shows debug overlay when debug=true", () => {
    const html = renderCard({
        objectid: "abc-123",
        category_1: "Sweater",
        image_url: "https://img/1.jpg",
        product_url: "https://p",
        brand: "Acne",
        size: "M",
        price: 149.0,
        score: 0.7715,
    }, { debug: true });
    assert.match(html, /similarity 0\.772/);
    assert.match(html, /abc-123/);
});

test("isDebugEnabled honors URL param ?debug=1", () => {
    assert.equal(isDebugEnabled("?debug=1", null), true);
    assert.equal(isDebugEnabled("?debug=0", "1"), false);
    assert.equal(isDebugEnabled("", "1"), true);
    assert.equal(isDebugEnabled("", null), false);
    assert.equal(isDebugEnabled("", "0"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/test_results.test.js`
Expected: FAIL — module `extension/results_view.js` not found.

- [ ] **Step 3: Create `extension/results_view.js`**

```javascript
export function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
}

export function formatPrice(price) {
    if (price === null || price === undefined) return "";
    return `${Math.round(price)} kr`;
}

export function isDebugEnabled(search, stored) {
    const params = new URLSearchParams(search || "");
    if (params.has("debug")) {
        return params.get("debug") === "1";
    }
    return stored === "1";
}

export function renderCard(match, { debug }) {
    const hasBrand = match.brand && match.brand.length > 0;
    const brandText = hasBrand ? match.brand : (match.category_1 || "Item");
    const showCategoryLine = hasBrand && match.category_1;
    const priceText = formatPrice(match.price);
    const hasSize = match.size && match.size.length > 0;
    const showPriceRow = priceText.length > 0 || hasSize;

    const debugOverlay = debug
        ? `<div class="debug-overlay">similarity ${match.score.toFixed(3)} · <span class="debug-objectid">${escapeHtml(match.objectid)}</span></div>`
        : "";

    const categoryLine = showCategoryLine
        ? `<div class="category">${escapeHtml(match.category_1)}</div>`
        : "";

    const priceRow = showPriceRow
        ? `<div class="price-row">
            ${priceText ? `<span class="price">${escapeHtml(priceText)}</span>` : `<span class="price"></span>`}
            ${hasSize ? `<span class="size-pill">${escapeHtml(match.size)}</span>` : ""}
        </div>`
        : "";

    return `
        <a class="card" href="${escapeHtml(match.product_url)}" target="_blank" rel="noopener">
            <div class="image-plate">
                <img src="${escapeHtml(match.image_url)}" alt="${escapeHtml(brandText)}" loading="lazy" />
                ${debugOverlay}
            </div>
            <div class="meta">
                <div class="brand">${escapeHtml(brandText)}</div>
                ${categoryLine}
                ${priceRow}
            </div>
        </a>
    `;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/test_results.test.js`
Expected: all eight tests PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/results_view.js tests/test_results.test.js
git commit -m "feat(extension): extract pure render helpers for results view"
```

---

## Task 5: Frontend — restructure results.html

**Files:**
- Modify: `extension/results.html`

- [ ] **Step 1: Replace `extension/results.html` contents**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>Sellpy matches</title>
    <link rel="stylesheet" href="results.css" />
</head>
<body>
    <header class="page-header">
        <div id="query-thumb" class="query-thumb" aria-hidden="true"></div>
        <h1 class="page-title">Shop this sustainable on Sellpy</h1>
        <button id="debug-toggle" class="debug-toggle" type="button" aria-label="Toggle debug info" title="Toggle debug info">···</button>
    </header>
    <div id="debug-info" class="debug-info" hidden></div>
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
    <script src="results.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 2: Visually inspect**

Open `extension/results.html` directly in a browser (no extension load needed yet). The page should show the header structure with placeholder thumbnail, title, and `···` button. The skeleton grid is unstyled at this point — that's expected; we style next.

- [ ] **Step 3: Commit**

```bash
git add extension/results.html
git commit -m "feat(extension): restructure results header for shop-style layout"
```

---

## Task 6: Frontend — rewrite results.css against Sellpy tokens

**Files:**
- Modify: `extension/results.css` (full rewrite)

- [ ] **Step 1: Replace `extension/results.css` contents**

```css
/* Sellpy results page — design tokens align with the web app's system. */

:root {
    --black-100: #000000;
    --black-400: #424242;
    --black-500: #9E9E9E;
    --black-700: #EEEEEE;
    --black-800: #F5F5F5;
    --black-900: #F5F5F5;
    --black-1000: #FAFAFA;
    --blue-400: #034BE4;

    --radius-card: 4px;
    --space-2: 2px;
    --space-8: 8px;
    --space-12: 12px;
    --space-16: 16px;
    --space-24: 24px;

    --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.04);
    --shadow-elevated: 0 2px 4px rgba(0, 0, 0, 0.2);

    --font-heading: "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif;
    --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif;
}

* { box-sizing: border-box; }

body {
    font-family: var(--font-body);
    margin: 0;
    padding: var(--space-16);
    background: var(--black-1000);
    color: var(--black-100);
}

/* --- Header --- */
.page-header {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    margin-bottom: var(--space-24);
}

.query-thumb {
    width: 72px;
    height: 72px;
    border-radius: var(--radius-card);
    background: var(--black-900);
    flex-shrink: 0;
    overflow: hidden;
}
.query-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.page-title {
    font-family: var(--font-heading);
    font-weight: 500;
    font-size: 20px;
    line-height: 24px;
    color: var(--black-100);
    margin: 0;
    flex: 1;
}

.debug-toggle {
    background: transparent;
    border: none;
    color: var(--black-400);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    padding: var(--space-8);
    border-radius: var(--radius-card);
}
.debug-toggle:hover { color: var(--blue-400); }
.debug-toggle.is-active { color: var(--blue-400); }

/* --- Debug info bar --- */
.debug-info {
    background: #ffffff;
    border-left: 4px solid var(--blue-400);
    box-shadow: var(--shadow-elevated);
    border-radius: var(--radius-card);
    padding: var(--space-12);
    margin-bottom: var(--space-16);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 16px;
    color: var(--black-400);
}
.debug-info[hidden] { display: none; }
.debug-info dt { font-weight: 600; color: var(--black-100); display: inline; }
.debug-info dd { display: inline; margin: 0 var(--space-12) 0 var(--space-2); }
.debug-info dd.url {
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-block;
    vertical-align: bottom;
    cursor: pointer;
}

/* --- Grid --- */
.grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-12);
}
@media (min-width: 775px) {
    .grid { grid-template-columns: repeat(3, 1fr); }
}
@media (min-width: 1020px) {
    .grid { grid-template-columns: repeat(4, 1fr); }
}

/* --- Card --- */
.card {
    background: #ffffff;
    border: 1px solid var(--black-700);
    border-radius: var(--radius-card);
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    display: flex;
    flex-direction: column;
    transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
}
.card:hover {
    border-color: var(--black-500);
    transform: translateY(-1px);
    box-shadow: var(--shadow-card);
}

.image-plate {
    position: relative;
    background: var(--black-900);
    height: 180px;
}
.image-plate img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
}

.meta {
    padding: var(--space-8) var(--space-12);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.brand {
    font-weight: 500;
    font-size: 14px;
    line-height: 18px;
    color: var(--black-100);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.category {
    font-weight: 500;
    font-size: 12px;
    line-height: 14px;
    color: var(--black-400);
}

.price-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: var(--space-8);
    gap: var(--space-8);
}
.price {
    font-weight: 500;
    font-size: 14px;
    line-height: 18px;
    color: var(--black-100);
}
.size-pill {
    font-weight: 500;
    font-size: 12px;
    line-height: 14px;
    color: var(--black-400);
    background: var(--black-800);
    border-radius: var(--radius-card);
    padding: 2px 6px;
}

/* --- Debug overlay (per-card) --- */
.debug-overlay {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    color: #ffffff;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    line-height: 14px;
    padding: 2px 6px;
}
.debug-overlay .debug-objectid { cursor: pointer; text-decoration: underline dotted; }

/* --- Skeleton --- */
@keyframes skeleton-shimmer {
    0% { background-color: var(--black-800); }
    50% { background-color: var(--black-700); }
    100% { background-color: var(--black-800); }
}
.skeleton-card {
    height: 260px;
    animation: skeleton-shimmer 1.4s ease-in-out infinite;
    border-color: transparent;
}

/* --- Status text --- */
.status {
    color: var(--black-400);
    text-align: center;
    margin: var(--space-24) 0;
    font-size: 14px;
}
```

- [ ] **Step 2: Visually inspect**

Open `extension/results.html` in a browser. The header should render with the brand title, empty thumbnail plate, and `···` button. The skeleton grid should pulse with a subtle shimmer.

- [ ] **Step 3: Commit**

```bash
git add extension/results.css
git commit -m "feat(extension): rewrite results CSS against Sellpy design tokens"
```

---

## Task 7: Frontend — rewrite results.js to use the view module and debug toggle

**Files:**
- Modify: `extension/results.js` (full rewrite)

- [ ] **Step 1: Write the failing test for debug-toggle persistence**

Append to `tests/test_results.test.js`:

```javascript
import { renderDebugInfo } from "../extension/results_view.js";

test("renderDebugInfo formats the info bar", () => {
    const html = renderDebugInfo({
        queryImage: "https://example.com/very/long/url/to/image.jpg",
        topK: 10,
        matchCount: 8,
        timestamp: "2026-05-21T10:00:00.000Z",
    });
    assert.match(html, /query/i);
    assert.match(html, /top_k/);
    assert.match(html, /10/);
    assert.match(html, /matches/i);
    assert.match(html, /8/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/test_results.test.js`
Expected: FAIL — `renderDebugInfo` not exported.

- [ ] **Step 3: Add `renderDebugInfo` to `extension/results_view.js`**

Append to `extension/results_view.js`:

```javascript
export function renderDebugInfo({ queryImage, topK, matchCount, timestamp }) {
    return `
        <dt>query</dt><dd class="url" title="${escapeHtml(queryImage || "")}" data-url="${escapeHtml(queryImage || "")}">${escapeHtml(queryImage || "—")}</dd>
        <dt>top_k</dt><dd>${escapeHtml(String(topK ?? "—"))}</dd>
        <dt>matches</dt><dd>${escapeHtml(String(matchCount ?? "—"))}</dd>
        <dt>at</dt><dd>${escapeHtml(timestamp || "—")}</dd>
    `;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/test_results.test.js`
Expected: all tests PASS (including the new `renderDebugInfo` test).

- [ ] **Step 5: Replace `extension/results.js` contents**

```javascript
import { renderCard, renderDebugInfo, isDebugEnabled, escapeHtml } from "./results_view.js";

const DEBUG_STORAGE_KEY = "sellpy:results:debug";

const params = new URLSearchParams(window.location.search);
const requestId = params.get("id");

const queryThumbEl = document.getElementById("query-thumb");
const resultsEl = document.getElementById("results");
const debugToggleEl = document.getElementById("debug-toggle");
const debugInfoEl = document.getElementById("debug-info");

let debugOn = isDebugEnabled(window.location.search, readDebugStored());
applyDebugToggleVisual();

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

async function render() {
    const data = (await chrome.storage.session.get(requestId))[requestId];
    if (!data) {
        resultsEl.innerHTML = `<p class="status">No data.</p>`;
        debugInfoEl.hidden = true;
        return;
    }

    if (data.queryImage) {
        queryThumbEl.innerHTML = `<img src="${escapeHtml(data.queryImage)}" alt="" />`;
    }

    if (data.status === "loading") {
        // Keep the skeleton grid that's already in the DOM from results.html.
        // If the user navigated away and back, restore it.
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

- [ ] **Step 6: Run all extension tests**

Run: `node --test tests/test_results.test.js tests/test_lookup.test.js`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add extension/results.js extension/results_view.js tests/test_results.test.js
git commit -m "feat(extension): render brand/price/size + debug toggle in results.js"
```

---

## Task 8: Frontend — manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Load the extension**

In Chrome: `chrome://extensions/` → enable Developer mode → "Load unpacked" → select `extension/`. (If already loaded, click the refresh icon on the extension card.)

- [ ] **Step 2: Verify shopper view**

Navigate to any product page on a partner site that the content script targets. Trigger the visual-similar lookup. The results page should open and show:

- Header with thumbnail, "Shop this sustainable on Sellpy" title, and a faint `···` button on the right.
- 2-column grid (or 3/4 if the window is wide).
- Each card: image on a faint grey plate, brand line, category line (e.g. "Sweater"), price + size row.
- Skeleton shimmer visible during the loading window.
- No similarity scores anywhere.
- No objectids anywhere.

- [ ] **Step 3: Verify card fallbacks**

Open the results page against a catalog that has a mix of items. Confirm by inspecting at least three cards:

- An item with brand + category + price + size: shows all four cleanly.
- An item with no brand: the category name appears in the brand slot (bold), no separate category line below.
- An item with no price and no size: the price row is absent (no empty space).

- [ ] **Step 4: Verify debug mode**

Click the `···` button in the header. The button turns blue (active). The debug info bar appears under the header showing query URL, top_k, match count, and timestamp. Every card grows a thin black overlay at the bottom of the image with `similarity 0.{score} · {objectid}`.

Reload the page. Debug stays on (persisted in localStorage).

Click the `···` again to turn debug off. The info bar disappears and the overlays vanish.

- [ ] **Step 5: Verify URL param override**

Open the results page with `?debug=1` appended to the URL (while localStorage debug is off). Debug renders on for this load only. Open without the param: returns to stored state.

- [ ] **Step 6: Verify objectid copy**

In debug mode, click an objectid in a card overlay. Confirm it's in the clipboard (paste into a text field).

- [ ] **Step 7: Verify breakpoints**

Resize the browser window. Grid moves from 2 → 3 → 4 columns at ~775px and ~1020px.

- [ ] **Step 8: Commit verification notes (optional)**

If any issues surfaced during verification, fix them in a follow-up task before merging. No commit needed for the verification itself.

---

## Self-Review Notes

- **Spec coverage**: Match payload extensions (Task 1, 2), Volume metadata checkpoint (Task 3), header structure (Task 5), card anatomy + design tokens (Task 4, 6), skeleton loading (Task 6, 7), debug mode incl. localStorage + URL param (Task 4, 7), per-card debug overlay (Task 4, 7), debug info bar (Task 7), responsive breakpoints (Task 6), out-of-scope items respected (no condition, no font bundling, no analytics).
- **Type consistency**: API field is `category_1`, on-Volume metadata key is `category1` (legacy `CatalogItem` field name). The rename happens at the `Match` boundary in `modal_app.py` — documented inline in Task 2.
- **Frontend testability**: Pure helpers moved to `results_view.js` so they can be imported by `node:test` without a DOM.
