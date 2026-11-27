# Workstream C integration hooks

- Expose the contract's `getHash` and `setHashKeys` on the context returned by `web/js/main.js`'s `api()`. `getHash()` should return URLSearchParams (or an object keyed by hash name); `setHashKeys({lens: idOrNull})` should preserve unrelated keys and push a history entry for a lens change. The lens picker has a direct History API fallback until these helpers are available. Ensure camera writes preserve the `lens` key, and that Back/Forward invoke module `onHash` hooks.
- Keep `lensRender.onRedraw` after terrain and before banners, and keep `lenses`, `legend`, and `lensRender` in module initialization, language, and hash dispatch. These hooks already exist in this worktree.
