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
