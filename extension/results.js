const params = new URLSearchParams(window.location.search);
const requestId = params.get("id");

const queryEl = document.getElementById("query");
const resultsEl = document.getElementById("results");

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
        return;
    }

    if (data.queryImage) {
        queryEl.innerHTML = `<img src="${escapeHtml(data.queryImage)}" alt="Query" />`;
    }

    if (data.status === "loading") {
        resultsEl.innerHTML = `<p class="status">Finding matches...</p>`;
        return;
    }
    if (data.status === "error") {
        resultsEl.innerHTML = `<p class="status">Couldn't find matches. ${escapeHtml(data.error || "Try again.")}</p>`;
        return;
    }
    if (data.status === "ok") {
        if (!data.matches || data.matches.length === 0) {
            resultsEl.innerHTML = `<p class="status">No matches.</p>`;
            return;
        }
        resultsEl.innerHTML = `<div class="grid">${data.matches.map(renderCard).join("")}</div>`;
    }
}

function renderCard(m) {
    return `
        <a class="card" href="${escapeHtml(m.product_url)}" target="_blank" rel="noopener">
            <img src="${escapeHtml(m.image_url)}" alt="${escapeHtml(m.category)}" />
            <div class="meta">
                <div class="category">${escapeHtml(m.category)}</div>
                <div class="score">similarity ${(m.score).toFixed(3)}</div>
            </div>
        </a>
    `;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
}
