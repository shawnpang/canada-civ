"""Build and validate the Milestone 0 world from the documented GIS interim."""
import json, shutil, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def build():
 p=ROOT/'data/interim/world.json'
 if not p.exists():
  subprocess.run(['uv','run','--with','rasterio','--with','shapely','--with','pyproj','--with','fiona','python','scripts/preprocess_world.py'],cwd=ROOT,check=True)
 if not json.loads(p.read_text()).get('rivers'):
  subprocess.run(['uv','run','--with','fiona','--with','pyproj','--with','shapely','python','scripts/add_rivers.py'],cwd=ROOT,check=True)
 dest=ROOT/'web/data'; dest.mkdir(parents=True,exist_ok=True); shutil.copyfile(p,dest/'world.json')
 ids=['statcan_boundaries_2021','nrcan_mrdem','nrcan_landcover_2020','etopo','natural_earth','atlas_rivers','atlas_lakes']
 sources=[]
 for id in ids:
  item=json.loads((ROOT/'data/raw'/id/'manifest.json').read_text()); item.setdefault('title',item['product_id']); item.setdefault('publisher',{'nrcan_mrdem':'Natural Resources Canada','nrcan_landcover_2020':'Natural Resources Canada','etopo':'NOAA','natural_earth':'Natural Earth','atlas_rivers':'Natural Resources Canada','atlas_lakes':'Natural Resources Canada'}.get(id,'Statistics Canada')); item.setdefault('homepage',item['files'][0]['url']); item.setdefault('used_for',{'nrcan_mrdem':'Elevation and relief','nrcan_landcover_2020':'Land cover','etopo':'Bathymetry','natural_earth':'Foreign land and lakes','atlas_rivers':'Generalized river lines','atlas_lakes':'Lake classification including international lakes'}.get(id,'Boundaries')); sources.append(item)
 (dest/'sources.json').write_text(json.dumps(sources,ensure_ascii=False,separators=(',',':')))
 print('Built world.json and sources.json')

def check():
 try:
  p=ROOT/'web/data/world.json'; w=json.loads(p.read_text()); g=w['grid']; n=g['cols']*g['rows']; assert g['radius']==25 and 1000<n<100000 and w['crs']=='EPSG:3347'; assert len(w['provinces'])==13 and len({p['pruid'] for p in w['provinces']})==13
  for key in ['owner','division','water','elev','elev_max','relief','cover']:
   assert len(w[key])==n, key
  for a in w['pct'].values(): assert len(a)==n and all(isinstance(x,int) and 0<=x<=100 for x in a)
  assert all(x in w['owner'] for x in range(13)); assert all(isinstance(x,int) and -2<=x<13 for x in w['owner']); assert all(x in range(4) for x in w['water']+w['relief']); assert all(x in range(12) for x in w['cover']); assert all((o==-1)==(v!=0) for o,v in zip(w['owner'],w['water'])); assert p.stat().st_size<2500000
  assert len(json.loads((p.parent/'sources.json').read_text()))>=5
  print(f'PASS: {g["cols"]} × {g["rows"]} = {n} cells; 13 provinces and territories; {p.stat().st_size:,} bytes'); return 0
 except (OSError,ValueError,KeyError,AssertionError,TypeError) as e:
  print('FAIL: invalid world:',e); return 1
