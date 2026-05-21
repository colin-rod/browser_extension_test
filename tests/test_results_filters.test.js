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
