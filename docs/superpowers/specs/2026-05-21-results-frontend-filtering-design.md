# Results-page frontend filtering — design

**Date:** 2026-05-21
**Scope:** Browser extension results page ([extension/results.html](../../../extension/results.html), [extension/results.js](../../../extension/results.js), [extension/results_view.js](../../../extension/results_view.js))

## 1. Overview & goals

Add a client-side filter bar to the visual-search results page so users can narrow the top-K matches by **Size**, **Brand**, and **Price**. Filtering happens entirely in the browser over data already in `chrome.storage.session`. No API changes. No re-querying. Filters reset on each new search.

**Goals**
- Let a user shopping a visual-search result narrow down to items that actually fit them (size, brand affinity, budget).
- Keep result-fetching unchanged — filtering is a pure transform of the already-fetched match list.
- Keep the filter UI proportionate to the page: top-K is small, so dropdown/chip controls suffice; no facet sidebar.

**Non-goals**
- Category (`category_1`) filtering.
- Server-side filtering or any backend change.
- Persisting filters across searches.
- Filtering by visual similarity score.
- Sort controls.
- Analytics on filter usage.

## 2. UI

### Layout

A new `.filter-bar` row sits between the existing header (query thumb + debug toggle) in [extension/results.html](../../../extension/results.html) and the `.grid` of cards.

Left-aligned controls, in order: `Size ▾`, `Brand ▾`, `Price ▾`.

Right-aligned: a subtle result counter (e.g., `12 of 24`) and a `Clear all` link that appears only when at least one filter is active.

### Control shapes

- **Size** — dropdown trigger opens a popover with multi-select checkboxes. OR within. Values derived from the current result set, sorted by frequency descending, then alphabetically.
- **Brand** — same pattern as Size.
- **Price** — dropdown trigger opens a popover containing a dual-handle range slider. Min/max bounds derived from `floor(min(prices))` and `ceil(max(prices))` of the result set. Default selection covers the full range (filter inactive until either handle moves off its bound).

### Active state

- A count badge appears on the trigger when a filter is active (e.g., `Size · 2`).
- The trigger flips to a filled/accent style when active.
- `Clear all` link clears every active filter and resets the missing-field include toggles.

### Missing-field handling

Items missing the field being filtered are hidden by default. When this happens, a small banner appears below the filter bar:

`3 items hidden (missing size) — show anyway`

Clicking `show anyway` re-includes them for that single field. The toggle is per-field, in-memory, and resets on a new search or when `Clear all` is pressed.

### Empty filtered state

When the active filter combination matches zero items, the grid is replaced by:

```
<p class="status">No items match these filters.</p>
<button>Clear filters</button>
```

The filter bar itself remains visible so the user can adjust without losing context.

### Edge cases (UI)

- All items have the same value for a field → filter trigger still shown with that one option (lets the user confirm and uncheck-all to filter to "everything else", which is no-op but harmless).
- All items missing a field → trigger is disabled with tooltip `No data`.
- All prices identical → slider collapses to a single point; filter is effectively no-op but still displayed.
- API returned zero matches → filter bar hidden entirely; existing `No matches.` path is unchanged.

## 3. Architecture

### Files

- [extension/results.html](../../../extension/results.html) — add `.filter-bar` container element above `#results`, and a missing-field banner placeholder.
- [extension/results.css](../../../extension/results.css) — styles for filter bar, triggers, popovers, slider, badges, banner. Match existing Sellpy design tokens.
- [extension/results_view.js](../../../extension/results_view.js) — add pure render helpers: `renderFilterBar(state, options)`, `renderMissingBanner(field, count)`. Keep `renderCard` / `renderDebugInfo` unchanged.
- [extension/results_filters.js](../../../extension/results_filters.js) — **new file**. Pure module, no DOM. Exports:
  - `deriveFilterOptions(matches)` → `{ sizes: [{value, count}], brands: [{value, count}], priceBounds: [min, max] | null }`
  - `applyFilters(matches, filterState)` → `{ visible: Match[], hiddenByMissing: { size: number, brand: number, price: number } }`
  - `emptyFilterState()` → fresh state object
- [extension/results.js](../../../extension/results.js) — wires storage → filters module → view; handles popover open/close DOM interactions and slider/checkbox events.
- [tests/](../../../tests/) — unit tests for `deriveFilterOptions` and `applyFilters`.

### Filter state shape

In-memory only, not persisted:

```js
{
  sizes: Set<string>,              // empty = no filter on size
  brands: Set<string>,             // empty = no filter on brand
  priceRange: [min, max] | null,   // null = no filter on price
  includeMissing: { size: false, brand: false, price: false }
}
```

Held in a module-level `filterState` variable in [extension/results.js](../../../extension/results.js).

### Data flow on each `render()` call

1. Read `data` from `chrome.storage.session` (unchanged behavior).
2. If `data.status !== "ok"` or `data.matches` is empty → keep existing behavior, hide filter bar.
3. Call `deriveFilterOptions(data.matches)` → produces available sizes, brands, price bounds.
4. Call `applyFilters(data.matches, filterState)` → produces `visible` and `hiddenByMissing`.
5. Render filter bar via `renderFilterBar(filterState, options)`.
6. Render `visible` cards into `.grid`.
7. For each field with `hiddenByMissing[field] > 0 && !filterState.includeMissing[field]`, render the missing-field banner.

### Filter logic

AND across filter types, OR within. An item passes if:

```
( sizes.size === 0
    OR sizes.has(item.size)
    OR (item.size == null AND includeMissing.size) )
AND
( brands.size === 0
    OR brands.has(item.brand)
    OR (item.brand == null AND includeMissing.brand) )
AND
( priceRange === null
    OR (item.price != null AND item.price >= min AND item.price <= max)
    OR (item.price == null AND includeMissing.price) )
```

### State lifecycle

- Reset `filterState` to `emptyFilterState()` whenever `requestId` changes (new search).
- The existing `chrome.storage.onChanged` listener re-renders on data updates within a request. `deriveFilterOptions` re-runs so option lists stay accurate. Selections that no longer exist in the new option set are dropped silently; selections that still exist are preserved.
- If a popover is open when a storage update arrives, preserve its open state.

## 4. Testing

### Unit tests (pure functions)

For `deriveFilterOptions(matches)`:
- Empty array → all options empty, `priceBounds: null`.
- All items missing a field → that facet's option list is empty.
- Single-value field → one option.
- Mixed values → frequency-then-alphabetical sort.
- Price rounding — bounds use `floor`/`ceil` on real numbers.

For `applyFilters(matches, state)`:
- No filters → passthrough.
- Single-type filter narrows correctly.
- Multi-type AND combines correctly.
- OR within a type works.
- Missing field hidden by default; included when `includeMissing[field]` true.
- Counts in `hiddenByMissing` are accurate.
- Empty result set returns `{ visible: [], hiddenByMissing: {size:0, brand:0, price:0} }`.

### Manual browser checks

- Filter bar renders with 0, 1, many values per facet.
- Popover open / outside-click dismiss / Esc closes.
- Active-state badges and `Clear all` visibility.
- New search resets filters and re-derives options.
- Missing-field banner appears and `show anyway` works.
- Empty filtered state renders with working `Clear filters` button.
- Storage update mid-interaction preserves popover and valid selections.

## 5. Out of scope

- Server-pushed facet metadata.
- Sort controls.
- Saving filter presets across searches.
- Category filter.
- Analytics on filter usage.
