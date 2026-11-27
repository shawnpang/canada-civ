# Changelog

Each development stage is a commit on `main`. Finished milestones also get a tag (`m0`, `m1`, …) so a stage can be checked out later.

## Unreleased

Fidelity pass toward usaciv visual quality (target tag `v1.1` after a second audit). Work so far, on `v11-integrate`:

- Original terrain renderer with LOD bands, a sprite cache, world-anchored prairie patchwork, denser forest clumps, overlapping mountain massifs, and Arctic snow/ice texture.
- Midpoint shoreline treatment with shallows and a surf rim; lake interiors are darker than the rim.
- Schematic city tiles and district plaques (positions labelled as schematic).
- Larger tracked province typography; compact “P.E.I.” / “Î.-P.-É.” at national zoom with a water callout; full NEW BRUNSWICK at mid-east zoom.
- Offscreen static map cache (~160 px margin) for short pans.
- Compact City View figures (full official values in titles), tighter typography, short panel transitions, and a slightly shorter mobile header.
- Schematic crop symbols from Statistics Canada Census of Agriculture 2021 table 32-10-0309-01 (hectares by census division; suppressed values stay null).
- Optional `election2025` lens from Elections Canada official voting results (Table 11) and 2025 federal riding boundaries, joined by majority overlap; 55 land hexes without a majority stay blank. Attribution required; commercial redistribution of that dataset needs Elections Canada permission.
- Advisors Explorer columns from Statistics Canada table 98-10-0002-01.

Independent checks recorded in `/workspace/canada-civ-runs/verification.md`.

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
