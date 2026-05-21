# Sellpy Lens — MVP

Right-click any image on the web → find visually similar items on Sellpy.

## How to install (testers)

### Chrome
1. Download or clone this repo.
2. Open `chrome://extensions`.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and select the `extension/` folder.
5. Right-click any image on the web → "Find on Sellpy".

### Firefox
1. Download or clone this repo.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select `extension/manifest.json`.
5. Right-click any image on the web → "Find on Sellpy".

**Note:** Firefox temporary add-ons unload when Firefox closes. Re-load on each restart.

## How it works

The extension sends the image URL to a Modal-hosted Python endpoint, which embeds the image with FashionCLIP and finds the most similar items in a 10k-item subset of Sellpy's current listings.

## Limitations (MVP)

- Catalog is only 10k items (out of 10M).
- Endpoint cold start can be slow (~10–30s on first query after idle).
- No retry on errors — try again if a match fails.
- Sites with strict hotlink protection may block our server from fetching the query image.

## Development

See `docs/superpowers/specs/` and `docs/superpowers/plans/` for the design and implementation plan.
