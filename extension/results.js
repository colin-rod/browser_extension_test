import { renderCard, renderDebugInfo, isDebugEnabled, escapeHtml } from "./results_view.js";

const DEBUG_STORAGE_KEY = "sellpy:results:debug";

const params = new URLSearchParams(window.location.search);
const requestId = params.get("id");

const queryThumbEl = document.getElementById("query-thumb");
const resultsEl = document.getElementById("results");
const debugToggleEl = document.getElementById("debug-toggle");
const debugInfoEl = document.getElementById("debug-info");

let debugOn = isDebugEnabled(window.location.search, readDebugStored());
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
        return;
    }

    if (data.queryImage) {
        queryThumbEl.innerHTML = `<img src="${escapeHtml(data.queryImage)}" alt="" />`;
    }

    if (data.status === "loading") {
        if (!resultsEl.querySelector(".skeleton-grid")) {
            resultsEl.innerHTML = skeletonGrid();
        }
        debugInfoEl.hidden = true;
        return;
    }
    if (data.status === "error") {
        resultsEl.innerHTML = `<p class="status">Couldn't find matches. ${escapeHtml(data.error || "Try again.")}</p>`;
        debugInfoEl.hidden = true;
        return;
    }
    if (data.status === "ok") {
        if (!data.matches || data.matches.length === 0) {
            resultsEl.innerHTML = `<p class="status">No matches.</p>`;
            debugInfoEl.hidden = true;
            return;
        }
        const cards = data.matches.map((m) => renderCard(m, { debug: debugOn })).join("");
        resultsEl.innerHTML = `<div class="grid">${cards}</div>`;
        renderDebugBar(data);
        attachObjectidCopy();
    }
}

function renderDebugBar(data) {
    if (!debugOn) {
        debugInfoEl.hidden = true;
        return;
    }
    debugInfoEl.innerHTML = renderDebugInfo({
        queryImage: data.queryImage,
        topK: data.topK ?? data.matches?.length ?? null,
        matchCount: data.matches?.length ?? 0,
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
