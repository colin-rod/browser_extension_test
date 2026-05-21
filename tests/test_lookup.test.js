import { test } from "node:test";
import assert from "node:assert/strict";

import { findSimilarWith } from "../extension/lookup.js";

test("findSimilarWith returns matches on success", async () => {
    const fakeMatches = [
        { objectid: "abc", category: "Dresses", image_url: "u1", product_url: "p1", score: 0.9 },
    ];
    const fakeFetch = async (url, opts) => ({
        ok: true,
        status: 200,
        json: async () => ({ matches: fakeMatches }),
    });
    const result = await findSimilarWith(fakeFetch, "https://endpoint", "https://q.jpg", 5);
    assert.deepEqual(result, fakeMatches);
});

test("findSimilarWith throws on non-OK response", async () => {
    const fakeFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    await assert.rejects(
        () => findSimilarWith(fakeFetch, "https://endpoint", "https://q.jpg", 5),
        /500/,
    );
});

test("findSimilarWith throws on missing matches field", async () => {
    const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
    await assert.rejects(
        () => findSimilarWith(fakeFetch, "https://endpoint", "https://q.jpg", 5),
    );
});
