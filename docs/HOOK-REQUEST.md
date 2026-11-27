# Integration hook requests

## Follow-up for the UI workstream

The shell bridges search results to `canadaciv:select-city` before the current search handler runs, identifying the result by its rendered name and type. Please move that dispatch into `search.js`'s `choose` function, where the actual city id is available, and remove the shell bridge when merging the change. Make `city.js`'s selection handler skip a history write if the same city is already selected; it currently pushes a duplicate entry when a selected city is chosen again.

Shared-shell work for the integrator (`main.js`, hash helpers, chrome layout). Workstream modules should keep working with their fallbacks until these land.

## Workstream B — panels and banners

1. `main.js` currently omits the documented `getHash` and `setHashKeys` functions from `api()`. Its fallback `save()` reconstructs the hash with only `lang` and `at`, deleting `city`, `province`, `lens`, and `layers` on camera or language changes. Preserve all other hash keys on camera saves, replace camera history entries, and expose the shared hash helpers. Selection changes should push history as specified in SPEC §10.11. Until then, B's modules update selection via `history.pushState` and `hashchange`.
2. Connect search results to the selection contract: dispatch `window` event `canadaciv:select-city` with `{detail: {id}}` for city results, or set the canonical `province` hash key and notify hash listeners for P/T results. Search should fly the camera only when coordinates are present. B accepts all city IDs in the payload and P/T abbreviations or PRUIDs on restore.
3. The shell broadcasts clicks to every module. B's province handler calls the banner hit test before selecting land; for a general solution, dispatch city/banner clicks first and stop once consumed. Keep the current ordering/priority if replacing this mechanism.
4. Coordinate the top yield bar, search, lens dock and other chrome across workstreams, especially at narrow widths. The yield bar is currently a separate scrollable row below the existing header because the header is integrator-owned.
5. Coordinate Esc handling across help, search, share, reports, Almanac and panels so only the topmost surface closes. B's report and panel handlers cover their own surfaces, but cannot order other workstreams' overlays.

## Workstream C — lenses

- Expose the contract's `getHash` and `setHashKeys` on the context returned by `web/js/main.js`'s `api()`. `getHash()` should return URLSearchParams (or an object keyed by hash name); `setHashKeys({lens: idOrNull})` should preserve unrelated keys and push a history entry for a lens change. The lens picker has a direct History API fallback until these helpers are available. Ensure camera writes preserve the `lens` key, and that Back/Forward invoke module `onHash` hooks.
- Keep `lensRender.onRedraw` after terrain and before banners, and keep `lenses`, `legend`, and `lensRender` in module initialization, language, and hash dispatch. These hooks already exist in this worktree.

## Workstream D — chrome

- Expose `getHash` and `setHashKeys` from `web/js/ui/hash.js` on the shared context as promised by CONTRACT-MVP. `setHashKeys(changes, {replace})` removes null/empty values, pushes selection changes by default, and dispatches `hashchange`; camera writes use `writeHash(ctx)`.
- City, province, and lens modules should read `city`, `province`, and `lens` in `onHash`, including the initial call before `init`, and restore selection on subsequent history navigation. A city takes precedence over a province. The current stubs cannot open a panel or apply a lens. Search calls `setHashKeys` and flies to supplied coordinates; fixture city coordinates are null.
- Normalize province abbreviations across payloads and UI: current fixtures and world use forms such as `Ont.` and `Nvt.`, whereas SPEC's URL contract requires `ON` and `NU`. Search currently uses the payload abbreviation so it remains compatible with that data. Please reconcile the official build and panel/hash handling together.
- Consolidate hash parsing in the shell with D's `onHash`: `at` is map-km centre plus `log2(scale / home-fit scale)`, not raw scale. The shell currently applies it as raw scale before D corrects it. Validate `lang`, choose browser French when no hash language is supplied, and retain the map centre and relative zoom on viewport resize. Debounce camera writes around 350 ms if continuous camera events start saving directly; current shell calls `writeHash` at gesture end but writes for each wheel event.
- Integrate the global keyboard help and topmost Escape behavior in the shell, and account for the chrome launch controls when positioning the yield and lens bars. The existing help shell does not implement `?` or Escape. Avoid duplicating the search shortcuts already installed by search.js.
- Confirm that official city and province coordinates, yield and lens source IDs, vintages, and caveats are included in their payloads. The Almanac shows missing metadata as unspecified and lists only sources actually present in `ctx.sources`; the current sources file is the Milestone 0 terrain catalogue while other MVP payloads fall back to fixtures.

## Workstream Advisors

- Add `<link rel="stylesheet" href="css/advisors.css">` to `web/index.html`. The shell already imports and initializes `advisors.js` and provides `#advisors-root`.
- Expose the shared `getHash` and `setHashKeys` helpers on the module context as requested above, preserving unrelated hash keys and notifying listeners on selection changes, so advisor selections can synchronize with city and province panels. Coordinate the advisor court with the shell's topmost Escape and chrome layout handling.
- Advisors imports `setHashKeys` and `writeHash` directly and uses the existing city/province selection contract. For full Explorer fidelity, provide a census-division selection/highlight contract (including a URL key, if adopted) and coordinate the advisor dock with city/province panels on mobile. Until then, Explorer marks the division's assigned map cell rather than its boundary.

## Workstream districts

- Lazily load `data/districts.json` for City View and cache it for banners. Import `drawCityTypeBadge` and `drawDistrictPlaques` from `js/render/districts.js`; both take the Canvas 2D context, payload, city ID and an options object with screen-pixel `x`, `y`, and `lang`. The badge helper returns its bounds or `null`. Draw it with the city banner when `cities[id].badge` is present, allowing room for its bounds in banner layout and hit testing.
- In the selected City View, draw district plaques with `drawDistrictPlaques`; optionally supply `positions` as screen-pixel `{x, y}` objects in district order. These are decorative positions, not job or neighbourhood locations. Show the bilingual `rules[lang]` text from the payload in City View and quote that same text in the Almanac. A `null` district list or badge means unavailable; an empty district list means no sector met the published threshold.
- Merge the verified source entry in `data/sources-districts.json` into the Almanac source catalogue, reconciling its `statcan_labour_98100594` ID with the existing entry. Its files document the additional all-industry and sector observations used for districts. Keep the district payload lazy-loaded and refresh rendered labels when the language changes.
