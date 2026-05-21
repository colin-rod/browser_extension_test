# Sellpy Lens — Privacy Policy

**Last updated:** 2026-05-21

Sellpy Lens is a browser extension that lets you right-click an image on any
website to find visually similar items in Sellpy's second-hand catalog.

## What we collect

When you trigger a search via the right-click menu, the extension sends **the
URL of the image you right-clicked** to a Sellpy-operated backend hosted on
Modal (https://*.modal.run). The backend fetches that image, computes a visual
embedding, and returns matching Sellpy listings.

We do **not** collect:

- Your browsing history
- The page URL you right-clicked from
- Your IP address beyond the standard request logs needed to operate the service
- Any personal identifiers, account information, or cookies
- Images you did not explicitly right-click

## What we store

- **Locally**, in your browser: the most recent search result, kept in
  `chrome.storage.session` and cleared when your browser session ends.
- **On Sellpy's backend**: standard request logs (timestamp, image URL,
  response status) retained for up to 30 days for debugging and abuse
  prevention. These logs are not linked to any user identity.

## What we don't do

- We do not sell, share, or transfer your data to third parties.
- We do not use your data for advertising or tracking.
- We do not train machine-learning models on your queries.

## Permissions

The extension requests:

- **`contextMenus`** — to add the "Find on Sellpy" right-click item.
- **`storage`** — to pass the search result from the background worker to the
  results window.
- **Host access to `https://*.modal.run/*`** — to call the Sellpy backend.

It does not request access to the content of pages you visit.

## Contact

Questions or concerns: colin.rodrigues@sellpy.se
