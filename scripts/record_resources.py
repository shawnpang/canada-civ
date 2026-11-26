"""Record local copies of additional source material already fetched for the spike."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

entries = [
 ('natural_earth', 'ne_50m_admin_0_countries.zip', 'https://naturalearth.s3.amazonaws.com/50m_cultural/ne_50m_admin_0_countries.zip', 'Natural Earth 1:50m Admin 0 Countries', '5.1.1', 'Public domain'),
 ('natural_earth', 'ne_50m_lakes.zip', 'https://naturalearth.s3.amazonaws.com/50m_physical/ne_50m_lakes.zip', 'Natural Earth 1:50m lakes', '5.1.1', 'Public domain'),
 ('nhn', 'capabilities.xml', 'https://maps.geogratis.gc.ca/wms/hydro_network_en?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0', 'National Hydro Network WMS capabilities', 'service response', 'Open Government Licence – Canada'),
 ('nrcan_landcover_2020', 'class_index.pdf', 'https://datacube-prod-data-public.s3.ca-central-1.amazonaws.com/store/land/landcover/ClassIndex_v2.pdf', '2020 Land Cover of Canada class index', '2020', 'Open Government Licence – Canada'),
 ('etopo', 'etopo_2022_60s_surface.tif', 'https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/60s/60s_surface_elev_gtif/ETOPO_2022_v1_60s_N90W180_surface.tif', 'ETOPO 2022 60 arc-second ice surface', '2022', 'Public US government work'),
]
for ident, name, url, product, vintage, license in entries:
 path = Path('data/raw') / ident / name
 if not path.exists():
  print('missing:', path)
  continue
 digest = hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda: f.read(1024 * 1024), b''):
   digest.update(block)
 manifest = path.parent / 'manifest.json'
 meta = json.loads(manifest.read_text()) if manifest.exists() else {'id': ident, 'product_id': product, 'vintage': vintage, 'license': license, 'files': []}
 meta['files'] = [f for f in meta['files'] if f['file'] != str(path)]
 meta['files'].append({'file': str(path), 'url': url, 'retrieved': datetime.now(timezone.utc).isoformat(), 'sha256': digest.hexdigest(), 'bytes': path.stat().st_size})
 manifest.write_text(json.dumps(meta, indent=2) + '\n')
 print('recorded:', path)
