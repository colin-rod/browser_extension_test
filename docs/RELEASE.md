# Release checklist — Chrome Web Store (unlisted) + Firefox AMO (self-distribution)

## One-time setup

### Chrome Web Store
- [ ] Register a developer account at https://chrome.google.com/webstore/devconsole ($5 one-time fee).
- [ ] Decide on visibility:
  - **Unlisted** — anyone with the link can install. Easiest for sharing with testers outside Sellpy.
  - **Private** — limited to a Google Workspace group (e.g. all @sellpy.se). Recommended if you want it Sellpy-internal.

### Firefox AMO
- [ ] Register at https://addons.mozilla.org/developers/ (free).
- [ ] Choose "On your own" distribution when submitting — Mozilla signs the .xpi; you host it and share the link. Avoids public listing on AMO.

### Privacy policy hosting
- [ ] Push `PRIVACY.md` to a public GitHub repo (or GitHub Pages).
- [ ] Use the raw GitHub URL (e.g. `https://raw.githubusercontent.com/<org>/<repo>/main/PRIVACY.md`) or rendered URL as the privacy policy URL in both stores.

## Per-release steps

### 1. Bump version
- [ ] Increment `version` in `extension/manifest.json` (e.g. `0.1.0` → `0.1.1`). Both stores reject re-uploads of the same version.
- [ ] Tag the release in git: `git tag v0.1.1 && git push --tags`.

### 2. Build the zip
```
cd extension
zip -r ../sellpy-lens-v0.1.1.zip . -x "*.DS_Store"
```
Confirm the zip contains: `manifest.json`, `background.js`, `lookup.js`, `config.js`, `results.html`, `results.css`, `results.js`, `icons/*`.

### 3. Pre-flight check
- [ ] Load the zip as unpacked in Chrome — verify no manifest warnings.
- [ ] Same in Firefox via `about:debugging`.
- [ ] Smoke test: right-click an image, confirm results render, confirm Sellpy product links open.

### 4. Chrome Web Store submission
- [ ] Upload zip to the developer dashboard.
- [ ] Fill listing:
  - Description (short + detailed)
  - Category: Shopping
  - Language: English
  - Screenshots: 1280×800 or 640×400, at least one
  - Privacy policy URL (from one-time setup)
  - Justification for `contextMenus`, `storage`, and `https://*.modal.run/*` host permission (single sentence each — see suggested text below).
- [ ] Set visibility (Unlisted or Private).
- [ ] Submit. Review takes 1–3 business days typically.

### 5. Firefox AMO submission
- [ ] Upload zip to https://addons.mozilla.org/developers/addon/submit/.
- [ ] Choose **"On your own"** distribution.
- [ ] Source-code submission: if your zip contains only the source files (no bundler, no minification) you can answer "no" to the source-code question. Our extension is plain JS, so no extra step.
- [ ] Wait for signing — usually minutes to a few hours.
- [ ] Download the signed `.xpi` and host it (GitHub release asset works well).

### 6. Distribute
- [ ] Chrome: share the Web Store install link.
- [ ] Firefox: share the signed `.xpi` URL. Users open the URL in Firefox and confirm install.
- [ ] Update `README.md` with the new install instructions; keep the "Load unpacked" instructions as a developer fallback.

## Suggested permission justifications

- **`contextMenus`** — Adds the "Find on Sellpy" item to the right-click menu on images, which is the extension's sole user-facing entry point.
- **`storage`** — Passes the search result from the background service worker to the results window using `chrome.storage.session` (cleared at end of session).
- **Host permission `https://*.modal.run/*`** — The extension sends the right-clicked image URL to Sellpy's backend on Modal, which returns matching listings. No other hosts are contacted.

## Notes

- Firefox temporary add-ons (current README install path) unload on browser restart. After AMO signing, the .xpi installs permanently.
- Keep `min_containers=1` on the Modal backend so testers don't hit cold starts. Watch the bill.
- If you later add new host permissions or new APIs, Chrome will gate the update behind another review — plan version bumps accordingly.
