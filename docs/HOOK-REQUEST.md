# Integration hook requests

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
