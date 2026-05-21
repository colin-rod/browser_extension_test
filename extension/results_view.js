export function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
}

export function formatPrice(price) {
    if (price === null || price === undefined) return "";
    return `${Math.round(price)} kr`;
}

export function isDebugEnabled(search, stored) {
    const params = new URLSearchParams(search || "");
    if (params.has("debug")) {
        return params.get("debug") === "1";
    }
    return stored === "1";
}

export function renderCard(match, { debug }) {
    const hasBrand = match.brand && match.brand.length > 0;
    const brandText = hasBrand ? match.brand : (match.category_1 || "Item");
    const showCategoryLine = hasBrand && match.category_1;
    const priceText = formatPrice(match.price);
    const hasSize = match.size && match.size.length > 0;
    const showPriceRow = priceText.length > 0 || hasSize;

    const debugOverlay = debug
        ? `<div class="debug-overlay">similarity ${match.score.toFixed(3)} · <span class="debug-objectid">${escapeHtml(match.objectid)}</span></div>`
        : "";

    const categoryLine = showCategoryLine
        ? `<div class="category">${escapeHtml(match.category_1)}</div>`
        : "";

    const priceRow = showPriceRow
        ? `<div class="price-row">
            ${priceText ? `<span class="price">${escapeHtml(priceText)}</span>` : `<span class="price"></span>`}
            ${hasSize ? `<span class="size-pill">${escapeHtml(match.size)}</span>` : ""}
        </div>`
        : "";

    return `
        <a class="card" href="${escapeHtml(match.product_url)}" target="_blank" rel="noopener">
            <div class="image-plate">
                <img src="${escapeHtml(match.image_url)}" alt="${escapeHtml(brandText)}" loading="lazy" />
                ${debugOverlay}
            </div>
            <div class="meta">
                <div class="brand">${escapeHtml(brandText)}</div>
                ${categoryLine}
                ${priceRow}
            </div>
        </a>
    `;
}

export function renderDebugInfo({ queryImage, topK, matchCount, timestamp }) {
    return `
        <dt>query</dt><dd class="url" title="${escapeHtml(queryImage || "")}" data-url="${escapeHtml(queryImage || "")}">${escapeHtml(queryImage || "—")}</dd>
        <dt>top_k</dt><dd>${escapeHtml(String(topK ?? "—"))}</dd>
        <dt>matches</dt><dd>${escapeHtml(String(matchCount ?? "—"))}</dd>
        <dt>at</dt><dd>${escapeHtml(timestamp || "—")}</dd>
    `;
}
