# Milestone 0 — terrain spike

The 25 km pointy-top odd-r grid is 134 × 134 (17,956 cells), fitted to the 2021 cartographic extent plus 200 km. `world.json` is 792,543 bytes and `sources.json` 5,437 bytes. All 13 P/T have owned land. Keep 25 km: no measured reason to increase it.

The GIS preprocessing is a separate, repeatable step, not a pipeline dependency: `uv run --with rasterio --with shapely --with pyproj --with fiona python scripts/preprocess_world.py`, then `uv run --with fiona --with pyproj --with shapely python scripts/add_rivers.py`. `pipeline build` runs these when the interim is absent. Raster overviews are nearest-neighbour 64× extracts, approximately 1.92 km, and a 6 km lattice within each hex samples the products. Only samples inside the owning P/T count. Seven points on a 2 km rasterized boundary determine ownership; centre breaks ties. Interior cartographic rings and NRCan Atlas waterbodies are treated as lakes; ocean cells near land or with ETOPO depth less than 200 m are coast. Narrow features can disappear at this scale. The lower 60% valley-floor rule and SPEC relief thresholds are applied. Elevation remains null if unavailable. Foreign elevation is not sampled. Census divisions are deferred beyond this terrain spike.

NALCMS codes: 1,2 → evergreen; 5 → deciduous; 6 → mixed; 8,11 → shrub; 10,12 → grass; 13,16 → barren; 14 → wetland; 15 → crop; 17 → urban; 19 → ice. Water/nodata are excluded; urban takes precedence at 30%. The underlying 2020 product has reported overall accuracy of about 86.9%; the coarse extraction and lattice add sampling uncertainty.

Sources and exact download URLs (licences and checksums in `web/data/sources.json`):

- Statistics Canada 2021 cartographic P/T, 92-160-X, Statistics Canada Open Licence: https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer/0/query?where=1%3D1&outFields=*&outSR=3347&geometryPrecision=0&maxAllowableOffset=1000&f=json
- NRCan MRDEM-30 DTM, OGL-C: https://canelevation-dem.s3.ca-central-1.amazonaws.com/mrdem-30/mrdem-30-dtm.tif
- NRCan 2020 land cover, OGL-C: https://datacube-prod-data-public.s3.ca-central-1.amazonaws.com/store/land/landcover/landcover-2020-classification.tif; class index https://datacube-prod-data-public.s3.ca-central-1.amazonaws.com/store/land/landcover/ClassIndex_v2.pdf
- NOAA ETOPO 2022 60s ice surface, US government work: https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/60s/60s_surface_elev_gtif/ETOPO_2022_v1_60s_N90W180_surface.tif
- Natural Earth 1:50m countries 5.1.1, public domain: https://naturalearth.s3.amazonaws.com/50m_cultural/ne_50m_admin_0_countries.zip
- NRCan Atlas of Canada 1:5,000,000 waterbodies, 2015, OGL-C: https://ftp.geogratis.gc.ca/pub/nrcan_rncan/vector/framework_cadre/Atlas_of_Canada_5M/hydrology/AC_5M_Waterbodies.shp.zip
- NRCan Atlas of Canada 1:5,000,000 rivers, sparse 2017, OGL-C: https://ftp.geogratis.gc.ca/pub/nrcan_rncan/vector/framework_cadre/Atlas_of_Canada_5M/hydrology/AC_5M_Rivers.shp.zip . This official generalized national product replaces the much larger NHN network for this spike; 1,213 segments are simplified at 2 km. WMS capabilities are not used as geometry.

Chromium headless in this environment, 1440×900: load/network idle 613 ms; a 12-step drag plus wheel zoom took 293 ms. At 390×844, load/network idle was 570 ms. These are automated environment measurements, not mid-range laptop or phone hardware benchmarks, nor isolated first-paint timings. URL camera and French restoration were exercised. Screenshots are in `/workspace/canada-civ-runs/screens/`.

Compared with the supplied usaciv landing screenshot, this map uses a dark bronze header, painted hexes, blue water, pale mountain marks and provincial labels; it deliberately has no city or yield chrome at this milestone. Unlike the richer reference art, this first renderer uses flat terrain colours and simplified mountains. Hexes are schematic, not survey boundaries. No usaciv source was copied.

Commands run: `uv run python -m pipeline build`, `uv run python -m pipeline check`, `uv run python -m unittest discover -s tests`, `uv run python -m pipeline serve`, and a headless Chromium/Playwright script for screenshots, drag, zoom, bilingual toggle and URL restoration.
