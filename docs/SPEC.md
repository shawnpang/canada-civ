# Canada Civ — implementation specification

This is the source of truth for what to build. [MILESTONES.md](MILESTONES.md) is the order of work. [DATA-SOURCES.md](DATA-SOURCES.md) is the source catalogue. [REFERENCE-USACIV.md](REFERENCE-USACIV.md) describes the original product this project is inspired by.

If this file and an implementation disagree, change the code or propose a spec amendment in the same PR. Do not silently shrink scope.

---

## 1. Product

Canada Civ is a **read-only, Civilization-styled data atlas of Canada**. It draws the real country as a hex map and names real statistics in Civ language (Gold is GDP, districts are industry specialisations, wonders are sites chosen by published rules). It is a **visualizer, not a game**.

**Inspired by** Andrej Karpathy’s [usaciv](https://karpathy.ai/usaciv/) ([announcement](https://x.com/karpathy/status/2125779541952246039), [MIT source zip](https://karpathy.ai/usaciv/usaciv-source.zip)). This project is not affiliated with Karpathy or with any game publisher. Art must be original and drawn in code.

The interface is **bilingual English and French**. The map includes **all 10 provinces and 3 territories**, including the North. Currency is the **Canadian dollar**.

---

## 2. Scope

### In scope

- One continuous hex map of Canada (all 13 provinces and territories). The High Arctic is on the grid, not hidden in an inset. A default camera may open on the populated southern belt.
- Foreign neighbours (Alaska, Greenland, the contiguous US, Saint-Pierre-and-Miquelon) may appear as foreign terrain, the way Canada and Mexico appear on usaciv. They are not treated as Canadian land and get no Canadian yields.
- National yield bar, province/territory panels, City View for every 2021 Census metropolitan area (CMA) plus territorial capitals (including Iqaluit), data lenses, Almanac, search, shareable URL and share image.
- A Python pipeline that fetches official open data (no API keys), builds `web/data/*.json`, and checks contracts.
- A static `web/` frontend (ES modules + Canvas 2D) that can be served by `python -m pipeline serve` or any static host.
- English and French UI from MVP.

### Out of scope (non-goals)

- A playable 4X game: no units, combat, movement, tech tree, AI opponents, diplomacy, or win conditions.
- Legal, cadastral, or survey-grade boundaries. Hexes are schematic (about 1,600 km² at 25 km radius).
- Copying Civilization (or any publisher’s) art, logos, or typography.
- Gamifying Indigenous lands as territory to settle, conquer, or harvest.
- Inventing GDP, employment, or other figures at a geography Statistics Canada does not publish (in particular: **no census-division GDP**).
- Real-time feeds, user accounts, or personal data.
- Dropping the territories, or cropping them into an inset so the south fills the screen.
- Vendoring the usaciv source tree into this repository.
- Porting the US “uninsured” lens (it does not translate).

---

## 3. Tech stack (constraints)

Mirror usaciv’s constraints unless a milestone records a justified exception.

| Layer | Requirement |
| --- | --- |
| Pipeline language | Python 3.11+, run with [uv](https://docs.astral.sh/uv/) |
| Pipeline dependencies | **Standard library only** in `pyproject.toml` for the runtime pipeline |
| Rasters | Prefer a stdlib or narrowly written reader. A **documented, one-time** GDAL (or similar) preprocess that emits compact interim files is allowed if `docs/` and the Almanac say so. Do not hide a GIS stack in the serve path. |
| Frontend | Plain ES modules, Canvas 2D, **no framework, no npm, no bundler**, no required WASM |
| Commands | `uv run python -m pipeline {fetch,process,build,check,all,list,serve,package}` with the same meanings as usaciv (`all` = fetch + process + build + check) |
| Offline | `--offline` uses the cache only and fails if a raw file is missing |
| Tests | stdlib `unittest` under `tests/` (`uv run python -m unittest discover -s tests`) |
| Check | `pipeline check` validates `web/data` against this spec; FAIL exits 1 |
| Serve | `pipeline serve` serves `web/` on `http://127.0.0.1:8765` by default |

---

## 4. Target repository layout

Implement into this repository (docs already live under `docs/`):

```
canada-civ/
  README.md
  AGENTS.md
  LICENSE
  NOTICE
  pyproject.toml          # name = "canada-civ", requires-python >= "3.11", dependencies = []
  docs/                   # this specification
  pipeline/
    __main__.py           # CLI
    core/                 # fetch, geo (EPSG:3347), hexgrid, store, source, paths
    sources/              # one module per source id; auto-discovered
    build/                # world, cities, yields, provinces, lenses, catalog, …
    check.py
  tests/
  web/
    index.html
    css/
    js/                   # main.js, camera, hex, world, render/, ui/, app/, ext/
    data/                 # generated JSON the browser loads (commit once built)
    og-image.png
  data/raw/               # gitignored cache
  data/interim/           # gitignored
```

Filenames may follow usaciv (`states.json` for provinces) **only if** the file header comment and Almanac say that “state” means province or territory. Prefer `provinces.json` and a `provinces` array in `world.json`. Hash keys are specified in §10.11 regardless of file name.

---

## 5. Coordinates and hex grid

### 5.1 Projection

- CRS: **NAD83 / Statistics Canada Lambert, EPSG:3347** (Lambert conformal conic, two standard parallels 49°N and 77°N, central meridian ≈ 91.866667°W). This is the CRS of the 2021 Census boundary files.
- Working units on the map: **kilometres**.
- `MapProjection`: shift so the top-left of the fitted bounds (all 13 P/T + margin) is `(0, 0)`, and **Y points down** (screen space), the same convention as usaciv.
- Default margin: **200 km** on all sides, unless the spike shows a better value and records it.

### 5.2 Hex grid

- Pointy-top, **odd-r** offset layout (odd rows shifted right).
- Cell centre, with `R` in km:

  `x = √3 · R · (col + 0.5 · (row & 1))`

  `y = 1.5 · R · row`

- Index: `row * cols + col`. `web/js/hex.js` must match `pipeline/core/hexgrid.py` exactly (including rounding on hex-to-cell; usaciv uses `floor(v + 0.5)` rather than banker's rounding).
- **Radius R = 25 km** (vertex-to-vertex 50 km, flat-to-flat ≈ 43.3 km, area ≈ 1,624 km²). This matches Karpathy’s “25 km hex grid.”
- `cols` and `rows` are **outputs** of `HexGrid.covering(width, height, R)` after the 13 P/T bounds + margin are fitted. Do not hard-code usaciv’s 117×90.
- Expect on the order of **~21,000** cells at 25 km (rough estimate from the 2021 digital-boundary extent plus margin). The spike must report the actual count.
- Only change R to 30 km if 25 km fails the §12 performance budget and the measurements are written down. 35 km is a last resort.

### 5.3 Ownership

Per-cell `owner` (int):

| Value | Meaning |
| --- | --- |
| `>= 0` | Index into `world.provinces` (the P/T that owns the hex) |
| `-1` | Water (`WATER`) |
| `-2` | Foreign land (`FOREIGN`) |

Ownership is the majority of **seven sample points**: the centre plus six points 60% of the way toward the corners. The centre breaks ties. The same seven points give a weighted mix of census divisions for lenses (`division_samples`). Builders treat a cell as Canadian land only when `owner[cell] >= 0`.

`division[cell]` is the index into `world.divisions`, or `-1` if none.

---

## 6. Terrain classification

Write the rules into `world.json` `tables` so the Almanac and the renderer share one definition (as usaciv does).

### 6.1 Water

`water`: `0` land, `1` ocean, `2` coast (adjacent to land, or mean depth shallower than 200 m), `3` lake.

Tidal bays and narrow reservoirs should follow the usaciv water notes in spirit (tidal water stays water when the centre is sea and the elevation evidence says so; small reservoirs may remain land with a river drawn through them). Document the exact rule you ship in `tables.notes.water`.

### 6.2 Relief

Computed from land elevation samples inside the hex (ignore deep bathymetry). Water hexes are always relief `0`.

| ID | Name | Rule |
| --- | --- | --- |
| 0 | Flat | Elevation standard deviation < 85 m |
| 1 | Hills | SD ≥ 85 m |
| 2 | Mountains | SD ≥ 260 m, **or** mean ≥ 2,300 m |
| 3 | Peaks | Mean ≥ 2,700 m |

**Valley-floor rule:** if the lower 60% of land samples is low and flat (those samples span < 60 m and sit under 400 m), ease the hex one relief class downward so a range clipping the edge does not make a valley look alpine.

Starting thresholds are usaciv’s. If the Rockies or Arctic look systematically wrong, adjust in one place, write the new thresholds into `tables.relief`, and mention it in spike notes.

### 6.3 Land cover

Sample the **2020 Land Cover of Canada** (30 m, 15 NALCMS Level-II classes) on a lattice inside each Canadian land hex (target ~2 km spacing, or a documented equivalent). Ignore water / nodata when computing shares. `pct` values are **0..100 integers** on Canadian land hexes, 0 elsewhere.

Map NALCMS classes onto these **fixed cover ids** (keep ids stable so art can key off them):

| ID | Key | NALCMS 2020 classes (typical labels) |
| --- | --- | --- |
| 0 | none | Water, foreign, or no land pixels |
| 1 | forest_deciduous | Temperate / sub-polar broadleaf deciduous |
| 2 | forest_evergreen | Temperate / sub-polar needleleaf; sub-polar taiga needleleaf |
| 3 | forest_mixed | Mixed forest |
| 4 | scrub | Temperate / sub-polar shrubland; sub-polar or polar shrubland-lichen-moss |
| 5 | grassland | Temperate / sub-polar grassland; sub-polar or polar grassland-lichen-moss |
| 6 | pasture | No direct national class — leave unused unless a documented agricultural overlay is added later |
| 7 | cropland | Cropland |
| 8 | wetland | Wetland |
| 9 | urban | Urban and built-up. Also force urban when the developed share is **≥ 30%** of land samples, even if not the plurality |
| 10 | barren | Barren land; sub-polar or polar barren-lichen-moss |
| 11 | ice | Snow and ice |

Dominant cover = the largest mapped group among land samples, after the urban threshold. Record the exact class-id table (NALCMS numeric codes) in `tables.cover` and in spike notes. Accuracy of the 2020 product is reported by NRCan as about 86.9% overall; put that caveat in the Almanac.

---

## 7. Data pipeline

Always **source → interim → builder → `web/data`**.

- **Sources** (`pipeline/sources/*.py`): auto-discovered `Source` subclass with `SourceInfo` (id, title, publisher, homepage, licence, description, used_for). `fetch()` downloads via a caching helper that writes `data/raw/<id>/manifest.json` (url, retrieved, sha256, bytes). `process()` returns a dict, optionally with `vintage` and the list of raw files actually used.
- **Builders** (`pipeline/build/*.py`): `REQUIRES`, `PRODUCES`, `build()`. Run in dependency order. Interims produced by builders start with `_`. The `_world` interim must include `grid`, `projection`, `owner`, `division`, `division_samples`, `provinces` (PRUID list in the same order as `world.json`), `divisions` (CDUID list), `water`, `cover`, `pct`.
- **Catalog** (run last) writes `sources.json` from the registry + manifests.
- **Check:** every output is validated (keys, types, null rules, cell index ranges). Quality lines are PASS / NOTE / WARN / FAIL. Missing optional files are NOTE, not FAIL. A builder may add `check(web_dir)`.
- **Null rule (global):** `null` means unknown or suppressed. **Never write `0` as a stand-in for unknown.** A real zero (no mapped site of that type, zero disaster declarations) is allowed when the source supports it and the field description says so.
- **Money:** Canadian dollars, not thousands or millions, unless the key name says otherwise (then document the scale). Shares in city/province/lens tables are **0..1 fractions** unless the field is a `pct` hex share in `world.pct` (0..100).
- **Vintages:** `nation.json` may list several (census year vs GDP year vs population-estimate year). The top-bar “Turn” is the primary demographic year; the Almanac lists all vintages.

Geography to use unless a later census is explicitly adopted:

- 13 provinces and territories.
- 293 census divisions (2021).
- 41 CMAs and 111 CAs (2021). A CMA has an urban core of at least 100,000; a CA, at least 10,000.
- City View **MVP set:** all 41 CMAs, plus Whitehorse (CA), Yellowknife (CA), and **Iqaluit** (not a CMA or CA — include by the capital rule).
- Ottawa–Gatineau and any other cross-province CMA must list every province they occupy.

---

## 8. Output JSON schemas

All coordinates `x`, `y` are **map km**. Per-cell arrays have length `grid.cols * grid.rows`. Optional files may be absent (app and `check` still work); if present they must match these shapes.

Bilingual user-facing names: store `{ "en": "…", "fr": "…" }` for place names that have official forms (P/T, CMA, CD, wonders). The UI picks a language from `lang`. Identifiers stay codes (PRUID, CMAUID, CDUID).

### 8.1 `world.json` (required)

```jsonc
{
  "version": 2,
  "grid": {"radius": 25, "cols": 0, "rows": 0},   // cols/rows from the pipeline
  "width": 0, "height": 0, "margin": 200,
  "crs": "EPSG:3347",
  "projection": { /* parameters needed to invert map-km → lon/lat for debugging */ },
  "owner": [0],          // int: -1 water, -2 foreign, >=0 index into provinces
  "division": [0],       // int: index into divisions, or -1
  "elev": [0],           // int metres; land = mean of land samples; water = mean depth (<=0) if known
  "elev_max": [0],       // int metres, highest land sample (0 on water)
  "water": [0],          // 0 land, 1 ocean, 2 coast, 3 lake
  "relief": [0],         // 0..3; 0 on water
  "cover": [0],          // 0..11, see §6.3
  "pct": {
    "forest": [0], "crop": [0], "pasture": [0], "grass": [0],
    "shrub": [0], "wetland": [0], "developed": [0]
  },
  "tables": {
    "water": [{"id": 0, "name": {"en": "Land", "fr": "Terre"}, "rule": {"en": "…", "fr": "…"}}],
    "relief": [],
    "cover": [],
    "notes": {"water": {}, "relief": {}, "cover": {}}
  },
  "provinces": [{"pruid": "35", "abbr": "ON", "name": {"en": "Ontario", "fr": "Ontario"}}],
  "divisions": [{"cduid": "3520", "name": {"en": "…", "fr": "…"}, "pruid": "35"}],
  "rivers": [{"name": {"en": "Saint Lawrence", "fr": "Saint-Laurent"}, "rank": 1, "pts": [0, 0]}]
}
```

`provinces` has exactly 13 entries (10 provinces + 3 territories), stable order (prefer PRUID sort). `abbr` is the official English alpha code: NL, PE, NS, NB, QC, ON, MB, SK, AB, BC, YT, NT, NU.

### 8.2 `cities.json` (required)

A list, population descending. Each element:

```jsonc
{
  "id": "535",                 // 3-digit CMA/CA UID, zero-padded, string; see capital exception
  "kind": "cma",               // "cma" | "ca" | "capital"
  "name": {"en": "Toronto", "fr": "Toronto"},
  "full": {"en": "Toronto, Ontario", "fr": "Toronto (Ontario)"},
  "provinces": ["ON"],         // one or more abbrs
  "metro": true,
  "capital": false,            // true for Ottawa–Gatineau (national capital) and for territorial capitals
  "x": 0, "y": 0,              // principal city position, map km
  "cell": 0,                   // Canadian land cell, unique per city where possible
  "population": 0,
  "employed": 0,
  "yields": {"food": 0, "production": 0, "gold": 0, "science": 0, "culture": 0},  // any may be null
  "jobs": {"agriculture": 0},  // NAICS groups; values may be null
  "median_income": 0, "median_rent": 0, "home_value": 0,
  "unemployment": 0,           // 0..1 fraction
  "rent_burden": 0,            // 0..1 if available, else null
  "gdp": 0, "gdp_year": 2021,  // CAD, current dollars, basic prices; null if not published (non-CMA capitals)
  "gdp_by_industry": {},
  "gdp_undisclosed": null,
  "growth": 0, "growth_years": [2021, 2025],
  "divisions": ["3520"],       // member CDUIDs used for footprints and roll-ups
  "footprint": [0],            // land cells of the metro; never empty; includes `cell`
  "pop_series": {"2021": 0, "2025": 0},
  "ranks": {"population": 1, "gdp": 1, "gold": 1},
  "peers": ["535"]             // five nearest in population among cities.json
}
```

**Iqaluit rule:** `kind` is `"capital"`. `id` is `csd-<CSDUID>` using the official 2021 CSD unique identifier (do not invent a fake CMAUID). `metro` is false. `gdp` is `null` unless Statistics Canada publishes a figure for that geography. Whitehorse and Yellowknife use their official **CA** UIDs, `kind: "ca"`, `capital: true`.

**Gold / GDP:** CMA GDP from table 36-10-0468-01. Do not impute CMA GDP from provincial totals except by using the table’s own non-CMA remainder, and only at the “rest of province” level, never at CD. Territorial capitals without CMA GDP show “no data” for Gold.

**Growth:** use one vintage of Annual Demographic Estimates on consistent borders. `growth` is null when membership is inconsistent or the change fails a documented sanity cap. Do not mix census and estimate vintages in the same ratio without saying so.

**Footprint:** a Canadian land cell belongs to a city when a majority of its division (or CSD) samples fall in the city’s members. The city’s `cell` is always included. A cell is in at most one footprint by the majority rule.

### 8.3 `provinces.json` (required)

Same order as `world.provinces`. Same economic fields as a city, plus:

- `pruid`, `abbr`, `name` `{en, fr}`
- `ranks` among the 13 P/T (1 = largest / highest)
- `label`: `{x, y, angle, size}` suggested name anchor (size in map km), or null
- `land`: cover shares as 0..1 fractions averaged over the P/T’s hexes with `cover > 0`, or null
- `energy`: mapped-site MW totals only (not the P/T’s true capacity), with a `note` that says so, or null if `resources.json` is absent

### 8.4 `nation.json` (required)

```jsonc
{
  "vintage": "Census 2021", "year": 2021,
  "gdp_vintage": "Statistics Canada 36-10-0711-01, …",
  "nation": { /* same economic shape as a city, no id/cell */ },
  "yields": [
    {
      "key": "food",
      "icon": "y-food",
      "label": {"en": "Food", "fr": "Nourriture"},
      "unit": "workers",
      "color": "#7fbf3f",
      "description": {"en": "…", "fr": "…"}
    }
  ],
  "industries": {
    "agriculture": {"en": "Agriculture, forestry, fishing and hunting", "fr": "…"}
  }
}
```

Required yield keys: `food`, `production`, `gold`, `science`, `culture`. The top bar also shows population and unemployment from `nation.nation`. Gold `unit` is `usd` only if you mean “currency”; prefer `cad` or `cad_per_year` and label it **CAD** in the UI. Do not use a US-dollar sign as the only cue.

### 8.5 `lenses.json` (required)

```jsonc
{
  "vintage": "Census 2021",
  "groups": [{"id": "people", "name": {"en": "People", "fr": "Population"}}],
  "lenses": [{
    "id": "density",
    "group": "people",
    "name": {"en": "Population", "fr": "Densité de population"},
    "unit": {"en": "people / km²", "fr": "personnes / km²"},
    "format": "int",          // int | cad | pct | float | minutes | years
    "scale": "log",           // log | linear
    "domain": [1, 2000],      // typically 2nd–98th percentile of hex values, at build time
    "ramp": ["#…", "#…"],
    "higher_is": "neutral",   // good | bad | neutral
    "source": "statcan_census_2021_profile",
    "description": {"en": "…", "fr": "…"},
    "note": {"en": "…", "fr": "…"},
    "values": [null]          // per cell; null on non-Canadian cells or missing data
  }]
}
```

`pct` lens values are 0..1. `values.length === grid.size`.

**MVP lenses (must ship):** `density`, `income`, `home` (median dwelling value), `poverty` or `unaffordability` (pick one, document the exact StatCan measure), `age`, `bachelors`, `forest`, `farmland` (cropland share), `developed`, `official_language` (share with French as first official language spoken, or an equivalent published FOL measure — name the exact variable in `description` and `note`).

**v1 lenses:** `foreign_born`, `commute` (mean duration if published), `homeownership`, `broadband` if a citable measure exists, `faith` and `faith_tradition` from **Census 2021 religion** (official, open; caveat: self-response), `migration` (interprovincial or mobility), `veterans` only if a citable open measure exists.

**Later:** `disasters`; Indigenous-identity share only after a sensitivity note is written; no uninsured lens.

### 8.6 `divisions.json` (required for Explorer / lenses support; column-oriented)

Same idea as usaciv `counties.json`: `fields`, `columns`, `rows`. One row per census division in `world.divisions` order. Include `cduid`, `name`, `abbr` (P/T), population, land area, density, the MVP lens measures, `cma` (city id or null), `cell`. No GDP column unless StatCan publishes it (they do not, at CD).

### 8.7 `resources.json` (v1, optional for MVP)

`types[]` with `id`, bilingual `name`, `category` (`energy` | `mineral` | other), `unit`, bilingual `description` that **states the inclusion cutoff**, `source`. `items[]` with `type`, `name`, `x`, `y`, `cell`, `value`, `detail`, `abbr` (P/T), `city` (cities.json id or null). `summary` totals **mapped sites only**.

### 8.8 Other optional payloads (v1+)

Follow usaciv’s spirit: top-level `version`, `vintage`, `sources` (ids into `sources.json`), and **published `rules` text** for anything selected (districts, wonders, routes).

| File | Load | Role |
| --- | --- | --- |
| `citizens.json` | lazy | Pictogram mixes per city; pipeline does largest-remainder rounding so counts sum |
| `districts.json` | lazy | Location-quotient districts and city-type badges, with `rules` |
| `infrastructure.json` | eager | Generalized roads, rail, ports, airports |
| `military.json` | eager | Curated CAF/DND points from the official public directory, provenance required |
| `wonders.json` | eager | Wonders + `rules` array |
| `trade.json` | eager | Freight arcs **only** if an open matrix exists; otherwise omit the file |
| `disasters.json` | lazy | Canadian Disaster Database aggregates |
| `sources.json` | required | Almanac bibliography (see DATA-SOURCES.md) |

Eager optional files should stay under **~300 KB** each when possible. `world.json` + required MVP JSON should stay within the §12 budget.

### 8.9 Wonder rules (v1)

Publish rules inside `wonders.json`, not only in prose:

1. **National parks:** the N most-visited Parks Canada national parks in the latest official attendance year, ranked only among national parks. Choose N (suggest 12–15) and write it in the rule. Include northern parks if they qualify; do not exclude the territories.
2. **Historic sites / other park units:** a separate attendance rule, analogous to usaciv’s “other park units.”
3. **Research universities:** only if an open, citable R&D or sponsored-research series exists. If not, **omit this slot** and say so in the Almanac. Do not scrape a magazine ranking.
4. **Landmarks:** a short curated list (suggest ~10–12), regional spread, at most one per city, no overlap with park rules, listed with a written rule. Positions from an official open layer or a documented coordinate source.

---

## 9. Yield definitions (acceptance)

| Key | Meaning | Geography | May be null? |
| --- | --- | --- | --- |
| Population | Residents | Nation, P/T, city | No for nation and P/T; city uses estimates or census, documented |
| Food | Jobs in NAICS 11, place of residence | Same | Yes if suppressed |
| Production | Jobs in NAICS 21 + 23 + 31–33, place of residence | Same | Yes if suppressed |
| Gold | GDP, current CAD, basic prices, place of work | Nation, P/T, CMA only | **Yes** for Iqaluit and any city without CMA GDP |
| Science | Jobs in NAICS 54 + 51, place of residence | Same | Yes if suppressed |
| Culture | Jobs in NAICS 71, place of residence | Same | Yes if suppressed |
| Unemployment | Rate, 0..1 | Same | Yes if suppressed |

Leaderboards skip nulls. The report and Almanac state the vintage and the basic-prices caveat for Gold.

---

## 10. UI surfaces and acceptance criteria

The visual language should feel like a 4X atlas (hex terrain, banners, yield chips, court-titled advisors) while remaining original art. Loading screen: EN “Surveying the land…” / FR “Arpentage du territoire…”.

### 10.1 Top bar

Contains: brand (Canada, bilingual), national yield chips (Population, Food, Production, Gold, Science, Culture, Unemployment), search, **Turn `<year>` · `<vintage>`**, Advisors (from v1), Share, Help (`?`), Almanac, language control.

**Acceptance**

- [ ] Each chip shows a formatted national figure and opens a national report (P/T and city leaderboards) on click.
- [ ] Gold formats as CAD, not USD.
- [ ] Turn reflects `nation.year` and `nation.vintage`.
- [ ] Language control switches all chrome; it is visible on desktop and mobile.

### 10.2 Map canvas and camera

Pan (drag, WASD, arrows), zoom (scroll, `+`/`–`, pinch, double-click), minimap jump. Idle map does not run a continuous animation loop.

**Acceptance**

- [ ] The full 13 P/T landmass is reachable.
- [ ] Zoom keeps terrain legible from national view down to a few hexes (LOD may simplify art when zoomed out).
- [ ] A mid-zoom view of a CMA shows its banner and neighbouring terrain without clipped controls on a 360 px-wide viewport.

### 10.3 Lenses and resources

Lens dock with quick lenses, a full picker grouped as in `lenses.json`, and a legend with histogram plus brushable range (cells outside the band dim). `L` / Shift+`L` cycle. `R` toggles resource icons (when `resources.json` exists).

**Acceptance**

- [ ] Every MVP lens colouring matches `lenses.json` values; foreign and water cells are not painted as if they were Canadian CDs.
- [ ] The legend shows the unit, a short caveat (`note`), and a working range filter.
- [ ] Clearing the lens returns to terrain.

### 10.4 Map layers (v1)

Map menu toggles: Roads, Railroads, Ports & airports, Military, Wonders, Trade routes (Trade hidden if `trade.json` is absent). Defaults can be “some on, some off”; non-default sets are stored in the hash.

**Acceptance**

- [ ] Toggles do not break pan/zoom performance beyond §12.
- [ ] Tooltips identify the feature and do not claim ranks the data does not support.
- [ ] Military points cite the DND directory (or a better open GIS) in the tooltip or Almanac.

### 10.5 City View

Click a city banner. Tabs for MVP: at least **Economy** and **Workforce** (or a single combined panel that includes GDP, jobs, and yields). v1 adds **Citizens**, **Districts**, **Resources**, **Compare**. Highlight the metro footprint on the map. Show city-type badge when districts exist. Rank medallions when `ranks` is present.

**Acceptance**

- [ ] All 41 CMAs plus Whitehorse, Yellowknife, and Iqaluit are searchable and open a City View.
- [ ] Iqaluit opens even with `gdp: null`; Gold shows “no data,” not zero.
- [ ] Ottawa–Gatineau lists both Ontario and Quebec.
- [ ] District plaques (v1) are labelled as specialisation, not as a map of neighbourhoods.
- [ ] Closing Esc / close button returns to the map; the URL updates.

### 10.6 Province / territory view

Click Canadian land that is not consumed by a city click. Panel shows name (both languages available), yields, ranks among 13, and land mix if present.

**Acceptance**

- [ ] Every P/T, including NU, NT, and YT, has a working panel.
- [ ] Clicking a hex in a CMA still prefers the city if the click hits a banner / city tile, as in usaciv.

### 10.7 Advisors (v1)

Council plus: Energy & Resources, Economy, People, Prosperity & Housing, Knowledge, Land, Military, Commerce, Culture, Explorer. Court titles are translated (do not leave English titles in the French UI). Dashboards link both ways with the map (highlight, filters). Explorer: table + scatter for P/T, cities, and census divisions, any documented column.

**Acceptance**

- [ ] Each advisor opens with real numbers from the JSON payloads (no placeholder charts).
- [ ] Explorer selection highlights on the map.
- [ ] Titles and chrome follow `lang`.

### 10.8 Almanac

Modal with pages for About, yields, lenses, terrain, sources / licences, and (v1) wonders, districts, layers. About states: visualizer not a game; inspired by usaciv; MIT code vs OGL-C / Statistics Canada data licences.

**Acceptance**

- [ ] Every yield, MVP lens, and mapped source has a page or entry with vintage and link.
- [ ] Required attribution text / links for OGL-C and Statistics Canada Open Licence are present.
- [ ] The “missing is null, never zero” rule is stated.

### 10.9 Search

`/` or Ctrl/⌘K. Cities and provinces (and v1: CDs optional). Match both official language forms. Empty state is a clear “no matches” message, not a hang.

**Acceptance**

- [ ] Typing “Iqaluit”, “Montréal”, “Montreal”, “Québec”, and “Nunavut” in either language finds the right place.
- [ ] Choosing a result flies the camera and opens the panel.

### 10.10 Help and share

`?` opens a control sheet. Share copies the canonical view URL and can download a PNG (suggest 1600×900) of the current view, with a short credit line (Canada Civ; Statistics Canada / Government of Canada data; inspired by usaciv).

**Acceptance**

- [ ] Pasting the copied URL in a fresh session restores lens, selection, language, and approximately the same camera.
- [ ] The PNG is readable and includes attribution.

### 10.11 URL hash format

Use this contract (query-string after `#`):

```
#lang=fr&lens=income&city=535&province=ON&at=x,y,z&layers=roads,rail
```

| Key | Value |
| --- | --- |
| `lang` | `en` or `fr`. Omit to use the default (§11). |
| `lens` | A `lenses.json` id, or omit for terrain. |
| `city` | A `cities.json` id (`535` or `csd-…`). |
| `province` | P/T `abbr` (`ON`, `QC`, `NU`, …). If both `city` and `province` are set, city wins the panel. |
| `at` | `x,y,z` where `x,y` are map-km centre (rounded) and `z` is a zoom parameter that **frames the same area on any screen** (usaciv uses `log2(scale / home-fit scale)` — do the same or document an equivalent). |
| `layers` | Comma-separated toggle ids that differ from defaults, or `none`. Omit when all toggles are default. |

Lens, language, or selection changes **push** a history entry (Back undoes them). Camera moves **replace** the current entry. Debounce camera writes (~350 ms). Hash updates must not break the back button.

### 10.12 Keyboard and pointer (MVP)

| Action | Binding |
| --- | --- |
| Pan | Drag, WASD, arrow keys |
| Zoom | Scroll, `+`, `–`, pinch, double-click |
| Search | `/`, Ctrl/⌘K |
| Next / previous lens | `L`, Shift+`L` |
| Resources (when present) | `R` |
| Help | `?` |
| Close topmost UI | Esc (help, search, share, report, Almanac, then the panel) |

---

## 11. Bilingual EN / FR requirements

- Every chrome string (buttons, tabs, help, loading, empty states, yield labels, lens names, advisor titles, report headings) has an English and a French form.
- Official names use Statistics Canada official forms (Montréal, Québec, Ottawa–Gatineau, etc.).
- Default language: `lang` in the hash if present; else the browser’s `navigator.language` if it starts with `fr`; else English.
- Switching language does not reset the camera or selection.
- `html lang` attribute updates (`en` or `fr`).
- Almanac and share attribution exist in both languages.
- Do not ship machine-translated court titles unreviewed; if a human review is not available, use plain descriptive titles in both languages (e.g. “Economy” / “Économie”) rather than a broken joke.

---

## 12. Performance, browsers, mobile

| Budget | Bar |
| --- | --- |
| Time to first interactive, mid-range laptop, JSON already cached | Under **5 seconds** |
| `world.json` | Target **under 2.5 MB**; report the size in spike notes |
| All required MVP JSON together | Target **under 8 MB** uncompressed |
| Eager optional layer files | About **≤ 300 KB** each, unless a documented exception |
| Idle CPU | No continuous rAF loop when nothing is moving or animating a one-shot highlight |
| Static-layer draw | Keep cached-map layers cheap; cull to the viewport |

**Browsers:** latest Chrome, Firefox, Safari, and Edge, plus current iOS Safari and Android Chrome. No IE. Canvas 2D and ES modules are required.

**Mobile:** usable at ~360 px width. Top bar may scroll horizontally. City / province / advisor docks may become bottom sheets (usaciv does this). Hit targets remain tappable. The hash still works.

---

## 13. Honesty, licensing, and Indigenous-lands rule

- Every visible number has a vintage and an Almanac citation.
- Yields are names on real figures. Positions are schematic.
- Selection rules (wonders, districts, resource cutoffs) are published inside the data files.
- Credit Open Government Licence – Canada and, where applicable, the Statistics Canada Open Licence, in the Almanac, help footer, and share image. See [DATA-SOURCES.md](DATA-SOURCES.md).
- Indigenous lands overlay is **not MVP**. If added later: optional toggle, official names from the NRCan legislative-boundaries product, no yields or “territory” game language, and an Almanac caveat that these are legislative / administrative boundaries, not a complete map of traditional territories, treaties, or unceded land. Ship only after a written sensitivity review in the PR.

---

## 14. Definition of done

### MVP is done when

1. Milestones 0 and 1 acceptance checklists are complete.
2. All 13 P/T appear on one map; Iqaluit, Whitehorse, and Yellowknife are in City View / search.
3. All §10 MVP UI criteria pass, including bilingual chrome and hash restore.
4. All MVP lenses and yields match §8–§9; Gold is CAD; no invented CD GDP.
5. `uv run python -m pipeline check` and unit tests pass.
6. Almanac + help + share image include required attribution and the usaciv inspiration credit.
7. Performance meets §12 or a written waiver with measurements is in the repo.
8. README status is updated to “MVP runnable” with serve instructions.
9. No usaciv source tree has been committed.

### v1 is done when

MVP is done, plus Milestone 2 criteria (citizens, districts, resources, layers, wonders, advisors/Explorer, v1 lenses) and their §10 checks.

### This documentation repository (current commit) is done when

A new coding agent can implement MVP from these docs alone, without reading a chat history. That is the purpose of this repo until code lands.

---

## 15. Open questions

Resolve these in spike notes or a spec PR; do not block Milestone 0 on them except where noted.

1. **Hex radius:** stay at 25 km after measurements, or move to 30 km with a written performance reason? (Default: 25 km.)
2. **University wonders:** is there an open, citable Canadian university R&D series good enough for a published rule? If no, omit the slot.
3. **Indigenous lands overlay:** who reviews it, and what default (on/off) and naming do they want? (Not MVP.)
4. **Raster preprocess:** is a documented one-time GDAL step acceptable for MRDEM and land cover? (Allowed by §3 if documented.)
5. **Trade routes:** is there a Canadian freight-flow matrix that is open enough? If no, omit `trade.json`.
6. **CA cutoff for later “town” panels:** what population threshold, besides always keeping territorial CAs?
7. **Public name and host:** keep the repo name `canada-civ`, or a quieter public title? Hosting is out of band.
8. **Census vintage:** stay on 2021 geography until 2026 Census products are fully available, then plan a version bump.

When an open question is decided, edit this section and the affected paragraphs in the same PR.
