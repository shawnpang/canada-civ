# Canadian data sources

All sources below were checked against official pages in November 2026. Statistics Canada **retires and replaces table numbers**; at fetch time, record the live table id, release date, and vintage in `web/data/sources.json`. Prefer official downloads that need **no API key**.

Money figures are **Canadian dollars**. Census geography counts below are for the **2021 Census** unless noted.

## Licences (read before shipping)

| Licence | URL | Obligation |
| --- | --- | --- |
| Open Government Licence – Canada | https://open.canada.ca/en/open-government-licence-canada | Attribution. Use, copy, modify, and distribute are allowed, including commercially, if you credit the named government source and link the licence. |
| Statistics Canada Open Licence | https://www.statcan.gc.ca/en/reference/licence | Attribution to Statistics Canada. FAQ: https://www.statcan.gc.ca/en/terms-conditions/open-licence-faq |
| Natural Earth public domain | https://www.naturalearthdata.com/ | Neighbour countries and off-shore context only, if used. |

These are **not** US public-domain federal works. The MIT licence on this repository does not cover the data. Credit must appear in the Almanac, the help footer, and share images.

## Geography and population

| ID | Source | Publisher | Licence | URL | Feeds |
| --- | --- | --- | --- | --- | --- |
| `statcan_boundaries_2021` | 2021 Census Boundary Files (cartographic preferred for the coastline; digital if a layer needs water extent). Lambert conformal conic, NAD83, **EPSG:3347**. | Statistics Canada | Statistics Canada Open Licence | https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index2021-eng.cfm?year=21 | Province/territory outlines, census divisions (CDs, 293), census subdivisions (CSDs), CMA/CA outlines, land vs water |
| `statcan_geo_dict_2021` | Dictionary, Census of Population, 2021 — geographic counts and definitions | Statistics Canada | Statistics Canada Open Licence | https://www12.statcan.gc.ca/census-recensement/2021/ref/dict/tab/index-eng.cfm?ID=T1_1 | 13 P/T, 293 CDs, 41 CMAs, 111 CAs, 5,161 CSDs (confirm if a later census vintage is adopted) |
| `statcan_cma_ca` | CMA and CA member municipalities / principal cities (2021 delineations, or the vintage used for GDP and population estimates) | Statistics Canada | Statistics Canada Open Licence | Linked from the 2021 boundary / geography reference pages above | City placement, member CDs/CSDs, `cities.json` |
| `statcan_ade_pt` | Annual Demographic Estimates, provinces and territories (July 1). Historical table often cited: 17-10-0005-01. Confirm live id. | Statistics Canada | Statistics Canada Open Licence | Search from https://www150.statcan.gc.ca/ | National and P/T population, growth, `pop_series` |
| `statcan_ade_subprovincial` | Annual Demographic Estimates, subprovincial (CMAs, CAs, census divisions). 2025 release announced in The Daily, 14 Jan 2026. | Statistics Canada | Statistics Canada Open Licence | https://www150.statcan.gc.ca/n1/daily-quotidien/260114/dq260114a-eng.htm | City and CD population change on consistent borders |
| `statcan_ade_ca` | Table **17-10-0148-01**, July 1 population estimates, 2021 CMA/CA boundaries; 2025 preliminary estimates, released January 14, 2026 | Statistics Canada | Statistics Canada Open Licence | https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1710014801 | Town selection and 2025 population |
| `statcan_census_ca` | Table **98-10-0005-01**, 2021 Census population and dwelling counts for CMA/CA geographies | Statistics Canada | Statistics Canada Open Licence | https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810000501 | Bilingual CA names and 2021 population counts |
| `statcan_geosuite_csd` | 2021 Census GeoSuite, census subdivisions | Statistics Canada | Statistics Canada Open Licence | https://www150.statcan.gc.ca/n1/en/catalogue/92-150-x | Town anchor coordinates and province membership |

