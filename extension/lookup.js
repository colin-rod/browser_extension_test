import { ENDPOINT_URL } from "./config.js";

export async function findSimilar(options) {
    return findSimilarWith(fetch, ENDPOINT_URL, options);
}

export async function findSimilarWith(fetchImpl, endpointUrl, options) {
    const { imageUrl, imageBytes, topK = 10 } = options || {};
    const hasUrl = typeof imageUrl === "string" && imageUrl.length > 0;
    const hasBytes = typeof imageBytes === "string" && imageBytes.length > 0;
    if (hasUrl === hasBytes) {
        throw new Error("findSimilar: provide exactly one of imageUrl or imageBytes");
    }

    const body = { top_k: topK };
    if (hasUrl) body.image_url = imageUrl;
    if (hasBytes) body.image_bytes = imageBytes;

    const response = await fetchImpl(endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`Endpoint returned ${response.status}`);
    }
    const responseBody = await response.json();
    if (!Array.isArray(responseBody.matches)) {
        throw new Error("Endpoint response missing matches array");
    }
    return responseBody.matches;
}
