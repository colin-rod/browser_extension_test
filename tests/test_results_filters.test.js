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
