# Sellpy Lens — MVP

Right-click any image on the web → find visually similar items on Sellpy.

## How to install (testers)

Grab the latest `sellpy-lens-vX.Y.Z.zip` from the
[Releases page](https://github.com/colin-rod/browser_extension_test/releases/latest)
and unzip it somewhere you won't accidentally delete.

### Chrome / Edge / Brave
1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** and select the unzipped folder.
4. Right-click any image on the web → "Find on Sellpy".

### Firefox
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select the `manifest.json` inside the unzipped folder.
4. Right-click any image on the web → "Find on Sellpy".

**Note:** Firefox temporary add-ons unload when Firefox closes. Re-load on each restart. A signed `.xpi` is coming once we submit to Mozilla.

## How it works

The extension sends the image URL to a Modal-hosted Python endpoint, which embeds the image with FashionCLIP and finds the most similar items in a 10k-item subset of Sellpy's current listings.

## Limitations (MVP)

- Catalog is only 10k items (out of 10M).
- Endpoint cold start can be slow (~10–30s on first query after idle).
- No retry on errors — try again if a match fails.
- Sites with strict hotlink protection may block our server from fetching the query image.

## Development

Clone the repo and Load unpacked from the `extension/` directory directly to iterate.
See `docs/superpowers/specs/` and `docs/superpowers/plans/` for the design and implementation plan.
See [docs/RELEASE.md](docs/RELEASE.md) for the release checklist.
Privacy policy: [PRIVACY.md](PRIVACY.md).
