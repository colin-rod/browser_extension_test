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
