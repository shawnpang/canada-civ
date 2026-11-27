# Parallel workstreams

Four git worktrees, one branch each, with exclusive file ownership. The integrator merges into `main`. Do not edit another stream's files. If you need a hook in a shared file, write `docs/HOOK-REQUEST.md` in your worktree instead of editing it.

| Stream | Branch | Worktree | Owns | Does not touch |
| --- | --- | --- | --- | --- |
| A — data | `ws-a` | `.worktrees/ws-a` | `pipeline/**`, `scripts/**`, `tests/test_mvp*.py`, `tests/test_yields.py`, official `web/data/*.json` (not `fixtures/`) | `web/js/**`, `web/css/**`, `web/index.html` |
| B — panels | `ws-b` | `.worktrees/ws-b` | `web/js/ui/city.js`, `province.js`, `yields.js`, `banners.js`, `advisors.js`, `web/css/panels.css` | `pipeline/**`, `scripts/**`, official `web/data/*` |
| C — lenses | `ws-c` | `.worktrees/ws-c` | `web/js/ui/lenses.js`, `legend.js`, `layers.js`, `web/js/render/lenses.js`, `web/css/lenses.css` | `pipeline/**`, official `web/data/*` |
| D — chrome | `ws-d` | `.worktrees/ws-d` | `web/js/ui/search.js`, `almanac.js`, `share.js`, `i18n.js`, `hash.js`, `web/css/chrome.css` | `pipeline/**`, official `web/data/*` |

**Integrator-only (do not edit in a workstream):** `web/js/main.js`, `web/js/hex.js`, `web/js/terrain.js`, `web/js/minimap.js`, `web/index.html`, `web/css/style.css`, `docs/SPEC.md`, `docs/CONTRACT-MVP.md`, `docs/WORKSTREAMS.md`.

Shared mount points already exist in `web/index.html`: `#yield-bar`, `#lens-bar`, `#search-root`, `#panel-root`, `#legend-root`, `#almanac-root`, `#share-root`, `#advisors-root`.

B, C, and D should load fixtures until official JSON lands. See [CONTRACT-MVP.md](CONTRACT-MVP.md).

Milestone 2 items (advisors, resources, layers, districts, wonders, citizens) may be scaffolded in B/C after Milestone 1 UI in that stream works, but Milestone 1 acceptance comes first.

## Second wave (after M1 streams merged on `m1-integrate`)

Cap: up to eight concurrent Codex processes. Do not run headless Chromium; the integrator takes screenshots one at a time.

| Stream | Branch | Owns | Does not touch |
| --- | --- | --- | --- |
| Hooks | `ws-hooks` | `web/js/main.js`, `web/index.html`, `web/css/style.css` (implement `docs/HOOK-REQUEST.md`) | pipeline/**, official web/data/**, workstream UI modules except via documented events |
| Art polish | `ws-art` | `web/js/terrain.js`, `web/css/terrain.css` (create if needed) | main.js, pipeline/**, UI modules |
| Advisors | `ws-adv` | `web/js/ui/advisors.js`, `web/css/advisors.css` | main.js, pipeline/**, official JSON |
| Resources / energy / infrastructure (M2 data) | `ws-a3` | `pipeline/resources*.py`, `pipeline/infra*.py`, `scripts/` additions, `tests/test_resources*.py`, `web/data/resources.json`, `web/data/infrastructure.json` (and sources.json append-only via a documented merge helper if needed) | web/js/**, cities/provinces/nation/lenses JSON except read-only |
| StatCan verification | `ws-verify` | `/workspace/canada-civ-runs/verification.md` only (update in place). No application source or official JSON rewrites. | everything in the repo except optionally `docs/verification-notes.md` |
| UI follow-up | `ws-ui` | `web/js/ui/*.js` except `advisors.js`, `web/js/render/lenses.js`, `web/css/{panels,lenses,chrome}.css` | main.js, terrain.js, pipeline/**, official JSON |

Do not invent official statistics. Missing values stay null.

