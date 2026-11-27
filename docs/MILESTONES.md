# Milestones

Work these in order. Each milestone is sized so a coding agent can finish it and prove it. Do not start a later milestone until the previous one’s acceptance criteria pass, unless a human explicitly re-scopes.

Sources, schemas, UI, and the definition of done live in [SPEC.md](SPEC.md). Licences and URLs live in [DATA-SOURCES.md](DATA-SOURCES.md).

---

## Milestone 0 — Spike: the land itself

**Goal.** A blank hex map of **all 13 provinces and territories** with terrain, coasts, lakes, rivers, and province/territory borders. No city chrome yet.

**Depends on.** Nothing in this repo (docs only). Official usaciv zip may be *read* for hex and renderer ideas; do not copy the tree in.

**Tasks.**

1. Add `pyproject.toml` (`requires-python >= 3.11`, `dependencies = []`), `pipeline/` package, `uv run python -m pipeline {fetch,process,build,check,serve,list}`.
2. Implement EPSG:3347 (`NAD83 / Statistics Canada Lambert`) and a `MapProjection` that shifts the origin to the top-left, flips Y down, and uses kilometres.
3. Fetch 2021 Census **cartographic** boundary files for provinces/territories. Fit the projection to all 13, plus a 200 km margin (same idea as usaciv).
4. Build a pointy-top, odd-r hex grid with **radius 25 km**. Write `cols`, `rows`, `width`, `height` into `world.json`. Do not hard-code US 117×90.
5. Sample MRDEM (and bathymetry as specified) into per-hex `elev`, `elev_max`, `relief`. Apply the SPEC relief thresholds, including the valley-floor rule.
6. Sample 2020 Land Cover of Canada into `cover` and `pct`, using the SPEC class map. Foreign hexes and water have cover 0.
7. Classify ownership (province/territory index, water, foreign) from seven sample points per hex. Classify water as land / ocean / coast / lake.
8. Draw generalized NHN rivers and major lakes. Draw P/T borders and names.
9. Serve `web/` and render the map with Canvas 2D (pan, zoom, minimap optional but recommended). Loading copy: EN “Surveying the land…” / FR “Arpentage du territoire…”.
10. **Measure** first-paint, `world.json` size, and pan/zoom on a mid-range laptop and a phone-width viewport. If 25 km fails the SPEC performance budget, record the measurements and a proposal to try 30 km. Do not silently change the radius.

**Acceptance.**

- [ ] `uv run python -m pipeline check` exits 0 on the world outputs it knows about.
- [ ] `world.json` contains all 13 P/T in `provinces`, and each has at least one land hex (`owner >= 0`).
- [ ] You can pan from Windsor to Iqaluit to Vancouver Island to the High Arctic without leaving the grid.
- [ ] Relief and land cover are visibly distinct (Rockies, Prairies, boreal shield, Arctic tundra/ice, Great Lakes / coasts).
- [ ] Neighbours may appear as foreign terrain; they are not labelled as Canadian land.
- [ ] A short `docs/spike-notes.md` (or a section in the PR) records grid dims, hex count, file sizes, performance numbers, and the radius decision.
- [ ] No usaciv source tree has been committed to this repository.

---

## Milestone 1 — MVP atlas (bilingual, browsable)

**Goal.** A public-quality static atlas: yields, province panels, City View for all 41 CMAs plus territorial capitals, core lenses, search, share, Almanac, English and French.

**Depends on.** Milestone 0, radius decision locked.

**Tasks.**

1. Build `nation.json`, `provinces.json` (or `states.json` if you keep the usaciv filename — if so, document the alias in SPEC compliance notes), `cities.json`, `lenses.json`, `sources.json`.
2. National top bar: Population, Food, Production, Gold, Science, Culture, Unemployment, plus `Turn <year> · <vintage>`. Clicking a yield opens a national report with P/T and CMA leaderboards.
3. Click land → province/territory panel (yields, ranks, land mix if available).
4. City banners on every in-scope city. Click → City View with at least Economy / Workforce (or equivalent) and the metro footprint highlighted. Include **all 41 CMAs**, Whitehorse, Yellowknife, and **Iqaluit** (not a CA; follow SPEC id rules).
5. Core MVP lenses from SPEC, including one official-language lens. Brushable histogram legend. `L` / Shift+`L` cycle. Non-Canadian hexes stay uncoloured.
6. Search (`/` or Ctrl/⌘K) over cities and provinces, bilingual names.
7. URL hash restores camera, lens, city, province, and `lang`. Share copies the link and can download a PNG with attribution.
8. Almanac: what each yield and lens means, vintage, source, licence, and the missing-data rule.
9. Full EN/FR UI chrome, official toponyms, `lang` toggle, document language in the hash.
10. Tests for hex math, yield definitions, CMA membership, Iqaluit presence, and `check` contracts.

