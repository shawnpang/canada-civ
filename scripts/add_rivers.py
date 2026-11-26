"""Add the official 1:5M Atlas sparse river lines to the GIS world interim."""
import json, hashlib
from pathlib import Path
from datetime import datetime,timezone
import fiona
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform
root=Path(__file__).resolve().parents[1]; raw=root/'data/raw/atlas_rivers/rivers.zip'; path=root/'data/interim/world.json'
w=json.loads(path.read_text()); p=w['projection']; lines=[]
source='/vsizip/'+str(raw)+'/AC_5M_Rivers_sparse_shp/AC_5M_Rivers_sparse.shp'
with fiona.open(source) as src:
 t=Transformer.from_crs(src.crs,3347,always_xy=True)
 for f in src:
  g=transform(t.transform,shape(f['geometry'])).simplify(2000)
  if g.is_empty: continue
  for line in ([g] if g.geom_type=='LineString' else g.geoms):
   pts=[]
   for x,y in line.coords: pts.extend([round((x-p['min_x'])/1000,1),round((p['max_y']-y)/1000,1)])
   if len(pts)>=4:
    props=f['properties']; lines.append({'name':{'en':props['NAME'] or '', 'fr':props['NOM'] or props['NAME'] or ''},'rank':1,'pts':pts})
w['rivers']=lines; path.write_text(json.dumps(w,ensure_ascii=False,separators=(',',':')))
url='https://ftp.geogratis.gc.ca/pub/nrcan_rncan/vector/framework_cadre/Atlas_of_Canada_5M/hydrology/AC_5M_Rivers.shp.zip'
meta={'id':'atlas_rivers','title':'Atlas of Canada National Scale Data 1:5,000,000 – Rivers','product_id':'AC_5M_Rivers sparse','publisher':'Natural Resources Canada','vintage':'2017','license':'Open Government Licence – Canada','homepage':'https://open.canada.ca/data/en/dataset/eda6b104-a284-5701-93b0-8dcde6777450','used_for':'Generalized river lines','files':[{'file':str(raw.relative_to(root)),'url':url,'retrieved':datetime.now(timezone.utc).isoformat(),'sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'bytes':raw.stat().st_size}]}
(raw.parent/'manifest.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)); print(len(lines),'river lines')
