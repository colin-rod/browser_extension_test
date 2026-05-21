import { test } from "node:test";
import assert from "node:assert/strict";

import {
    escapeHtml,
    renderCard,
    renderDebugInfo,
    isDebugEnabled,
} from "../extension/results_view.js";

test("escapeHtml escapes HTML special chars", () => {
    assert.equal(escapeHtml("<b>&\"'"), "&lt;b&gt;&amp;&quot;&#39;");
});

test("renderCard shows brand, category, size (no price in UI)", () => {
    const html = renderCard({
        objectid: "abc",
        category: "Sweaters & Cardigans",
        category_1: "Clothing",
        image_url: "https://img/1.jpg",
        product_url: "https://www.sellpy.se/item/abc",
        brand: "Acne",
        size: "M",
        price: 149.0,
        score: 0.771,
    }, { debug: false });
    assert.match(html, /Acne/);
    assert.match(html, /Sweaters &amp; Cardigans/);
    assert.match(html, />M</);
    assert.doesNotMatch(html, /149/);
    assert.doesNotMatch(html, /kr/);
    assert.doesNotMatch(html, /0\.771/);
    assert.doesNotMatch(html, /debug-objectid/);
});

test("renderCard falls back to category in brand slot when brand missing", () => {
    const html = renderCard({
        objectid: "abc",
        category: "Dresses",
        category_1: "Clothing",
        image_url: "https://img/1.jpg",
        product_url: "https://p",
        brand: null,
        size: "M",
        price: null,
        score: 0.5,
    }, { debug: false });
    assert.match(html, /class="brand">Dresses</);
    const categoryLineMatches = html.match(/class="category"/g) || [];
    assert.equal(categoryLineMatches.length, 0);
});

test("renderCard omits size row when size is null", () => {
    const html = renderCard({
        objectid: "abc",
        category: "Dresses",
        category_1: "Clothing",
        image_url: "https://img/1.jpg",
        product_url: "https://p",
        brand: "Acne",
        size: null,
        price: null,
        score: 0.5,
    }, { debug: false });
    assert.doesNotMatch(html, /class="size-row"/);
    assert.doesNotMatch(html, /class="size-pill"/);
});

test("renderCard prefers match.category over match.category_1 (finer wins)", () => {
    const html = renderCard({
        objectid: "abc",
        category: "Dresses",
        category_1: "Clothing",
        image_url: "https://img/1.jpg",
        product_url: "https://p",
        brand: "Acne",
        size: "M",
        price: null,
        score: 0.5,
    }, { debug: false });
    assert.match(html, /class="category">Dresses</);
    assert.doesNotMatch(html, />Clothing</);
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
    assert.match(html, /similarity 0\.\d{3}/);
    assert.match(html, /abc-123/);
});

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

test("isDebugEnabled honors URL param ?debug=1", () => {
    assert.equal(isDebugEnabled("?debug=1", null), true);
    assert.equal(isDebugEnabled("?debug=0", "1"), false);
    assert.equal(isDebugEnabled("", "1"), true);
    assert.equal(isDebugEnabled("", null), false);
    assert.equal(isDebugEnabled("", "0"), false);
});

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