**Acceptance.**

- [x] All Milestone 1 features in SPEC “MVP” have passing acceptance criteria.
- [x] Almanac lists every source actually used, with licence text or link.
- [x] Gold is in CAD; GDP is not shown at CD level.
- [x] Switching language updates chrome immediately; a `#lang=fr` link opens in French.
- [ ] A cold load on a mid-range laptop becomes interactive within the SPEC budget once JSON is cached; mobile layout is usable (docks or sheets, not clipped chrome). **2026-11-27 note:** desktop is interactive. On a 390-px viewport the city panel docks as a sheet, but the national yield bar and turn/vintage line are clipped. Tracked as a post-MVP chrome gap; does not block `m1`.
- [x] `pipeline check` and unit tests pass.
- [x] README status can be updated from “documentation only” to “MVP runnable” only after the above is true.

---

## Milestone 2 — v1 Civ richness

**Goal.** The parts people remember from usaciv: citizens, districts, resources, map layers, wonders, advisors, Explorer.

**Depends on.** Milestone 1.

**Tasks (may be parallel PRs after 1, but all are required for “v1 done”).**

1. **Citizens** pictogram rows (occupation, age, commute, education, origin) from Census 2021, lazy-loaded.
2. **Districts** and city-type badges from industry location quotients. Published rules in `districts.json`. Plaques are schematic.
3. **Resources** (generating stations, mines, oil sands, etc.) with published cutoffs. Toggle `R`.
4. **Map layers:** roads, rail, ports, airports, military (curated DND directory points), optional trade only if an open freight matrix exists.
5. **Wonders:** Parks Canada parks by attendance; historic sites as a separate attendance rule; landmarks as a short curated list with a written rule; universities only if an open R&D series is found (otherwise omit the slot and say so).
6. **Advisors** (nine dashboards + Explorer) with translated court titles, linked both ways to the map. Explorer works on P/T, CMAs, and census divisions.
7. Additional v1 lenses from SPEC (immigration, commute, faith from Census 2021 religion, interprovincial migration, etc.).

**Acceptance.**

- [x] Each v1 feature’s SPEC acceptance criteria pass. **2026-11-27 note:** university wonders are omitted (no open institution-level R&D series). Immigrant share and 30-minute commute lenses are documented stand-ins for exact foreign-born share and mean commute. Terrain-art polish and a few chrome trims (clipped Compare label, truncated header vintage, some overlapping province names) remain residual.
- [x] Eager layer JSON files stay under the SPEC size budget, or are split/lazy-loaded with a documented exception.
- [x] Wonder and district rules are quoted in the Almanac from the data files, not hard-coded only in JS.
- [x] Military layer provenance is the public DND directory (or a better open GIS if one has appeared); no invented troop counts.
- [x] Tests and `pipeline check` pass.

---

## Milestone 3 — Later

**Goal.** Sensitivity-heavy or data-thin work. Do not start as a default agent assignment.

**Depends on.** Milestone 2, plus an explicit human go-ahead for the Indigenous lands overlay.

**Tasks (each can be its own PR).**

1. Census agglomerations as towns with a lighter panel, using the published population cutoff. Territorial CAs stay in even if small.
2. Indigenous lands overlay **after** a documented sensitivity review: optional, official names, no yields, Almanac caveat that legislative boundaries are not all Indigenous land. Default off unless the review says otherwise.
3. Disasters lens from the Canadian Disaster Database (and wildfire/flood if open layers exist).
4. Time slider if `pop_series` and GDP history are in the payloads.
5. Optional: CSD-level Explorer columns, crop resources, elections lens — only with a citable open source.

**Acceptance.** Per-task SPEC criteria. The lands overlay must not ship without the review note in the Almanac and the PR.

---

## Suggested first commands

```bash
uv run python -m pipeline list
uv run python -m pipeline all          # after sources are implemented
uv run python -m pipeline check
uv run python -m unittest discover -s tests
uv run python -m pipeline serve        # http://127.0.0.1:8765
```