For each town, the 2021 GeoSuite representative point of its most populous member census subdivision with a point is the anchor; ties use the smallest CSDUID. It is a CSD point, **not a CA centroid**. Coordinates are projected to EPSG:3347 and the nearest land hex in the anchor CSD's province or territory is recorded as the cell. The official GeoSuite package blocked automated retrieval. The included `pipeline/ca_towns_geosuite.csv` is an extract of the independently rehosted [MountainMath GeoSuite CSD table](https://data.mountainmath.ca/census/geo_suite/2021/CSD.parquet), retaining the 428 CSDs belonging to 2021 CAs and fields needed for the build. The source catalogue records the mirror and extract hashes and the official package URL.

## Economy, labour, and social statistics

| ID | Source | Publisher | Licence | URL | Feeds |
| --- | --- | --- | --- | --- | --- |
| `statcan_census_2021_profile` | Census of Population 2021, data tables / profiles (income, housing, education, language, labour, immigration, religion, commute) at Canada, P/T, CD, CMA/CA, and CSD | Statistics Canada | Statistics Canada Open Licence | https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/index-eng.cfm | Yields (job counts), citizens, most lenses, City View panels. Primary structural source (no annual ACS analogue) |
| `statcan_gdp_cma` | Table **36-10-0468-01**, GDP at basic prices, by census metropolitan area (current dollars). Includes non-CMA remainder by province. | Statistics Canada | Open Government Licence – Canada / Statistics Canada Open Licence | https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610046801 | City and “rest of province” **Gold** yield. **Not published at CD.** |
| `statcan_gdp_pt_industry` | Table **36-10-0711-01**, GDP at basic prices by industry, provinces and territories (replaces archived 36-10-0402) | Statistics Canada | Open Government Licence – Canada / Statistics Canada Open Licence | Portal entry: https://open.canada.ca/data/en/dataset/bfdc6f03-0ba7-4b06-b7bf-213674472ac2 — confirm the live table page at fetch | Province Gold, GDP by industry, national roll-up |
| `statcan_lfs_cma_industry` | Table **14-10-0468-02**, employment by industry and CMA, annual, Labour Force Survey, NAICS | Statistics Canada | Statistics Canada Open Licence | https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410046802 | Optional newer industry employment for large CMAs; Almanac must say when a yield uses LFS vs Census 2021 |
| `statcan_lfs_pt_industry` | LFS employment by industry, Canada and provinces (confirm live table id; industry classification NAICS Canada) | Statistics Canada | Statistics Canada Open Licence | Search from https://www150.statcan.gc.ca/ | National / P/T yield updates where the census is too old and the table covers the geography |

### Yield mapping (NAICS Canada)

Use Census 2021 employed labour force by industry (place of residence) for MVP yields other than Gold, unless a later vintage is documented in `nation.json`.

| Yield | Definition | Notes |
| --- | --- | --- |
| Population | Resident population | Annual estimates for the top bar year if available; otherwise Census 2021. Say which. |
| Food | Agriculture, forestry, fishing, and hunting | NAICS 11 |
| Production | Mining, quarrying, and oil and gas extraction + construction + manufacturing | NAICS 21, 23, 31–33 |
| Gold | GDP, current dollars, **basic prices** | CMA table 36-10-0468-01; P/T table 36-10-0711-01. Almanac must explain basic prices vs market prices. Unit: CAD / year. |
| Science | Professional, scientific, and technical services + information and cultural industries | NAICS 54 + 51. Information is bundled differently than the US ACS split; say so. |
| Culture | Arts, entertainment, and recreation | NAICS 71. Do not silently fold in NAICS 51. |
| Unemployment | Unemployment rate | Census 2021 or LFS; vintage on the chip and in the Almanac. |

**Do not invent GDP at census-division level.** If a CD panel or lens needs an economic figure that is not published, show “no data.”

## Terrain, hydrography, and transport

