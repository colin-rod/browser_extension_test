export function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
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
    const categoryDisplay = match.category || match.category_1 || null;
    const brandText = hasBrand ? match.brand : (categoryDisplay || "Item");
    const showCategoryLine = hasBrand && categoryDisplay;
    const hasSize = match.size && match.size.length > 0;

    const debugOverlay = debug
        ? `<div class="debug-overlay">similarity ${match.score.toFixed(3)} · <span class="debug-objectid">${escapeHtml(match.objectid)}</span></div>`
        : "";

    const categoryLine = showCategoryLine
        ? `<div class="category">${escapeHtml(categoryDisplay)}</div>`
        : "";

    const sizeRow = hasSize
        ? `<div class="size-row"><span class="size-pill">${escapeHtml(match.size)}</span></div>`
        : "";

    return `
        <a class="card" href="${escapeHtml(match.product_url)}" target="_blank" rel="noopener">
            <div class="image-plate">
                <img src="${escapeHtml(match.image_url)}" alt="${escapeHtml(brandText)}" loading="lazy" />
                ${debugOverlay}
            </div>
            <div class="meta">
                <div class="brand"><span class="brand-text">${escapeHtml(brandText)}</span><span class="card-open-icon" aria-hidden="true"><svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 2.5h-2v7h7v-2"/><path d="M7 2.5h2.5V5"/><path d="M5.5 6.5l4-4"/></svg></span></div>
                ${categoryLine}
                ${sizeRow}
            </div>
        </a>
    `;
}

const FIELD_LABEL = { size: "Size", brand: "Brand", price: "Price" };

export function renderFilterBar(state, options, { hasQueryImage = false, refineOpen = false } = {}) {
    const sizeActive = state.sizes.size > 0;
    const brandActive = state.brands.size > 0;
    const priceActive = state.priceRange !== null;
    const anyActive = sizeActive || brandActive || priceActive;

    const refineTrigger = `<button type="button" data-refine class="filter-trigger refine-trigger${refineOpen ? " is-active" : ""}"${hasQueryImage ? "" : " disabled"}>Refine search</button>`;

    const sizeTrigger = renderTrigger({
        field: "size",
        active: sizeActive,
        count: state.sizes.size,
        disabled: options.sizes.length === 0,
    });
    const brandTrigger = renderTrigger({
        field: "brand",
        active: brandActive,
        count: state.brands.size,
        disabled: options.brands.length === 0,
    });
    const priceTrigger = renderTrigger({
        field: "price",
        active: priceActive,
        count: priceActive ? 1 : 0,
        disabled: options.priceBounds === null,
    });

    const sizePopover = renderCheckboxPopover("size", options.sizes, state.sizes);
    const brandPopover = renderCheckboxPopover("brand", options.brands, state.brands);
    const pricePopover = renderPricePopover(options.priceBounds, state.priceRange);

    const clearAll = anyActive
        ? `<button class="filter-clear-all" data-clear-all type="button">Clear all</button>`
        : "";

    return `
        <div class="filter-bar-inner">
            <div class="filter-control" data-control="refine">${refineTrigger}</div>
            <div class="filter-control" data-control="size">${sizeTrigger}${sizePopover}</div>
            <div class="filter-control" data-control="brand">${brandTrigger}${brandPopover}</div>
            <div class="filter-control" data-control="price">${priceTrigger}${pricePopover}</div>
            ${clearAll}
        </div>
    `;
}

function renderTrigger({ field, active, count, disabled }) {
    const label = FIELD_LABEL[field];
    const cls = ["filter-trigger"];
    if (active) cls.push("is-active");
    const badge = active && count > 0 && field !== "price" ? ` · ${count}` : (active && field === "price" ? " · ✓" : "");
    const disabledAttr = disabled ? "disabled" : "";
    return `<button type="button" data-filter="${field}" class="${cls.join(" ")}" ${disabledAttr}>${escapeHtml(label)}${escapeHtml(badge)}</button>`;
}

function renderCheckboxPopover(field, options, selectedSet) {
    if (options.length === 0) return "";
    const items = options.map((o) => {
        const checked = selectedSet.has(o.value) ? "checked" : "";
        return `
            <label class="filter-option">
                <input type="checkbox" data-${field}-option="${escapeHtml(o.value)}" ${checked} />
                <span>${escapeHtml(o.value)}</span>
                <span class="filter-option-count">${o.count}</span>
            </label>
        `;
    }).join("");
    return `<div class="filter-popover" data-popover-for="${field}" hidden>${items}</div>`;
}

function renderPricePopover(bounds, range) {
    if (bounds === null) return "";
    const [lo, hi] = bounds;
    const [curLo, curHi] = range || [lo, hi];
    return `
        <div class="filter-popover" data-popover-for="price" hidden>
            <div class="price-slider"
                 data-price-min="${lo}"
                 data-price-max="${hi}"
                 data-price-current-min="${curLo}"
                 data-price-current-max="${curHi}">
                <input type="range" class="price-range-lo" min="${lo}" max="${hi}" value="${curLo}" />
                <input type="range" class="price-range-hi" min="${lo}" max="${hi}" value="${curHi}" />
                <div class="price-readout"><span class="price-lo">${curLo}</span> – <span class="price-hi">${curHi}</span> kr</div>
            </div>
        </div>
    `;
}

export function renderMissingBanner(field, count) {
    if (!count || count <= 0) return "";
    const label = FIELD_LABEL[field].toLowerCase();
    return `
        <div class="missing-banner" data-missing-banner="${field}">
            ${count} items hidden (missing ${escapeHtml(label)})
            <button type="button" class="missing-show-anyway" data-show-missing="${field}">show anyway</button>
        </div>
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
