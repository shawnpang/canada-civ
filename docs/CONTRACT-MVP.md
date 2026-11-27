# MVP data contract (Milestone 1)

This is the agreed payload contract for parallel workstreams. Schemas in [SPEC.md](SPEC.md) §§8–9 are authoritative. This file states what is shipped where, how the UI loads it, and the honesty rules.

## Files

Shipped under `web/data/` (built by workstream A from official downloads):

| File | Required for MVP | Notes |
| --- | --- | --- |
| `world.json` | yes (Milestone 0, already present) | Do not rebuild the hex radius. 25 km, 134×134, EPSG:3347. |
| `nation.json` | yes | Vintage, national economic object, yield definitions. Gold is CAD. |
| `provinces.json` | yes | Same order as `world.provinces`. No `states.json` alias. |
| `cities.json` | yes | All 41 CMAs, plus Whitehorse, Yellowknife (`kind: "ca"`, `capital: true`), and Iqaluit (`kind: "capital"`, `id: "csd-<CSDUID>"`, `metro: false`). List is population-descending; nulls stay at the end or in-place with `population: null`. |
| `lenses.json` | yes | `values.length` equals `grid.cols * grid.rows`. Null on non-Canadian or missing cells. |
| `sources.json` | yes | Every dataset actually used: id, title, publisher, product/table id, vintage, licence, homepage, files with exact URL and sha256 when fetched. |
| `divisions.json` | required for Explorer / some lenses; ship if used | Column-oriented as in SPEC §8.6. |

Do not commit raw downloads (`data/raw/`, `data/interim/`). Do not commit files over 20 MB. Do not invent numbers. Missing official values are `null`, never a fabricated `0`.

## Honesty

- Every numeric value in shipped `web/data/*.json` (except fixtures) must come from a real downloaded official file recorded in `sources.json`.
- Gold is Canadian dollars. GDP is not shown at census-division level.
- Fixture files live only in `web/data/fixtures/` and include `"fixture": true`. UI work may use them until A writes the official files. Fixtures must not be copied over official payloads.

## UI load order

`web/js/main.js` loads `data/<name>.json` first, then falls back to `data/fixtures/<name>.json` if the official file is missing or fails. World is required.

## Yield keys

Required: `food`, `production`, `gold`, `science`, `culture`. The top bar also shows population and unemployment from the national object. Yield definitions are in SPEC §9 and in `nation.json` `yields`.

## Shared context (UI modules)

`main.js` calls each module's `init(ctx)` with:

```js
{
  world, nation, provinces, cities, lenses, sources, divisions,
  canvas, ctx,  // map canvas and 2d context
  getCamera,    // () => ({scale, ox, oy})
  setCamera,    // ({scale, ox, oy}) => void
  redraw,       // () => void
  getLang, setLang,
  getHash, setHashKeys,  // hash helpers owned by D but callable by others
  t,            // (key) => string in the current language
}
```

Modules must export `init(ctx)` and may export `onRedraw(ctx)`, `onLang(ctx)`, `onHash(ctx)`, `onClick(ctx, mapEvent)`.
