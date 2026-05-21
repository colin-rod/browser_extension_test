# Results-page Frontend Filtering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-side filter bar (Size, Brand, Price) to the browser-extension results page that narrows the already-fetched top-K matches without re-querying the backend.

**Architecture:** A new pure module (`results_filters.js`) derives filter options and applies filters over `data.matches`. Pure render helpers in `results_view.js` produce filter-bar markup. The orchestrator `results.js` owns in-memory filter state, wires DOM interactions (popovers, sliders, checkboxes), and re-renders on storage changes. Filter state resets on every new search. AND across filter types, OR within. Items missing a filtered field are hidden by default with a per-field "show anyway" banner.

**Tech Stack:** Vanilla ES modules in the extension; no build step. Tests use `node --test` (Node's built-in test runner) with ES-module imports — same pattern as the existing `tests/test_results.test.js`.

**Spec:** [docs/superpowers/specs/2026-05-21-results-frontend-filtering-design.md](../specs/2026-05-21-results-frontend-filtering-design.md)

**Branch:** `feat/results-frontend-filtering`

---

## File Structure

**Create:**
- `extension/results_filters.js` — pure module: `emptyFilterState()`, `deriveFilterOptions(matches)`, `applyFilters(matches, state)`. No DOM. No imports from other extension files.
- `tests/test_results_filters.test.js` — unit tests for the three exports above.

**Modify:**
- `extension/results_view.js` — add `renderFilterBar(state, options)` and `renderMissingBanner(field, count)` pure helpers. Existing helpers unchanged.
- `extension/results.html` — add `<div id="filter-bar">` and `<div id="missing-banner">` containers between `#debug-info` and `<main id="results">`.
- `extension/results.css` — styles for filter bar, dropdown triggers, popovers, slider, badges, banner. Tokens from the existing Sellpy palette.
- `extension/results.js` — own `filterState`, reset on `requestId` change, derive options on each `render()`, wire popovers + checkbox + slider events.
- `tests/test_results.test.js` — add tests for `renderFilterBar` and `renderMissingBanner`.

---

## Task 1: Pure filter module — `emptyFilterState` + first option derivation

**Files:**
- Create: `extension/results_filters.js`
- Test: `tests/test_results_filters.test.js`

- [ ] **Step 1: Write failing tests for `emptyFilterState` and `deriveFilterOptions` (basic shape)**

Create `tests/test_results_filters.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";

import {
    emptyFilterState,
    deriveFilterOptions,
} from "../extension/results_filters.js";

test("emptyFilterState returns fresh inactive state", () => {
    const s = emptyFilterState();
    assert.ok(s.sizes instanceof Set);
    assert.equal(s.sizes.size, 0);
    assert.ok(s.brands instanceof Set);
    assert.equal(s.brands.size, 0);
    assert.equal(s.priceRange, null);
    assert.deepEqual(s.includeMissing, { size: false, brand: false, price: false });
});

test("emptyFilterState returns a new object each call (no shared refs)", () => {
    const a = emptyFilterState();
    const b = emptyFilterState();
    a.sizes.add("M");
    a.includeMissing.size = true;
    assert.equal(b.sizes.size, 0);
    assert.equal(b.includeMissing.size, false);
});

test("deriveFilterOptions on empty array returns empty options and null bounds", () => {
    const opts = deriveFilterOptions([]);
    assert.deepEqual(opts.sizes, []);
    assert.deepEqual(opts.brands, []);
    assert.equal(opts.priceBounds, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/test_results_filters.test.js`
Expected: FAIL with "Cannot find module" / import error.

- [ ] **Step 3: Create minimal `results_filters.js` to make tests pass**

Create `extension/results_filters.js`:

```js
export function emptyFilterState() {
    return {
        sizes: new Set(),
        brands: new Set(),
        priceRange: null,
        includeMissing: { size: false, brand: false, price: false },
    };
}

export function deriveFilterOptions(matches) {
    if (!matches || matches.length === 0) {
        return { sizes: [], brands: [], priceBounds: null };
    }
    return { sizes: [], brands: [], priceBounds: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/test_results_filters.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/results_filters.js tests/test_results_filters.test.js
git commit -m "feat(extension): scaffold results_filters module with emptyFilterState"
```

---

## Task 2: `deriveFilterOptions` — sizes and brands (frequency-then-alpha sort)

**Files:**
- Modify: `extension/results_filters.js`
- Test: `tests/test_results_filters.test.js`

- [ ] **Step 1: Add failing tests for size/brand derivation**

Append to `tests/test_results_filters.test.js`:

```js
test("deriveFilterOptions extracts unique sizes with counts", () => {
    const matches = [
        { size: "M" }, { size: "M" }, { size: "L" }, { size: "S" }, { size: "L" }, { size: "L" },
    ];
    const opts = deriveFilterOptions(matches);
    assert.deepEqual(opts.sizes, [
        { value: "L", count: 3 },
        { value: "M", count: 2 },
        { value: "S", count: 1 },
    ]);
});

test("deriveFilterOptions sorts by frequency desc, then alpha asc on ties", () => {
    const matches = [
        { brand: "Zara" }, { brand: "Acne" }, { brand: "Zara" }, { brand: "Acne" }, { brand: "H&M" },
    ];
    const opts = deriveFilterOptions(matches);
    assert.deepEqual(opts.brands, [
        { value: "Acne", count: 2 },
        { value: "Zara", count: 2 },
        { value: "H&M", count: 1 },
    ]);
});

test("deriveFilterOptions ignores null/empty/undefined size and brand values", () => {
    const matches = [
        { size: "M", brand: "Acne" },
        { size: null, brand: "" },
        { size: "", brand: null },
        { size: undefined, brand: undefined },
        { size: "M", brand: "Acne" },
    ];
    const opts = deriveFilterOptions(matches);
    assert.deepEqual(opts.sizes, [{ value: "M", count: 2 }]);
    assert.deepEqual(opts.brands, [{ value: "Acne", count: 2 }]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/test_results_filters.test.js`
Expected: FAIL on the three new tests (existing 3 still pass).

- [ ] **Step 3: Implement size/brand derivation**

Replace `deriveFilterOptions` in `extension/results_filters.js`:

```js
export function deriveFilterOptions(matches) {
    if (!matches || matches.length === 0) {
        return { sizes: [], brands: [], priceBounds: null };
    }
    return {
        sizes: countAndSort(matches, "size"),
        brands: countAndSort(matches, "brand"),
        priceBounds: null,
    };
}

function countAndSort(matches, field) {
    const counts = new Map();
    for (const m of matches) {
        const v = m[field];
        if (v == null || v === "") continue;
        counts.set(v, (counts.get(v) || 0) + 1);
    }
    return [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/test_results_filters.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/results_filters.js tests/test_results_filters.test.js
git commit -m "feat(extension): derive size/brand filter options sorted by frequency"
```

---

## Task 3: `deriveFilterOptions` — price bounds with floor/ceil rounding

**Files:**
- Modify: `extension/results_filters.js`
- Test: `tests/test_results_filters.test.js`

- [ ] **Step 1: Add failing tests for price bounds**

Append to `tests/test_results_filters.test.js`:

```js
test("deriveFilterOptions returns price bounds with floor/ceil rounding", () => {
    const matches = [
        { price: 149.5 }, { price: 200 }, { price: 79.99 }, { price: 500.01 },
    ];
    const opts = deriveFilterOptions(matches);
    assert.deepEqual(opts.priceBounds, [79, 501]);
});

test("deriveFilterOptions price bounds null when no items have price", () => {
    const matches = [
        { price: null }, { price: undefined }, {},
    ];
    const opts = deriveFilterOptions(matches);
    assert.equal(opts.priceBounds, null);
});

test("deriveFilterOptions price bounds equal when all items same price", () => {
    const matches = [{ price: 100 }, { price: 100 }];
    const opts = deriveFilterOptions(matches);
    assert.deepEqual(opts.priceBounds, [100, 100]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/test_results_filters.test.js`
Expected: FAIL on the three new tests.

- [ ] **Step 3: Implement price bounds**

In `extension/results_filters.js`, replace the body of `deriveFilterOptions` so the return uses a helper:

```js
export function deriveFilterOptions(matches) {
    if (!matches || matches.length === 0) {
        return { sizes: [], brands: [], priceBounds: null };
    }
    return {
        sizes: countAndSort(matches, "size"),
        brands: countAndSort(matches, "brand"),
        priceBounds: derivePriceBounds(matches),
    };
}

function derivePriceBounds(matches) {
    const prices = matches
        .map((m) => m.price)
        .filter((p) => typeof p === "number" && Number.isFinite(p));
    if (prices.length === 0) return null;
    return [Math.floor(Math.min(...prices)), Math.ceil(Math.max(...prices))];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/test_results_filters.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/results_filters.js tests/test_results_filters.test.js
git commit -m "feat(extension): derive price bounds with floor/ceil rounding"
```

---

## Task 4: `applyFilters` — passthrough and single-type narrowing

**Files:**
- Modify: `extension/results_filters.js`
- Test: `tests/test_results_filters.test.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/test_results_filters.test.js`:

```js
import { applyFilters } from "../extension/results_filters.js";

const ITEMS = [
    { id: 1, size: "M", brand: "Acne", price: 100 },
    { id: 2, size: "L", brand: "Zara", price: 200 },
    { id: 3, size: "M", brand: "Zara", price: 300 },
    { id: 4, size: "S", brand: "Acne", price: 400 },
];

test("applyFilters with empty state returns all items as visible", () => {
    const state = emptyFilterState();
    const r = applyFilters(ITEMS, state);
    assert.equal(r.visible.length, 4);
    assert.deepEqual(r.hiddenByMissing, { size: 0, brand: 0, price: 0 });
});

test("applyFilters narrows by single size value", () => {
    const state = emptyFilterState();
    state.sizes.add("M");
    const r = applyFilters(ITEMS, state);
    assert.deepEqual(r.visible.map((i) => i.id), [1, 3]);
});

test("applyFilters narrows by single brand value", () => {
    const state = emptyFilterState();
    state.brands.add("Acne");
    const r = applyFilters(ITEMS, state);
    assert.deepEqual(r.visible.map((i) => i.id), [1, 4]);
});

test("applyFilters narrows by price range (inclusive on both ends)", () => {
    const state = emptyFilterState();
    state.priceRange = [200, 300];
    const r = applyFilters(ITEMS, state);
    assert.deepEqual(r.visible.map((i) => i.id), [2, 3]);
});

test("applyFilters OR within same field", () => {
    const state = emptyFilterState();
    state.sizes.add("M");
    state.sizes.add("L");
    const r = applyFilters(ITEMS, state);
    assert.deepEqual(r.visible.map((i) => i.id), [1, 2, 3]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/test_results_filters.test.js`
Expected: FAIL with "applyFilters is not a function".

- [ ] **Step 3: Implement basic `applyFilters`**

Append to `extension/results_filters.js`:

```js
export function applyFilters(matches, state) {
    const hiddenByMissing = { size: 0, brand: 0, price: 0 };
    const visible = [];
    for (const item of matches) {
        if (!passes(item, state, hiddenByMissing)) continue;
        visible.push(item);
    }
    return { visible, hiddenByMissing };
}

function passes(item, state, hiddenByMissing) {
    if (!passesField(item.size, state.sizes, state.includeMissing.size, "size", hiddenByMissing)) return false;
    if (!passesField(item.brand, state.brands, state.includeMissing.brand, "brand", hiddenByMissing)) return false;
    if (!passesPrice(item.price, state.priceRange, state.includeMissing.price, hiddenByMissing)) return false;
    return true;
}

function passesField(value, selectedSet, includeMissing, fieldName, hiddenByMissing) {
    if (selectedSet.size === 0) return true;
    const isMissing = value == null || value === "";
    if (isMissing) {
        if (includeMissing) return true;
        hiddenByMissing[fieldName] += 1;
        return false;
    }
    return selectedSet.has(value);
}

function passesPrice(price, range, includeMissing, hiddenByMissing) {
    if (range === null) return true;
    const isMissing = typeof price !== "number" || !Number.isFinite(price);
    if (isMissing) {
        if (includeMissing) return true;
        hiddenByMissing.price += 1;
        return false;
    }
    return price >= range[0] && price <= range[1];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/test_results_filters.test.js`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/results_filters.js tests/test_results_filters.test.js
git commit -m "feat(extension): applyFilters narrows by size/brand/price"
```

---

## Task 5: `applyFilters` — missing-field handling and multi-type AND

**Files:**
- Modify: `tests/test_results_filters.test.js`

- [ ] **Step 1: Add tests covering missing-field + AND combinations**

Append to `tests/test_results_filters.test.js`:

```js
const ITEMS_WITH_GAPS = [
    { id: 1, size: "M", brand: "Acne", price: 100 },
    { id: 2, size: null, brand: "Zara", price: 200 },
    { id: 3, size: "M", brand: null, price: null },
    { id: 4, size: "", brand: "Acne", price: 400 },
];

test("applyFilters hides items missing the filtered field by default", () => {
    const state = emptyFilterState();
    state.sizes.add("M");
    const r = applyFilters(ITEMS_WITH_GAPS, state);
    assert.deepEqual(r.visible.map((i) => i.id), [1, 3]);
    assert.equal(r.hiddenByMissing.size, 2);
});

test("applyFilters includes missing items when includeMissing[field] is true", () => {
    const state = emptyFilterState();
    state.sizes.add("M");
    state.includeMissing.size = true;
    const r = applyFilters(ITEMS_WITH_GAPS, state);
    assert.deepEqual(r.visible.map((i) => i.id), [1, 2, 3, 4]);
    assert.equal(r.hiddenByMissing.size, 0);
});

test("applyFilters hides items with missing price under a price filter", () => {
    const state = emptyFilterState();
    state.priceRange = [50, 500];
    const r = applyFilters(ITEMS_WITH_GAPS, state);
    assert.deepEqual(r.visible.map((i) => i.id), [1, 2, 4]);
    assert.equal(r.hiddenByMissing.price, 1);
});

test("applyFilters combines size AND brand AND price (AND across types, OR within)", () => {
    const state = emptyFilterState();
    state.sizes.add("M");
    state.sizes.add("L");
    state.brands.add("Acne");
    state.priceRange = [50, 200];
    const r = applyFilters([
        { id: 1, size: "M", brand: "Acne", price: 100 },
        { id: 2, size: "L", brand: "Acne", price: 300 },
        { id: 3, size: "M", brand: "Zara", price: 150 },
        { id: 4, size: "S", brand: "Acne", price: 100 },
    ], state);
    assert.deepEqual(r.visible.map((i) => i.id), [1]);
});

test("applyFilters on empty matches returns empty visible and zero missing counts", () => {
    const state = emptyFilterState();
    state.sizes.add("M");
    const r = applyFilters([], state);
    assert.deepEqual(r.visible, []);
    assert.deepEqual(r.hiddenByMissing, { size: 0, brand: 0, price: 0 });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node --test tests/test_results_filters.test.js`
Expected: PASS (19 tests). All existing logic already handles these cases — the new tests are coverage assertions, not driving new code.

- [ ] **Step 3: Commit**

```bash
git add tests/test_results_filters.test.js
git commit -m "test(extension): cover missing-field handling and multi-type AND filtering"
```

---

## Task 6: `renderFilterBar` and `renderMissingBanner` pure helpers

**Files:**
- Modify: `extension/results_view.js`
- Modify: `tests/test_results.test.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/test_results.test.js`:

```js
import { renderFilterBar, renderMissingBanner } from "../extension/results_view.js";

const SAMPLE_OPTIONS = {
    sizes: [{ value: "M", count: 3 }, { value: "L", count: 2 }],
    brands: [{ value: "Acne", count: 4 }, { value: "Zara", count: 1 }],
    priceBounds: [100, 500],
};

function freshState() {
    return {
        sizes: new Set(),
        brands: new Set(),
        priceRange: null,
        includeMissing: { size: false, brand: false, price: false },
    };
}

test("renderFilterBar renders three triggers with labels", () => {
    const html = renderFilterBar(freshState(), SAMPLE_OPTIONS);
    assert.match(html, /data-filter="size"/);
    assert.match(html, /data-filter="brand"/);
    assert.match(html, /data-filter="price"/);
});

test("renderFilterBar shows active count badge when filter is active", () => {
    const state = freshState();
    state.sizes.add("M");
    state.sizes.add("L");
    const html = renderFilterBar(state, SAMPLE_OPTIONS);
    assert.match(html, /data-filter="size"[^>]*class="[^"]*is-active/);
    assert.match(html, /Size · 2/);
});

test("renderFilterBar shows clear-all only when at least one filter active", () => {
    const inactive = renderFilterBar(freshState(), SAMPLE_OPTIONS);
    assert.doesNotMatch(inactive, /data-clear-all/);
    const active = freshState();
    active.brands.add("Acne");
    const activeHtml = renderFilterBar(active, SAMPLE_OPTIONS);
    assert.match(activeHtml, /data-clear-all/);
});

test("renderFilterBar disables a trigger whose option list is empty", () => {
    const opts = { sizes: [], brands: [{ value: "Acne", count: 1 }], priceBounds: null };
    const html = renderFilterBar(freshState(), opts);
    assert.match(html, /data-filter="size"[^>]*disabled/);
    assert.match(html, /data-filter="price"[^>]*disabled/);
    assert.doesNotMatch(html, /data-filter="brand"[^>]*disabled/);
});

test("renderFilterBar size popover lists options with counts and reflects checked state", () => {
    const state = freshState();
    state.sizes.add("M");
    const html = renderFilterBar(state, SAMPLE_OPTIONS);
    assert.match(html, /data-size-option="M"[^>]*checked/);
    assert.match(html, /data-size-option="L"/);
    assert.doesNotMatch(html, /data-size-option="L"[^>]*checked/);
    assert.match(html, />M<\/span>\s*<span[^>]*>3</);
});

test("renderFilterBar price popover renders slider with bounds and current range", () => {
    const state = freshState();
    state.priceRange = [150, 400];
    const html = renderFilterBar(state, SAMPLE_OPTIONS);
    assert.match(html, /data-price-min="100"/);
    assert.match(html, /data-price-max="500"/);
    assert.match(html, /data-price-current-min="150"/);
    assert.match(html, /data-price-current-max="400"/);
});

test("renderMissingBanner renders count, field, and show-anyway link", () => {
    const html = renderMissingBanner("size", 3);
    assert.match(html, /3 items hidden/);
    assert.match(html, /missing size/i);
    assert.match(html, /data-show-missing="size"/);
});

test("renderMissingBanner returns empty string for zero count", () => {
    assert.equal(renderMissingBanner("size", 0), "");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/test_results.test.js`
Expected: FAIL with import errors for `renderFilterBar` and `renderMissingBanner`.

- [ ] **Step 3: Implement the helpers**

Append to `extension/results_view.js`:

```js
const FIELD_LABEL = { size: "Size", brand: "Brand", price: "Price" };

export function renderFilterBar(state, options) {
    const sizeActive = state.sizes.size > 0;
    const brandActive = state.brands.size > 0;
    const priceActive = state.priceRange !== null;
    const anyActive = sizeActive || brandActive || priceActive;

    const sizeTrigger = renderTrigger({
        field: "size",
        active: sizeActive,
        count: state.sizes.size,
        disabled: options.sizes.length === 0,
    });
    const brandTrigger = renderTrigger({
        field: "brand",
        active: brandActive,
        count: state.brands.size,
        disabled: options.brands.length === 0,
    });
    const priceTrigger = renderTrigger({
        field: "price",
        active: priceActive,
        count: priceActive ? 1 : 0,
        disabled: options.priceBounds === null,
    });

    const sizePopover = renderCheckboxPopover("size", options.sizes, state.sizes);
    const brandPopover = renderCheckboxPopover("brand", options.brands, state.brands);
    const pricePopover = renderPricePopover(options.priceBounds, state.priceRange);

    const clearAll = anyActive
        ? `<button class="filter-clear-all" data-clear-all type="button">Clear all</button>`
        : "";

    return `
        <div class="filter-bar-inner">
            <div class="filter-control" data-control="size">${sizeTrigger}${sizePopover}</div>
            <div class="filter-control" data-control="brand">${brandTrigger}${brandPopover}</div>
            <div class="filter-control" data-control="price">${priceTrigger}${pricePopover}</div>
            ${clearAll}
        </div>
    `;
}

function renderTrigger({ field, active, count, disabled }) {
    const label = FIELD_LABEL[field];
    const cls = ["filter-trigger"];
    if (active) cls.push("is-active");
    const badge = active && count > 0 && field !== "price" ? ` · ${count}` : (active && field === "price" ? " · ✓" : "");
    const disabledAttr = disabled ? "disabled" : "";
    return `<button type="button" class="${cls.join(" ")}" data-filter="${field}" ${disabledAttr}>${escapeHtml(label)}${escapeHtml(badge)}</button>`;
}

function renderCheckboxPopover(field, options, selectedSet) {
    if (options.length === 0) return "";
    const items = options.map((o) => {
        const checked = selectedSet.has(o.value) ? "checked" : "";
        return `
            <label class="filter-option">
                <input type="checkbox" data-${field}-option="${escapeHtml(o.value)}" ${checked} />
                <span>${escapeHtml(o.value)}</span>
                <span class="filter-option-count">${o.count}</span>
            </label>
        `;
    }).join("");
    return `<div class="filter-popover" data-popover-for="${field}" hidden>${items}</div>`;
}

function renderPricePopover(bounds, range) {
    if (bounds === null) return "";
    const [lo, hi] = bounds;
    const [curLo, curHi] = range || [lo, hi];
    return `
        <div class="filter-popover" data-popover-for="price" hidden>
            <div class="price-slider"
                 data-price-min="${lo}"
                 data-price-max="${hi}"
                 data-price-current-min="${curLo}"
                 data-price-current-max="${curHi}">
                <input type="range" class="price-range-lo" min="${lo}" max="${hi}" value="${curLo}" />
                <input type="range" class="price-range-hi" min="${lo}" max="${hi}" value="${curHi}" />
                <div class="price-readout"><span class="price-lo">${curLo}</span> – <span class="price-hi">${curHi}</span> kr</div>
            </div>
        </div>
    `;
}

export function renderMissingBanner(field, count) {
    if (!count || count <= 0) return "";
    const label = FIELD_LABEL[field].toLowerCase();
    return `
        <div class="missing-banner" data-missing-banner="${field}">
            ${count} items hidden (missing ${escapeHtml(label)})
            <button type="button" class="missing-show-anyway" data-show-missing="${field}">show anyway</button>
        </div>
    `;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/test_results.test.js`
Expected: PASS (16 tests — 8 original + 8 new).

- [ ] **Step 5: Commit**

```bash
git add extension/results_view.js tests/test_results.test.js
git commit -m "feat(extension): pure renderFilterBar and renderMissingBanner helpers"
```

---

## Task 7: Add filter-bar containers to `results.html`

**Files:**
- Modify: `extension/results.html`

- [ ] **Step 1: Update `results.html`**

In `extension/results.html`, replace the block between `<div id="debug-info" ...></div>` and `<main id="results">` so it reads:

```html
<div id="debug-info" class="debug-info" hidden></div>
<div id="filter-bar" class="filter-bar" hidden></div>
<div id="missing-banner-host" class="missing-banner-host"></div>
<main id="results">
```

(Existing `<main id="results">` content and the script tag remain unchanged.)

- [ ] **Step 2: Manual sanity check**

Load the extension in Chrome (`chrome://extensions` → Load unpacked → select `extension/`) and trigger a lookup. The filter bar div exists in DOM but is hidden — page should look identical to before.

- [ ] **Step 3: Commit**

```bash
git add extension/results.html
git commit -m "feat(extension): add filter-bar and missing-banner containers to results.html"
```

---

## Task 8: Wire filter state and rendering into `results.js`

**Files:**
- Modify: `extension/results.js`

- [ ] **Step 1: Replace `results.js` with wired-up version**

Replace `extension/results.js` entirely with:

```js
import { renderCard, renderDebugInfo, renderFilterBar, renderMissingBanner, isDebugEnabled, escapeHtml } from "./results_view.js";
import { emptyFilterState, deriveFilterOptions, applyFilters } from "./results_filters.js";

const DEBUG_STORAGE_KEY = "sellpy:results:debug";

const params = new URLSearchParams(window.location.search);
const requestId = params.get("id");

const queryThumbEl = document.getElementById("query-thumb");
const resultsEl = document.getElementById("results");
const debugToggleEl = document.getElementById("debug-toggle");
const debugInfoEl = document.getElementById("debug-info");
const filterBarEl = document.getElementById("filter-bar");
const missingBannerHostEl = document.getElementById("missing-banner-host");

let debugOn = isDebugEnabled(window.location.search, readDebugStored());
let filterState = emptyFilterState();
let lastMatches = null;
let lastOptions = null;

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
        filterBarEl.hidden = true;
        missingBannerHostEl.innerHTML = "";
        return;
    }

    if (data.queryImage) {
        queryThumbEl.innerHTML = `<img src="${escapeHtml(data.queryImage)}" alt="" />`;
    }

    if (data.status === "loading") {
        if (!resultsEl.querySelector(".skeleton-grid")) {
            resultsEl.innerHTML = skeletonGrid();
        }
        debugInfoEl.hidden = true;
        filterBarEl.hidden = true;
        missingBannerHostEl.innerHTML = "";
        return;
    }
    if (data.status === "error") {
        resultsEl.innerHTML = `<p class="status">Couldn't find matches. ${escapeHtml(data.error || "Try again.")}</p>`;
        debugInfoEl.hidden = true;
        filterBarEl.hidden = true;
        missingBannerHostEl.innerHTML = "";
        return;
    }
    if (data.status === "ok") {
        if (!data.matches || data.matches.length === 0) {
            resultsEl.innerHTML = `<p class="status">No matches.</p>`;
            debugInfoEl.hidden = true;
            filterBarEl.hidden = true;
            missingBannerHostEl.innerHTML = "";
            return;
        }

        lastMatches = data.matches;
        lastOptions = deriveFilterOptions(data.matches);
        pruneStateAgainstOptions(filterState, lastOptions);

        const { visible, hiddenByMissing } = applyFilters(data.matches, filterState);

        filterBarEl.innerHTML = renderFilterBar(filterState, lastOptions);
        filterBarEl.hidden = false;

        renderMissingBanners(hiddenByMissing);
        renderGrid(visible);
        renderDebugBar(data, visible.length);
        attachObjectidCopy();
    }
}

function pruneStateAgainstOptions(state, options) {
    const validSizes = new Set(options.sizes.map((o) => o.value));
    for (const v of [...state.sizes]) if (!validSizes.has(v)) state.sizes.delete(v);
    const validBrands = new Set(options.brands.map((o) => o.value));
    for (const v of [...state.brands]) if (!validBrands.has(v)) state.brands.delete(v);
    if (state.priceRange !== null && options.priceBounds === null) {
        state.priceRange = null;
    }
}

function renderGrid(visible) {
    if (visible.length === 0) {
        resultsEl.innerHTML = `
            <p class="status">No items match these filters.</p>
            <button type="button" class="filter-clear-all" data-clear-all>Clear filters</button>
        `;
        return;
    }
    const cards = visible.map((m) => renderCard(m, { debug: debugOn })).join("");
    resultsEl.innerHTML = `<div class="grid">${cards}</div>`;
}

function renderMissingBanners(hiddenByMissing) {
    const parts = [];
    for (const field of ["size", "brand", "price"]) {
        if (hiddenByMissing[field] > 0 && !filterState.includeMissing[field]) {
            parts.push(renderMissingBanner(field, hiddenByMissing[field]));
        }
    }
    missingBannerHostEl.innerHTML = parts.join("");
}

function renderDebugBar(data, visibleCount) {
    if (!debugOn) {
        debugInfoEl.hidden = true;
        return;
    }
    debugInfoEl.innerHTML = renderDebugInfo({
        queryImage: data.queryImage,
        topK: data.topK ?? data.matches?.length ?? null,
        matchCount: visibleCount,
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

- [ ] **Step 2: Manual sanity check**

Reload the extension and trigger a lookup. The filter bar should now render with three triggers; no popovers open yet (next task), no interactions wired — but the bar appears, results show through, and clicking triggers does nothing yet.

- [ ] **Step 3: Commit**

```bash
git add extension/results.js
git commit -m "feat(extension): wire filter state into render pipeline (display only)"
```

---

## Task 9: Wire popover open/close + outside-click + Esc

**Files:**
- Modify: `extension/results.js`

- [ ] **Step 1: Add popover event wiring**

Insert this block at the end of `extension/results.js` (after the existing helper functions):

```js
let openPopover = null;

filterBarEl.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-filter]");
    if (trigger && !trigger.disabled) {
        e.stopPropagation();
        const field = trigger.dataset.filter;
        togglePopover(field);
        return;
    }
    if (e.target.closest(".filter-popover")) {
        e.stopPropagation();
    }
});

document.addEventListener("click", () => closePopover());
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePopover();
});

function togglePopover(field) {
    if (openPopover === field) {
        closePopover();
        return;
    }
    closePopover();
    const el = filterBarEl.querySelector(`.filter-popover[data-popover-for="${field}"]`);
    if (!el) return;
    el.hidden = false;
    openPopover = field;
}

function closePopover() {
    if (!openPopover) return;
    const el = filterBarEl.querySelector(`.filter-popover[data-popover-for="${openPopover}"]`);
    if (el) el.hidden = true;
    openPopover = null;
}
```

- [ ] **Step 2: Manual sanity check**

Reload the extension and trigger a lookup. Click Size — popover opens. Click outside — popover closes. Click Brand — Size popover closes and Brand opens. Press Esc — closes. Disabled triggers do nothing.

- [ ] **Step 3: Commit**

```bash
git add extension/results.js
git commit -m "feat(extension): popover open/close with outside-click and Esc"
```

---

## Task 10: Wire checkbox events (size + brand) and clear-all + show-missing

**Files:**
- Modify: `extension/results.js`

- [ ] **Step 1: Add change/click event wiring inside the filter bar**

Append to `extension/results.js`:

```js
filterBarEl.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.sizeOption !== undefined) {
        toggleSet(filterState.sizes, el.dataset.sizeOption, el.checked);
        render();
        return;
    }
    if (el.dataset.brandOption !== undefined) {
        toggleSet(filterState.brands, el.dataset.brandOption, el.checked);
        render();
        return;
    }
});

document.body.addEventListener("click", (e) => {
    if (e.target.matches("[data-clear-all]")) {
        filterState = emptyFilterState();
        render();
        return;
    }
});

missingBannerHostEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-show-missing]");
    if (!btn) return;
    const field = btn.dataset.showMissing;
    filterState.includeMissing[field] = true;
    render();
});

function toggleSet(set, value, on) {
    if (on) set.add(value); else set.delete(value);
}
```

- [ ] **Step 2: Manual sanity check**

Reload extension, trigger a lookup. Open Size popover, check a size — grid narrows, trigger shows `Size · 1`, "Clear all" appears. Check another size — grid OR-expands within size. Open Brand, check a brand — grid narrows by AND. Click "Clear all" — all filters reset, grid shows everything. If results contain items missing a size, after applying a size filter the missing-banner should appear; clicking "show anyway" re-includes them.

> Note: the popover stays open while clicking checkboxes because the `click` listener on `filterBarEl` calls `stopPropagation` on clicks inside `.filter-popover`, preventing the document-level close handler from firing. After `render()` re-creates the popover DOM, we need to reopen it. Handle that in the next step before re-testing.

- [ ] **Step 3: Preserve open popover across re-renders**

In the `render()` function in `extension/results.js`, find the line:

```js
filterBarEl.innerHTML = renderFilterBar(filterState, lastOptions);
```

Replace with:

```js
const previouslyOpen = openPopover;
filterBarEl.innerHTML = renderFilterBar(filterState, lastOptions);
if (previouslyOpen) {
    const el = filterBarEl.querySelector(`.filter-popover[data-popover-for="${previouslyOpen}"]`);
    if (el) {
        el.hidden = false;
    } else {
        openPopover = null;
    }
}
```

- [ ] **Step 4: Manual sanity check (re-run)**

Reload and repeat Step 2 checks. The Size popover stays open between checkbox clicks; the count badge updates live.

- [ ] **Step 5: Commit**

```bash
git add extension/results.js
git commit -m "feat(extension): wire size/brand checkboxes, clear-all, show-missing"
```

---

## Task 11: Wire price-range slider

**Files:**
- Modify: `extension/results.js`

- [ ] **Step 1: Add slider event wiring**

Append to `extension/results.js`:

```js
filterBarEl.addEventListener("input", (e) => {
    if (!e.target.classList.contains("price-range-lo") && !e.target.classList.contains("price-range-hi")) return;
    const slider = e.target.closest(".price-slider");
    if (!slider) return;
    const min = Number(slider.dataset.priceMin);
    const max = Number(slider.dataset.priceMax);
    const loInput = slider.querySelector(".price-range-lo");
    const hiInput = slider.querySelector(".price-range-hi");
    let lo = Number(loInput.value);
    let hi = Number(hiInput.value);
    if (lo > hi) {
        if (e.target === loInput) lo = hi; else hi = lo;
        loInput.value = String(lo);
        hiInput.value = String(hi);
    }
    slider.querySelector(".price-lo").textContent = String(lo);
    slider.querySelector(".price-hi").textContent = String(hi);
    slider.dataset.priceCurrentMin = String(lo);
    slider.dataset.priceCurrentMax = String(hi);
    if (lo === min && hi === max) {
        filterState.priceRange = null;
    } else {
        filterState.priceRange = [lo, hi];
    }
});

filterBarEl.addEventListener("change", (e) => {
    if (!e.target.classList.contains("price-range-lo") && !e.target.classList.contains("price-range-hi")) return;
    render();
});
```

- [ ] **Step 2: Manual sanity check**

Reload, trigger a lookup, open Price. Drag handles — readout updates live. Release — grid re-filters. Drag fully to the bounds — filter becomes inactive (trigger badge disappears). "Clear all" resets the slider.

- [ ] **Step 3: Commit**

```bash
git add extension/results.js
git commit -m "feat(extension): wire price range slider with clamped handles"
```

---

## Task 12: Reset filter state on new search

**Files:**
- Modify: `extension/results.js`

- [ ] **Step 1: Reset on storage update when matches identity changes**

The current implementation reuses `filterState` across re-renders. For a *new search*, `requestId` would also change → reload the page → fresh module → fresh state. That covers the normal case. But the storage listener also re-fires when an in-flight `loading` row flips to `ok`. We must NOT reset in that case.

The natural reset boundary is "matches reference changed AND a previous matches existed." Add a small check.

In `extension/results.js`, find:

```js
lastMatches = data.matches;
lastOptions = deriveFilterOptions(data.matches);
pruneStateAgainstOptions(filterState, lastOptions);
```

Replace with:

```js
const isNewMatchSet = lastMatches !== null && lastMatches !== data.matches;
lastMatches = data.matches;
lastOptions = deriveFilterOptions(data.matches);
if (isNewMatchSet) {
    filterState = emptyFilterState();
} else {
    pruneStateAgainstOptions(filterState, lastOptions);
}
```

- [ ] **Step 2: Manual sanity check**

Trigger a lookup, apply filters, then trigger another lookup on the same page (if the extension supports it) — filters reset. For typical extension flow where each lookup opens a new tab, the page reloads anyway, so this is a defensive path. Verified mentally by code review.

- [ ] **Step 3: Commit**

```bash
git add extension/results.js
git commit -m "feat(extension): reset filter state when match set changes within a tab"
```

---

## Task 13: CSS for filter bar, triggers, popovers, slider, banner

**Files:**
- Modify: `extension/results.css`

- [ ] **Step 1: Read current CSS to align with existing tokens**

Run: `wc -l extension/results.css`
Then open the file and note the variables defined (e.g., `--sellpy-*` color tokens, spacing scale). Use the same tokens below — if a token name in this plan doesn't exist in the file, substitute the nearest equivalent.

- [ ] **Step 2: Append filter-bar styles to `extension/results.css`**

Append (do not replace existing styles):

```css
/* ----- Filter bar ----- */
.filter-bar {
    padding: 12px 16px;
    border-bottom: 1px solid var(--sellpy-border, #e5e5e5);
    background: var(--sellpy-bg, #fff);
    position: relative;
    z-index: 10;
}
.filter-bar[hidden] { display: none; }

.filter-bar-inner {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.filter-control { position: relative; }

.filter-trigger {
    appearance: none;
    border: 1px solid var(--sellpy-border, #e5e5e5);
    background: var(--sellpy-bg, #fff);
    border-radius: 999px;
    padding: 6px 14px;
    font: inherit;
    cursor: pointer;
    color: inherit;
}
.filter-trigger:hover:not(:disabled) {
    background: var(--sellpy-bg-hover, #f7f7f7);
}
.filter-trigger:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}
.filter-trigger.is-active {
    background: var(--sellpy-accent, #111);
    color: var(--sellpy-accent-fg, #fff);
    border-color: var(--sellpy-accent, #111);
}

.filter-clear-all {
    margin-left: auto;
    appearance: none;
    background: transparent;
    border: none;
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
    color: inherit;
    padding: 6px 8px;
}

/* ----- Popover ----- */
.filter-popover {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 220px;
    background: var(--sellpy-bg, #fff);
    border: 1px solid var(--sellpy-border, #e5e5e5);
    border-radius: 8px;
    padding: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    z-index: 20;
    max-height: 320px;
    overflow-y: auto;
}
.filter-popover[hidden] { display: none; }

.filter-option {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 8px;
    align-items: center;
    padding: 6px 8px;
    cursor: pointer;
    border-radius: 4px;
}
.filter-option:hover { background: var(--sellpy-bg-hover, #f7f7f7); }
.filter-option input { margin: 0; }
.filter-option-count {
    color: var(--sellpy-muted, #888);
    font-variant-numeric: tabular-nums;
}

/* ----- Price slider ----- */
.price-slider {
    padding: 8px;
    min-width: 240px;
}
.price-slider input[type="range"] {
    width: 100%;
    margin: 4px 0;
}
.price-readout {
    text-align: center;
    margin-top: 6px;
    font-variant-numeric: tabular-nums;
}

/* ----- Missing-field banner ----- */
.missing-banner-host:empty { display: none; }
.missing-banner {
    padding: 8px 16px;
    background: var(--sellpy-bg-hover, #fafafa);
    border-bottom: 1px solid var(--sellpy-border, #e5e5e5);
    font-size: 14px;
    color: var(--sellpy-muted, #555);
}
.missing-show-anyway {
    appearance: none;
    background: transparent;
    border: none;
    text-decoration: underline;
    cursor: pointer;
    color: inherit;
    font: inherit;
    margin-left: 4px;
}
```

- [ ] **Step 3: Manual sanity check**

Reload the extension. Filter bar should match the rest of the page visually — same border colour, same font, rounded pill triggers. Open each popover, drag the slider, check spacing and hover states.

- [ ] **Step 4: Commit**

```bash
git add extension/results.css
git commit -m "feat(extension): style filter bar, popovers, slider, missing banner"
```

---

## Task 14: Final manual QA pass

**Files:** none (verification only)

- [ ] **Step 1: Run all unit tests**

Run: `node --test tests/test_results.test.js tests/test_results_filters.test.js`
Expected: all tests PASS (16 + 19 = 35 tests).

- [ ] **Step 2: Manual browser QA**

Load the extension and run through this checklist on a real lookup:

- [ ] Filter bar renders with three triggers and (initially) no "Clear all".
- [ ] Open each popover; click outside closes it; Esc closes it.
- [ ] Size: check two sizes → grid narrows (OR within size), badge shows `Size · 2`.
- [ ] Size + Brand combination: grid narrows by AND across types.
- [ ] Price slider: drag handles, readout updates live, release re-filters.
- [ ] Drag price handles fully to bounds → filter deactivates (badge disappears).
- [ ] Trigger a filter that drops a missing-field item → banner appears with correct count.
- [ ] Click "show anyway" → item reappears, banner disappears.
- [ ] Filter combination matches zero items → "No items match these filters." message + Clear filters button.
- [ ] "Clear all" resets everything and shows the full grid.
- [ ] If the result set has only one brand, the Brand trigger still works (single-option popover).
- [ ] If no result has a price, the Price trigger is disabled with `No data` (visible by hovering; tooltip uses native `title`).

> If the disabled-trigger tooltip is missing, add `title="No data"` to the trigger element conditionally in `renderTrigger`. (Optional polish, not blocking.)

- [ ] **Step 3: Final commit if any polish was needed**

If you made small fixes during QA:

```bash
git add -p
git commit -m "fix(extension): QA polish for filter bar"
```

Otherwise skip.

---

## Done

All filter behavior wired end-to-end with unit tests for pure logic and manual QA for DOM/UX. No backend changes. No persistence. Filters reset on new search via page reload.
