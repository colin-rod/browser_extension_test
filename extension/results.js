import { renderCard, renderDebugInfo, renderFilterBar, renderMissingBanner, isDebugEnabled, escapeHtml } from "./results_view.js";
import { emptyFilterState, deriveFilterOptions, applyFilters } from "./results_filters.js";
import { pointerBoxToNatural, isValidCrop, cropToBase64 } from "./crop.js";
import { findSimilar } from "./lookup.js";

const DEBUG_STORAGE_KEY = "sellpy:results:debug";

const params = new URLSearchParams(window.location.search);
const requestId = params.get("id");

const queryThumbEl = document.getElementById("query-thumb");
const queryPaneEl = document.getElementById("query-pane");
const queryImageEl = document.getElementById("query-image");
const cropOverlayEl = document.getElementById("crop-overlay");
const cropSearchBtn = document.getElementById("crop-search");
const cropClearBtn = document.getElementById("crop-clear");
const cropErrorEl = document.getElementById("crop-error");
const resultsEl = document.getElementById("results");
const debugToggleEl = document.getElementById("debug-toggle");
const debugInfoEl = document.getElementById("debug-info");
const filterBarEl = document.getElementById("filter-bar");
const missingBannerHostEl = document.getElementById("missing-banner-host");

let debugOn = isDebugEnabled(window.location.search, readDebugStored());
let filterState = emptyFilterState();
let lastMatchSetKey = null;
let lastOptions = null;

let cropBox = null;
let dragState = null;
let refining = false;
let refineOpen = false;

applyDebugToggleVisual();

debugToggleEl.addEventListener("click", () => {
    debugOn = !debugOn;
    writeDebugStored(debugOn ? "1" : "0");
    applyDebugToggleVisual();
    render();
});

if (!requestId) {
    resultsEl.innerHTML = `<p class="status">Missing request id.</p>`;
} else {
    render();
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "session" && changes[requestId]) {
            render();
        }
    });
}

async function render() {
    const data = (await chrome.storage.session.get(requestId))[requestId];
    if (!data) {
        resultsEl.innerHTML = `<p class="status">No data.</p>`;
        debugInfoEl.hidden = true;
        filterBarEl.hidden = true;
        missingBannerHostEl.innerHTML = "";
        return;
    }

    if (data.queryImage) {
        queryThumbEl.innerHTML = `<img src="${escapeHtml(data.queryImage)}" alt="" />`;
        if (queryImageEl.src !== data.queryImage) {
            queryImageEl.crossOrigin = "anonymous";
            queryImageEl.src = data.queryImage;
        }
    } else {
        queryThumbEl.innerHTML = "";
        refineOpen = false;
    }
    queryPaneEl.hidden = !refineOpen;

    if (data.status === "loading") {
        if (!resultsEl.querySelector(".skeleton-grid")) {
            resultsEl.innerHTML = skeletonGrid();
        }
        debugInfoEl.hidden = true;
        filterBarEl.hidden = true;
        missingBannerHostEl.innerHTML = "";
        return;
    }
    if (data.status === "error") {
        resultsEl.innerHTML = `<p class="status">Couldn't find matches. ${escapeHtml(data.error || "Try again.")}</p>`;
        debugInfoEl.hidden = true;
        filterBarEl.hidden = true;
        missingBannerHostEl.innerHTML = "";
        return;
    }
    if (data.status === "ok") {
        if (!data.matches || data.matches.length === 0) {
            resultsEl.innerHTML = `<p class="status">No matches.</p>`;
            debugInfoEl.hidden = true;
            filterBarEl.hidden = true;
            missingBannerHostEl.innerHTML = "";
            return;
        }

        const matchSetKey = matchSetIdentity(data);
        const isNewMatchSet = lastMatchSetKey !== null && lastMatchSetKey !== matchSetKey;
        lastMatchSetKey = matchSetKey;
        lastOptions = deriveFilterOptions(data.matches);
        if (isNewMatchSet) {
            filterState = emptyFilterState();
        } else {
            pruneStateAgainstOptions(filterState, lastOptions);
        }

        const { visible, hiddenByMissing } = applyFilters(data.matches, filterState);

        const previouslyOpen = openPopover;
        filterBarEl.innerHTML = renderFilterBar(filterState, lastOptions, { hasQueryImage: !!data.queryImage, refineOpen });
        filterBarEl.hidden = false;
        if (previouslyOpen) {
            const el = filterBarEl.querySelector(`.filter-popover[data-popover-for="${previouslyOpen}"]`);
            if (el) {
                el.hidden = false;
            } else {
                openPopover = null;
            }
        }

        renderMissingBanners(hiddenByMissing);
        renderGrid(visible);
        renderDebugBar(data, visible.length);
        attachObjectidCopy();
    }
}

