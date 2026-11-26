# Changelog

Each development stage is a commit on `main`. Finished milestones also get a tag (`m0`, `m1`, …) so a stage can be checked out later.

## Unreleased

### Milestone 0 — terrain spike (WIP)

- Date: 2026-11-27 (Asia/Singapore)
- Commit: 
- Tag: none yet (the `m0` tag will be added when the spike is accepted)

A first working hex map of all 13 provinces and territories:

- 25 km pointy-top odd-r grid, 134 × 134 cells (17,956 hexes), CRS EPSG:3347
- Terrain, land cover, coasts, lakes, rivers, and province/territory borders and names
- Bilingual (English / French) Canvas viewer with pan, zoom, and URL camera restore
- Pipeline commands (`fetch`, `process`, `build`, `check`, `serve`) and `pipeline check` passing
- Compact `web/data/world.json` and a `sources.json` catalogue with official URLs, product ids, vintages, and licences (Statistics Canada, Natural Resources Canada, NOAA, and Natural Earth)

Still in progress: visual and interaction fidelity to the reference atlas (hillshade and terrain art, ocean filling the canvas, label overlap, minimap, relief-class audit). City panels, yields, and lenses belong to later milestones.

## 2026-11-26 — specification

- Commit: `5ad03bf`
- Tag: none

Initial public repository: product specification, milestones, data sources, reference notes, and agent guide. Documentation only; no map yet.
