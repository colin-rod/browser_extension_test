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
    assert.doesNotMatch(html, /debug-objectid/);
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
    assert.match(html, /similarity 0\.\d{3}/);
    assert.match(html, /abc-123/);
});

test("isDebugEnabled honors URL param ?debug=1", () => {
    assert.equal(isDebugEnabled("?debug=1", null), true);
    assert.equal(isDebugEnabled("?debug=0", "1"), false);
    assert.equal(isDebugEnabled("", "1"), true);
    assert.equal(isDebugEnabled("", null), false);
    assert.equal(isDebugEnabled("", "0"), false);
});
