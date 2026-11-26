# Instructions for coding agents

This repository is a **specification first**. Implement Canada Civ from the docs; do not invent a different product, and do not copy the usaciv source tree into this repo.

## Read order

1. [README.md](README.md) — pitch, attribution, status.
2. This file.
3. [docs/SPEC.md](docs/SPEC.md) — the deliverable. Scope, stack, layout, schemas, UI, acceptance criteria, definition of done.
4. [docs/MILESTONES.md](docs/MILESTONES.md) — do the milestones in order. Start at Milestone 0. Do not skip ahead of MVP unless a later milestone is explicitly assigned.
5. [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) — exact sources, URLs, licences. Record the live Statistics Canada table id and vintage in `sources.json` when you fetch.
6. [docs/REFERENCE-USACIV.md](docs/REFERENCE-USACIV.md) — how the original behaves. Match the *interaction model and honesty rules*, not the US geography or US source names.
7. [NOTICE](NOTICE) and [LICENSE](LICENSE).

## What this project is

A bilingual, read-only Civ-styled **visualizer** of Canada (all 13 provinces and territories). Not a game. Gold is GDP in Canadian dollars. Missing data stays `null`, never `0`.

Inspired by Andrej Karpathy’s [usaciv](https://karpathy.ai/usaciv/) (MIT). Read the official zip for reference if you need to understand a mechanism: https://karpathy.ai/usaciv/usaciv-source.zip. **Do not vendor that zip into this repository.** If you later reuse specific files, keep Karpathy’s copyright and MIT notice (see NOTICE) and say what you reused in the PR or commit message.

## Conventions

- **Python 3.11+**, standard library only in the pipeline runtime, run with `uv`. A documented one-time raster preprocess (for example GDAL to turn a GeoTIFF into a compact interim) is allowed only if SPEC and the Almanac say so; do not add a hidden GIS stack to `pyproject.toml` without updating the spec.
- **Frontend:** plain ES modules and Canvas 2D. No framework, no npm, no bundler, no WASM requirement. Serve `web/` over HTTP.
- **Coordinates:** map kilometres, EPSG:3347 projected, origin top-left, *y down*, matching usaciv’s screen-space convention even though the CRS differs.
- **Hexes:** pointy-top, odd-r, radius **25 km** unless Milestone 0 records a measured decision to change it.
- **Money:** Canadian dollars. Never label CAD figures as USD.
- **Languages:** every user-visible chrome string has English and French. Official StatCan toponyms: use both official forms.
- **Honesty:** publish selection rules inside the data files (wonders, districts, resource cutoffs). Every lens has a caveat. Attribution for OGL-C and the Statistics Canada Open Licence appears in the Almanac, help, and share image.
- **Identifiers:** Statistics Canada official codes (PRUID, CDUID, CMAUID, CSDUID). Iqaluit is included even though it is not a CMA or CA; follow SPEC for its `kind` and `id`.

## How to verify

After each milestone, run that milestone’s acceptance criteria in [docs/MILESTONES.md](docs/MILESTONES.md) and the relevant feature criteria in [docs/SPEC.md](docs/SPEC.md).

Minimum commands once the pipeline exists:

```bash
uv run python -m pipeline check
uv run python -m unittest discover -s tests
uv run python -m pipeline serve   # then exercise the UI checklist in SPEC
```

`pipeline check` must exit 0 (no FAIL). WARN lines are allowed only if the milestone says so. Visually confirm all 13 provinces and territories, bilingual toggle, and that a shared URL restores the view.

Do not claim a milestone is done without running its verification steps and listing what you ran.
