import { findSimilar } from "./lookup.js";

const MENU_ID = "sellpy-find-similar";

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: MENU_ID,
        title: "Find on Sellpy",
        contexts: ["image"],
    });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
    if (info.menuItemId !== MENU_ID || !info.srcUrl) return;

    const requestId = crypto.randomUUID();
    await chrome.storage.session.set({
        [requestId]: { status: "loading", queryImage: info.srcUrl },
    });

    chrome.windows.create({
        url: chrome.runtime.getURL(`results.html?id=${requestId}`),
        type: "popup",
        width: 480,
        height: 720,
    });

    try {
        const matches = await findSimilar({ imageUrl: info.srcUrl, topK: 10 });
        await chrome.storage.session.set({
            [requestId]: { status: "ok", queryImage: info.srcUrl, matches },
        });
    } catch (err) {
        await chrome.storage.session.set({
            [requestId]: { status: "error", queryImage: info.srcUrl, error: String(err) },
        });
    }
});
