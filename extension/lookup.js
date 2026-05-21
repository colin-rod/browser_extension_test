import { ENDPOINT_URL } from "./config.js";

export async function findSimilar(imageUrl, topK = 10) {
    return findSimilarWith(fetch, ENDPOINT_URL, imageUrl, topK);
}

export async function findSimilarWith(fetchImpl, endpointUrl, imageUrl, topK) {
    const response = await fetchImpl(endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl, top_k: topK }),
    });
    if (!response.ok) {
        throw new Error(`Endpoint returned ${response.status}`);
    }
    const body = await response.json();
    if (!Array.isArray(body.matches)) {
        throw new Error("Endpoint response missing matches array");
    }
    return body.matches;
}