| ID | Source | Publisher | Licence | URL | Feeds |
| --- | --- | --- | --- | --- | --- |
| `nrcan_mrdem` | Medium Resolution Digital Elevation Model (MRDEM, 30 m), CanElevation series. **Replaces the retired CDEM.** DTM preferred for relief. | Natural Resources Canada | Open Government Licence – Canada | https://open.canada.ca/data/dataset/18752265-bda3-498c-a4ba-9dfe68cb98da | `elev`, `elev_max`, relief classes, hillshade, ocean/coast depth if the product covers it; otherwise pair with ETOPO for bathymetry |
| `etopo` | ETOPO (NOAA NCEI) | NOAA | Public US government work | Same family usaciv uses (ERDDAP / NCEI). Record the exact URL in `sources.json`. | Bathymetry fallback; optional check against MRDEM on land |
| `nrcan_landcover_2020` | 2020 Land Cover of Canada, 30 m, 15 NALCMS Level-II classes applicable to Canada | Natural Resources Canada / CCRS | Open Government Licence – Canada | https://open.canada.ca/data/en/dataset/ee1580ab-a23d-4f86-a09b-79763677eb47 | `cover`, `pct`, Land lenses. Map classes onto the cover ids in SPEC. |
| `nhn` | National Hydro Network (NHN), GeoBase | Natural Resources Canada | Open Government Licence – Canada | https://download-telecharger.services.geo.ca/pub/nrcan_rncan/vector/geobase_nhn_rhn/ | Rivers, lakes (clip and generalize to the hex map) |
| `nrn` | National Road Network (NRN), and/or Statistics Canada Road Network File of the same census vintage | NRCan / Statistics Canada | Open Government Licence – Canada / Statistics Canada Open Licence | NRCan download directory: https://natural-resources.canada.ca/science-data/science-research/geomatics/download-directory-documentation — StatCan RNF also listed on Open Government (e.g. 2026 Census generalized RNF listings) | Roads layer (generalized; not cadastral) |
| `nrwn` | National Railway Network (NRWN) | Natural Resources Canada | Open Government Licence – Canada | Same GeoBase / NRCan download directory as above | Rail layer |
| `natural_earth` | Natural Earth 1:50m / 1:10m countries, optionally ocean | Natural Earth | Public domain | https://www.naturalearthdata.com/ | Foreign neighbours (Alaska, Greenland, lower 48, Saint-Pierre-and-Miquelon) |

## Energy, mines, places, and hazards