function matchSetIdentity(data) {
    const ts = data.timestamp ?? "";
    const len = data.matches?.length ?? 0;
    const firstId = data.matches?.[0]?.objectid ?? "";
    return `${ts}|${len}|${firstId}`;
}

function pruneStateAgainstOptions(state, options) {
    const validSizes = new Set(options.sizes.map((o) => o.value));
    for (const v of [...state.sizes]) if (!validSizes.has(v)) state.sizes.delete(v);
    const validBrands = new Set(options.brands.map((o) => o.value));
    for (const v of [...state.brands]) if (!validBrands.has(v)) state.brands.delete(v);
    if (state.priceRange !== null && options.priceBounds === null) {
        state.priceRange = null;
    }
}

function renderGrid(visible) {
    if (visible.length === 0) {
        resultsEl.innerHTML = `
            <p class="status">No items match these filters.</p>
            <button type="button" class="filter-clear-all" data-clear-all>Clear filters</button>
        `;
        return;
    }
    const cards = visible.map((m) => renderCard(m, { debug: debugOn })).join("");
    resultsEl.innerHTML = `<div class="grid">${cards}</div>`;
}

function renderMissingBanners(hiddenByMissing) {
    const parts = [];
    for (const field of ["size", "brand", "price"]) {
        if (hiddenByMissing[field] > 0 && !filterState.includeMissing[field]) {
            parts.push(renderMissingBanner(field, hiddenByMissing[field]));
        }
    }
    missingBannerHostEl.innerHTML = parts.join("");
}

function renderDebugBar(data, visibleCount) {
    if (!debugOn) {
        debugInfoEl.hidden = true;
        return;
    }
    debugInfoEl.innerHTML = renderDebugInfo({
        queryImage: data.queryImage,
        topK: data.topK ?? data.matches?.length ?? null,
        matchCount: visibleCount,
        timestamp: new Date(data.timestamp || Date.now()).toISOString(),
    });
    debugInfoEl.hidden = false;
    const urlEl = debugInfoEl.querySelector("dd.url");
    if (urlEl) {
        urlEl.addEventListener("click", () => {
            navigator.clipboard?.writeText(urlEl.dataset.url || "");
        });
    }
}

function attachObjectidCopy() {
    resultsEl.querySelectorAll(".debug-objectid").forEach((el) => {
        el.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            navigator.clipboard?.writeText(el.textContent || "");
        });
    });
}

function skeletonGrid() {
    return `<div class="grid skeleton-grid">
        ${Array.from({ length: 6 }, () => `<div class="card skeleton-card"></div>`).join("")}
    </div>`;
}

function readDebugStored() {
    try { return localStorage.getItem(DEBUG_STORAGE_KEY); } catch { return null; }
}
function writeDebugStored(v) {
    try { localStorage.setItem(DEBUG_STORAGE_KEY, v); } catch { /* noop */ }
}
function applyDebugToggleVisual() {
    debugToggleEl.classList.toggle("is-active", debugOn);
}

let openPopover = null;

filterBarEl.addEventListener("click", (e) => {
    const refineBtn = e.target.closest("[data-refine]");
    if (refineBtn && !refineBtn.disabled) {
        e.stopPropagation();
        refineOpen = !refineOpen;
        if (!refineOpen) clearCrop();
        closePopover();
        render();
        return;
    }
    const trigger = e.target.closest("[data-filter]");
    if (trigger && !trigger.disabled) {
        e.stopPropagation();
        const field = trigger.dataset.filter;
        togglePopover(field);
        return;
    }
    if (e.target.closest(".filter-popover")) {
        e.stopPropagation();
    }
});

document.addEventListener("click", () => closePopover());
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePopover();
});

function togglePopover(field) {
    if (openPopover === field) {
        closePopover();
        return;
    }
    closePopover();
    const el = filterBarEl.querySelector(`.filter-popover[data-popover-for="${field}"]`);
    if (!el) return;
    el.hidden = false;
    openPopover = field;
}

function closePopover() {
    if (!openPopover) return;
    const el = filterBarEl.querySelector(`.filter-popover[data-popover-for="${openPopover}"]`);
    if (el) el.hidden = true;
    openPopover = null;
}

filterBarEl.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.sizeOption !== undefined) {
        toggleSet(filterState.sizes, el.dataset.sizeOption, el.checked);
        render();
        return;
    }
    if (el.dataset.brandOption !== undefined) {
        toggleSet(filterState.brands, el.dataset.brandOption, el.checked);
        render();
        return;
    }
});

document.body.addEventListener("click", (e) => {
    if (e.target.matches("[data-clear-all]")) {
        filterState = emptyFilterState();
        render();
        return;
    }
});

missingBannerHostEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-show-missing]");
    if (!btn) return;
    const field = btn.dataset.showMissing;
    filterState.includeMissing[field] = true;
    render();
});

function toggleSet(set, value, on) {
    if (on) set.add(value); else set.delete(value);
}

