# Changelog

Each development stage is a commit on `main`. Finished milestones also get a tag (`m0`, `m1`, …) so a stage can be checked out later.

## Unreleased

### Later — visual polish (deferred)

Residual art gaps accepted with Milestone 0, to be tightened after MVP/v1 feature work rather than blocking the atlas:

- Procedural terrain marks are simpler and more repetitive than the reference atlas
- Coastlines, lakes, and borders remain coarse hex approximations

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
