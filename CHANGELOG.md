# Changelog

Each development stage is a commit on `main`. Finished milestones also get a tag (`m0`, `m1`, …) so a stage can be checked out later.

## Unreleased

- Fix trailer zoom artifacts (Vancouver dive and election pull-out) by overscanning the map render, flushing each canvas, and pre-warming sprite and lens caches; extend the synthesised score's final fade to 1.5 s so it resolves to silence at 30 s.
- Add an unlinked developer trailer maker using the atlas renderer and payloads, adapted from usaciv's MIT-licensed trailer technique, with a synthesised JavaScript score. See NOTICE for attribution.
- Serve the atlas at `https://shawnpang.xyz/canada-civ` (a path on the personal site, rewritten to this project's Vercel deployment) as well as `https://canada-civ.vercel.app`. Relative asset URLs now stay correct under the `/canada-civ` prefix, including hash updates used by share links, City View, and province panels.

## 2026-11-27 — v1.2

- Date: 2026-11-27 (Asia/Singapore)
- Tag: `v1.2` (this commit)

National-view fidelity pass toward usaciv, after v1.1 close zoom was accepted. Eight parallel workstreams, then integration on `v12-integrate`.

- Saturated far-zoom land palette (vivid forests, yellow-ochre prairies) and compact snow-capped relief marks at landing; close-zoom fills stay the v1.1 colours.
- Foreign neighbours (Alaska, Greenland, the contiguous US, Saint-Pierre-and-Miquelon) use the existing `owner === -2` Natural Earth classification, painted muted grey with a grid-edge vignette.
- Thin dark province, territory, and international borders along shared hex edges at every zoom.
- City banners coloured by the published `districts.json` NAICS badge, with a type icon, leader arrow, pill shape, and a matching City types legend.
- National zoom keeps major metros (including Calgary, Edmonton, Ottawa–Gatineau, and Québec) and hides town labels; official names are not shortened.
- Arctic ice and tundra read as cohesive sheets rather than per-hex noise; water still owns the shoreline.
- Distinct deep-ocean, shelf, and lake blues at every zoom, so the Great Lakes and Hudson Bay stay clearly blue at landing.
- Bottom toolbar uses gold-bordered icon-and-label chips; header yield icons use their existing distinct colours.

`pipeline check` and 105 unit tests pass. No new statistical series were invented.

Remaining gaps, recorded honestly: far-zoom mountain caps are still subtler than usaciv's Rockies; Arctic islands are cohesive but still show some hex texture; the national land mosaic is richer than v1.1 but slightly smoother than usaciv's hex-by-hex variation; header yield labels stay hidden at 1440px so the vintage string remains visible; Hamilton and a few other southern Ontario metros can still lose a landing banner when they sit only a few pixels from Toronto.

## 2026-11-27 — v1.1

- Date: 2026-11-27 (Asia/Singapore)
- Tag: `v1.1` (this commit)

Fidelity pass toward usaciv visual quality. Two audit-and-fix loops on `v11-integrate`, then this tag.


- Original terrain renderer with LOD bands, a sprite cache, world-anchored prairie patchwork, denser forest clumps, overlapping mountain massifs, and Arctic snow/ice texture.
- Midpoint shoreline treatment with shallows and a surf rim; lake interiors are darker than the rim.
- Schematic city tiles and district plaques (positions labelled as schematic).
- Larger tracked province typography; compact “P.E.I.” / “Î.-P.-É.” at national zoom with a water callout; full NEW BRUNSWICK at mid-east zoom.
- Offscreen static map cache (~160 px margin) for short pans.
- Compact City View figures (full official values in titles), tighter typography, short panel transitions, and a slightly shorter mobile header.
- Schematic crop symbols from Statistics Canada Census of Agriculture 2021 table 32-10-0309-01 (hectares by census division; suppressed values stay null).
- Optional `election2025` lens from Elections Canada official voting results (Table 11) and 2025 federal riding boundaries, joined by majority overlap; 55 land hexes without a majority stay blank. Attribution required; commercial redistribution of that dataset needs Elections Canada permission.
- Advisors Explorer columns from Statistics Canada table 98-10-0002-01.

Independent checks: all 343 Elections Canada Table 11 winners match the payload; census division 1103 wheat is 5,620 hectares (quality B) in table 32-10-0309-01; Toronto population and GDP are unchanged from the previously verified official tables. `pipeline check` and 96 unit tests pass.

Remaining gaps, recorded honestly: national zoom is still flatter than usaciv; mountain spacing can still hint at the hex grid; coasts are smoothed and given shallows but stay schematic at the 25 km cell size; unemployment remains the labelled 2021 Census rate; neighbour-country mute fill was not added; town coordinates still use the documented GeoSuite mirror.


## 2026-11-27 — v1.0

- Date: 2026-11-27 (Asia/Singapore)
- Tag: `v1.0` (this commit)

Final polish on Milestone 3. Mountains and fields are less regularly stamped; roads and rail default on as official Atlas of Canada map art, like usaciv, and fade under a data lens; New Brunswick is labelled at national zoom; the time-slider label stays readable when City View is open; the mobile yield strip wraps so the last yields stay visible; the Advisors council shows Explorer; `pipeline build` and `all` re-merge the disasters lens; the official CDD extract was cached and retabulated (1,103 mapped events in 442 land hexes) so the reproducibility test runs and passes. README now has a “Run locally” section and screenshots.

Remaining gaps versus usaciv, recorded honestly: mountains and fields are still simpler and more schematic than the reference art; Prince Edward Island’s name can still be hard to read at national zoom in the browser (a layout simulation placed all 13 names, but Georgia metrics differ); town coordinates used a documented third-party GeoSuite mirror when the official package blocked automated retrieval; optional CSD Explorer columns, crop resources, and an elections lens were not added; unemployment remains the 2021 Census rate, labelled as such.


## 2026-11-27 — Milestone 3 accepted

- Date: 2026-11-27 (Asia/Singapore)
- Tag: `m3` (this commit)
- Integration branch: `m3-integrate`

Milestone 3 without the Indigenous lands overlay, plus a fidelity pass. Census agglomeration towns, a Canadian Disaster Database point-marker lens, a population-only time slider, NW-lit terrain marks, label collision handling, ranks computed from official payloads, header and Compare-tab fixes, mobile chrome, a bilingual loading screen, filled Advisors and Explorer, Share PNG 1600×900, and WASD keyboard parity. `pipeline check` and 80 unit tests pass (one disaster-source reproduction test skipped: the official extract is not cached in this environment). Screenshots: `/workspace/canada-civ-runs/screens/m3-*.png`.

Independent checks: all 109 town July 2025 populations match table 17-10-0148-01, including the three interprovincial CAs at their combined totals; Toronto GDP per person ranks 2nd and growth 23rd among cities with official figures; national and Ontario GDP on the Treasurer dashboard match the previously verified tables. GDP history was not invented. Town coordinates use GeoSuite representative points; the official package blocked automated retrieval, so the build used a documented MountainMath mirror.

## 2026-11-27 — Milestone 2 accepted


- Date: 2026-11-27 (Asia/Singapore)
- Tag: `m2` (this commit)
- Integration branch: `m2-integrate`

v1 richness on the Milestone 1 atlas: unified header (Advisors, Share, help, Almanac, centred search), City View tabs with Census pictograms, location-quotient districts, official employed counts and tenant shelter costs, GDP per person only when both official GDP and population exist (vintages labelled), resource and infrastructure layers, Parks Canada wonders (universities omitted: no open institution-level R&D series), painted province names, denser mid-zoom banners, and six additional Census 2021 lenses. `pipeline check` and 71 unit tests pass. Screenshots: `/workspace/canada-civ-runs/screens/m2-*.png`.

Residuals, recorded rather than invented: clipped Compare tab label and header vintage; some overlapping province labels; no GDP-per-person or growth ranks in the payload (medallions show a dash); immigrant-share and 30-minute commute lenses stand in for exact foreign-born share and mean commute duration; terrain-art polish remains deferred.

## 2026-11-27 — Milestone 1 accepted

- Date: 2026-11-27 (Asia/Singapore)
- Tag: `m1` (this commit)
- Integration branch: `m1-integrate`

A bilingual MVP atlas on the Milestone 0 hex map. Official payloads cover 41 CMAs, Whitehorse, Yellowknife, and Iqaluit; 13 provinces and territories; national yields (gold is current CAD at basic prices); ten lenses; search, share, and Almanac. `pipeline check` and 37 unit tests pass. Headless screenshots are in `/workspace/canada-civ-runs/screens/m1-*.png`. Independent Statistics Canada checks of the 14 worksheet population and GDP values all match; unemployment rates match the 2021 Census Profile, not the current Labour Force Survey, and City View states that caveat. See `docs/verification-notes.md`.

Known gaps recorded, not filled in: `employed` and `median_rent` are null in the city and province payloads (City View shows “No data”, not zero); unemployment is the 2021 Census rate, labelled as such, not the current Labour Force Survey; the national yield bar clips on a narrow mobile viewport; residual terrain-art polish remains deferred; Advisors and `resources.json` / `infrastructure.json` are early Milestone 2 work and are not part of this acceptance.

## 2026-11-27 — Milestone 0 accepted

- Date: 2026-11-27 (Asia/Singapore)
- Tag: `m0` → `638fffb`
- Commits: `b4bbfdb` (terrain spike), `638fffb` (visual fidelity pass and relief-sampling notes)

A browsable 25 km hex map of all 13 provinces and territories, CRS EPSG:3347, 134 × 134 cells. Official elevation, land cover, boundaries, and hydrography are recorded in `sources.json`. The viewer is bilingual, with pan, zoom, minimap, canvas-filling ocean, and a compact header. Elevation sampling uses a 16× MRDEM overview after a 64× extract was found to smooth mountain variation.

The `m0` tag is the fidelity-pass commit `638fffb`. Remaining art residuals listed under Unreleased are not part of this acceptance.

## 2026-11-26 — specification

- Commit: `5ad03bf`
- Tag: none

Initial public repository: product specification, milestones, data sources, reference notes, and agent guide. Documentation only; no map yet.