filterBarEl.addEventListener("input", (e) => {
    if (!e.target.classList.contains("price-range-lo") && !e.target.classList.contains("price-range-hi")) return;
    const slider = e.target.closest(".price-slider");
    if (!slider) return;
    const min = Number(slider.dataset.priceMin);
    const max = Number(slider.dataset.priceMax);
    const loInput = slider.querySelector(".price-range-lo");
    const hiInput = slider.querySelector(".price-range-hi");
    let lo = Number(loInput.value);
    let hi = Number(hiInput.value);
    if (lo > hi) {
        if (e.target === loInput) lo = hi; else hi = lo;
        loInput.value = String(lo);
        hiInput.value = String(hi);
    }
    slider.querySelector(".price-lo").textContent = String(lo);
    slider.querySelector(".price-hi").textContent = String(hi);
    slider.dataset.priceCurrentMin = String(lo);
    slider.dataset.priceCurrentMax = String(hi);
    if (lo === min && hi === max) {
        filterState.priceRange = null;
    } else {
        filterState.priceRange = [lo, hi];
    }
});

filterBarEl.addEventListener("change", (e) => {
    if (!e.target.classList.contains("price-range-lo") && !e.target.classList.contains("price-range-hi")) return;
    render();
});

cropOverlayEl.addEventListener("pointerdown", onCropPointerDown);
cropOverlayEl.addEventListener("pointermove", onCropPointerMove);
cropOverlayEl.addEventListener("pointerup", onCropPointerUp);
cropOverlayEl.addEventListener("pointercancel", onCropPointerUp);
cropSearchBtn.addEventListener("click", onSearchCrop);
cropClearBtn.addEventListener("click", clearCrop);

function onCropPointerDown(e) {
    if (refining) return;
    cropOverlayEl.setPointerCapture(e.pointerId);
    const rect = cropOverlayEl.getBoundingClientRect();
    dragState = { startX: e.clientX - rect.left, startY: e.clientY - rect.top };
    cropBox = null;
    drawCropOverlay(null);
    updateCropButtons();
}

function onCropPointerMove(e) {
    if (!dragState) return;
    const rect = cropOverlayEl.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    cropBox = pointerBoxToNatural(
        { startX: dragState.startX, startY: dragState.startY, endX, endY },
        {
            displayWidth: rect.width,
            displayHeight: rect.height,
            naturalWidth: queryImageEl.naturalWidth,
            naturalHeight: queryImageEl.naturalHeight,
        },
    );
    drawCropOverlay(cropBox);
    updateCropButtons();
}

function onCropPointerUp(e) {
    if (!dragState) return;
    try { cropOverlayEl.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    dragState = null;
    updateCropButtons();
}

function drawCropOverlay(box) {
    const rect = cropOverlayEl.getBoundingClientRect();
    cropOverlayEl.width = rect.width;
    cropOverlayEl.height = rect.height;
    const ctx = cropOverlayEl.getContext("2d");
    ctx.clearRect(0, 0, cropOverlayEl.width, cropOverlayEl.height);
    if (!box) return;
    const scaleX = rect.width / queryImageEl.naturalWidth;
    const scaleY = rect.height / queryImageEl.naturalHeight;
    const dx = box.x * scaleX;
    const dy = box.y * scaleY;
    const dw = box.w * scaleX;
    const dh = box.h * scaleY;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(0, 0, cropOverlayEl.width, cropOverlayEl.height);
    ctx.clearRect(dx, dy, dw, dh);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(dx, dy, dw, dh);
}

function updateCropButtons() {
    const valid = isValidCrop(cropBox);
    cropSearchBtn.hidden = !cropBox;
    cropSearchBtn.disabled = !valid || refining;
    cropClearBtn.hidden = !cropBox;
}

function clearCrop() {
    cropBox = null;
    dragState = null;
    drawCropOverlay(null);
    updateCropButtons();
    hideCropError();
}

async function onSearchCrop() {
    if (!isValidCrop(cropBox) || refining) return;
    refining = true;
    hideCropError();
    cropSearchBtn.disabled = true;
    resultsEl.classList.add("results-loading");
    try {
        const imageBytes = await cropToBase64(queryImageEl, cropBox);
        const matches = await findSimilar({ imageBytes, topK: 10 });
        const existing = (await chrome.storage.session.get(requestId))[requestId] || {};
        await chrome.storage.session.set({
            [requestId]: { ...existing, status: "ok", matches, timestamp: Date.now() },
        });
    } catch (err) {
        showCropError(String(err && err.message ? err.message : err));
    } finally {
        refining = false;
        resultsEl.classList.remove("results-loading");
        updateCropButtons();
    }
}

function showCropError(msg) {
    cropErrorEl.textContent = msg;
    cropErrorEl.hidden = false;
}

function hideCropError() {
    cropErrorEl.textContent = "";
    cropErrorEl.hidden = true;
}