| ID | Source | Publisher | Licence | URL | Feeds |
| --- | --- | --- | --- | --- | --- |
| `nrcan_900a` | Principal Mineral Areas, Producing Mines, and Oil and Gas Fields (900A), annual | Natural Resources Canada | Open Government Licence – Canada | https://open.canada.ca/data/en/dataset/000183ed-8864-42f0-ae43-c4313a860720 | Mine and oil-sands / oil-and-gas field resources. Publish size cutoffs in `resources.json` types. |
| `nrcan_generation` | Generating-station or electricity-facility inventory with coordinates and capacity (NRCan and/or provincial inventories; CER has related facility and international power-line datasets) | NRCan / CER | Open Government Licence – Canada | CER datasets index: https://www.cer-rec.gc.ca/en/applications-hearings/pipeline-abandonment/ace-calculation-method/open-government-datasets.html — also search open.canada.ca for current generating-station layers | Nuclear, hydro, wind, solar, gas, coal, storage sites |
| `cer_pipelines` | Canada Energy Regulator pipeline / facility geospatial data, as published on open.canada.ca | Canada Energy Regulator | Open Government Licence – Canada | Search from https://open.canada.ca/ and the CER open-data page above | Optional infrastructure context; not required for MVP |
| `parks_canada_attendance` | Parks Canada attendance (national parks and historic sites), e.g. 2025–26 dataset | Parks Canada | Open Government Licence – Canada | https://open.canada.ca/data/dataset/1e2bd6b2-d6c7-415b-8c95-f5f6b2459759 | Wonder selection rules (parks; historic sites as a separate rule) |
| `parks_canada_boundaries` | Parks Canada administrative boundaries / park and site locations (current open dataset at fetch) | Parks Canada | Open Government Licence – Canada | Search open.canada.ca for the current Parks Canada boundary product | Wonder footprints and labels |
| `cdd` | Canadian Disaster Database, CDD_Extract_2022_EN (resource updated 2026-02-10) | Public Safety Canada | Open Government Licence – Canada | https://open.canada.ca/data/en/dataset/1c3d15f9-9cfa-4010-8462-0d67e493d9b9 | Disasters lens: distinct supplied point markers per Canadian land hex; a blank does not mean zero events |
| `dnd_bases` | Canadian Armed Forces bases and support units (official public directory). No regularly updated open GIS equivalent of US DoD MIRTA was found in the research pass. | Department of National Defence | Crown copyright / terms on Canada.ca | https://www.canada.ca/en/department-national-defence/services/bases-support-units.html | Military layer: a **curated point list** derived from this directory, with provenance in `sources.json`. Skip troop counts if no citable open table exists. |
| `aboriginal_lands` | Aboriginal Lands of Canada Legislative Boundaries (Indian reserves, land-claim settlement lands, Indian lands) | Natural Resources Canada | Open Government Licence – Canada | https://open.canada.ca/data/en/dataset/522b07b9-78e2-4819-b736-ad9208eb1067 | Optional later overlay only, after the sensitivity review in SPEC. **Not MVP. Not a game resource.** |


| `statcan_agriculture_32100309` | Field crops and hay, Census of Agriculture, 2021 (table 32-10-0309-01), hectares by census division | Statistics Canada | Statistics Canada Open Licence | https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3210030901 | Schematic crop symbols and division-level crop areas. Suppressed and unavailable values stay null. Symbols are decorative, not field locations. |
| `elections_canada_2025` | 45th General Election official voting results, Table 11, and Federal Electoral Districts 2025 SHP (election of 28 April 2025) | Elections Canada | Elections Canada terms: attributed non-commercial reproduction permitted; commercial redistribution requires permission (https://www.elections.ca/content.aspx?document=index&lang=e&section=pri) | https://www.elections.ca/content.aspx?dir=rep/off/45gedata&document=summary&lang=e&section=res | Optional `election2025` categorical lens. A hex is coloured only when one official riding covers more than half of the hex’s overlapped riding area. Blank is not zero. |
| `statcan_csd_population_98100002` | Population and dwelling counts: census divisions and census subdivisions (table 98-10-0002-01) | Statistics Canada | Statistics Canada Open Licence | https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810000201 | Extra CSD Explorer columns. Flagged and suppressed estimates stay null. |

## Transport sites (ports and airports)

Use the best official open coordinate + volume datasets available at fetch (Transport Canada, StatCan transportation tables, or NAV CANADA / Canadian Airport Charts directories if their terms allow). Record whatever product you actually use in `sources.json`. If a volume ranking is not openly licensed, ship locations without a ranked “busiest” claim, or omit the rank.

## Source registry output

`pipeline/build/catalog.py` (or equivalent) must write `web/data/sources.json` as a list of:

```json
{
  "id": "statcan_gdp_cma",
  "title": "GDP at basic prices, by census metropolitan area",
  "publisher": "Statistics Canada",
  "homepage": "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610046801",
  "license": "Statistics Canada Open Licence; Open Government Licence – Canada",
  "description": "…",
  "used_for": "Gold yield for CMAs; non-CMA remainder by province",
  "vintage": "…",
  "files": [
    {"file": "36100468-eng.zip", "url": "https://…", "retrieved": "2026-…", "sha256": "…", "bytes": 0}
  ]
}
```

The Almanac bibliography is this file. If a file was not used in the latest `process()`, do not cite it as if it were.
