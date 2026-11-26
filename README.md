# Canada Civ

Canada Civ is a **read-only, Civilization-styled data atlas of Canada**: the real landmass drawn as a hex map, with yields, city and province panels, data lenses, and an Almanac that traces every number back to an official open source. It is a visualizer, not a game. There are no units, tech trees, opponents, or win conditions.

It covers **all 10 provinces and 3 territories**, including the North, in a **bilingual English and French** interface.

## Inspiration and attribution

This project is inspired by [usaciv](https://karpathy.ai/usaciv/) by [Andrej Karpathy](https://x.com/karpathy/status/2125779541952246039): *the United States as a strategy-game map*, built from public data. Karpathy released the original under the MIT License as [usaciv-source.zip](https://karpathy.ai/usaciv/usaciv-source.zip). Canada Civ follows that idea, architecture, and honesty rules for Canadian geography and statistics. We do not claim affiliation with Karpathy or with any game publisher. See [NOTICE](NOTICE) and [docs/REFERENCE-USACIV.md](docs/REFERENCE-USACIV.md).

## Status

**Documentation only.** This repository is the build-ready specification for implementing Canada Civ. Application code has not been written here yet. Coding agents should treat [docs/SPEC.md](docs/SPEC.md) as the source of truth for the deliverable, and [docs/MILESTONES.md](docs/MILESTONES.md) as the ordered work plan (start at Milestone 0 / MVP).

## What “done” looks like

A static site, served from `web/` with no bundler, that:

1. Shows all 13 provinces and territories on one hex map (EPSG:3347, 25 km hex radius unless the spike records a measured reason to change it).
2. Lets a visitor search, pan, zoom, open a CMA or territorial capital, open a province or territory, switch lenses, and share a URL that restores the same view.
3. Displays national yields (Population, Food, Production, Gold, Science, Culture, Unemployment) named in Civ language but computed from real Statistics Canada figures, in Canadian dollars where money is shown.
4. Works in English and French, including chrome, Almanac, and official place names.
5. Cites every visible number in the Almanac, with vintage and licence.

The full definition of done, schemas, sources, UI, and acceptance criteria are in the docs below.

## Docs

| Doc | Purpose |
| --- | --- |
| [docs/SPEC.md](docs/SPEC.md) | Implementation-ready product and technical spec (read this first for “what to build”) |
| [docs/MILESTONES.md](docs/MILESTONES.md) | Ordered milestones and agent-sized tasks, MVP first |
| [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) | Canadian data sources, licences, URLs, and what each feeds |
| [docs/REFERENCE-USACIV.md](docs/REFERENCE-USACIV.md) | How the original usaciv works, with screenshots |
| [AGENTS.md](AGENTS.md) | Instructions for coding agents: read order, conventions, how to verify |
| [NOTICE](NOTICE) | Attribution to usaciv and data-licence reminder |

## Licence

Code and documentation in this repository are [MIT](LICENSE). Upstream usaciv code, if later reused, remains Karpathy’s MIT work (see [NOTICE](NOTICE)). Government data is under its own open licences and requires attribution.
