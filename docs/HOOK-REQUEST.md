# Workstream B integration hooks

The panels work with the current shell and the MVP fixture payload, but the integrator should address these shared-shell contracts:

1. `main.js` currently omits the documented `getHash` and `setHashKeys` functions from `api()`. Its fallback `save()` reconstructs the hash with only `lang` and `at`, deleting `city`, `province`, `lens`, and `layers` on camera or language changes. Preserve all other hash keys on camera saves, replace camera history entries, and expose the shared hash helpers. Selection changes should push history as specified in SPEC §10.11. Until then, B's modules update selection via `history.pushState` and `hashchange`.
2. Connect search results to the selection contract: dispatch `window` event `canadaciv:select-city` with `{detail: {id}}` for city results, or set the canonical `province` hash key and notify hash listeners for P/T results. Search should fly the camera only when coordinates are present. B accepts all city IDs in the payload and P/T abbreviations or PRUIDs on restore.
3. The shell broadcasts clicks to every module. B's province handler calls the banner hit test before selecting land; for a general solution, dispatch city/banner clicks first and stop once consumed. Keep the current ordering/priority if replacing this mechanism.
4. Coordinate the top yield bar, search, lens dock and other chrome across workstreams, especially at narrow widths. The yield bar is currently a separate scrollable row below the existing header because the header is integrator-owned.
5. Coordinate Esc handling across help, search, share, reports, Almanac and panels so only the topmost surface closes. B's report and panel handlers cover their own surfaces, but cannot order other workstreams' overlays.
