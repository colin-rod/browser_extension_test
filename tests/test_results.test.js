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
