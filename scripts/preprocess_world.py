"""One-time GIS preprocessing: uv run --with rasterio --with shapely --with pyproj --with fiona python scripts/preprocess_world.py"""
import json, math, sys
from pathlib import Path
from collections import Counter
import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_origin
from pyproj import Transformer
from shapely.geometry import Polygon, shape, mapping
from shapely.ops import transform
import fiona
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline.core.hexgrid import HexGrid
from pipeline.core.relief import classify_relief
from functools import lru_cache
R=Path(__file__).resolve().parents[1]; raw=R/'data/raw'
f=json.loads((raw/'statcan_boundaries_2021/provinces.json').read_text())['features']; f.sort(key=lambda x:x['attributes']['PRUID'])
points=[p for feat in f for ring in feat['geometry']['rings'] for p in ring]
minx=min(p[0] for p in points)-200000; maxx=max(p[0] for p in points)+200000
miny=min(p[1] for p in points)-200000; maxy=max(p[1] for p in points)+200000
width=(maxx-minx)/1000; height=(maxy-miny)/1000; grid=HexGrid.covering(width,height); n=grid.cols*grid.rows
# A 2 km classification grid, using the source's Esri ring orientation. Larger rings first
# lets islands within lakes overwrite their enclosing water ring.
res=2000; h=math.ceil((maxy-miny)/res); w=math.ceil((maxx-minx)/res); affine=from_origin(minx,maxy,res,res)
tr=Transformer.from_crs(4326,3347,always_xy=True)
foreign=[]
with fiona.open('zip://'+str(raw/'natural_earth/ne_50m_admin_0_countries.zip')) as src:
 for feat in src:
  if feat['properties']['ADMIN'] in ('United States of America','Greenland','France'):
   foreign.append((mapping(transform(tr.transform,shape(feat['geometry']))), 99))
base=rasterize(foreign,out_shape=(h,w),transform=affine,dtype='uint8')
rings=[]
for i,feat in enumerate(f):
 for ring in feat['geometry']['rings']:
  if len(ring)<4: continue
  signed=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ring,ring[1:]))/2
  if abs(signed)<1: continue
  rings.append((abs(signed), Polygon(ring).__geo_interface__, i+1 if signed<0 else 100))
rings.sort(key=lambda x:-x[0]); rasterize(((g,v) for _,g,v in rings),out=base,transform=affine)
# Atlas waterbodies include international lakes outside the P/T polygons.
lakefile='/vsizip/'+str(raw/'atlas_lakes/lakes.zip')+'/AC_5M_Waterbodies_shp/AC_5M_Waterbodies.shp'
with fiona.open(lakefile) as src:
 lt=Transformer.from_crs(src.crs,3347,always_xy=True)
 lakes=[(mapping(transform(lt.transform,shape(feat['geometry']))),100) for feat in src]
rasterize(lakes,out=base,transform=affine)
# NRCan's Canadian atlas excludes some entirely foreign lakes (notably Lake
# Michigan). Supplement foreign and unclassified cells with Natural Earth lake polygons.
with fiona.open('zip://'+str(raw/'natural_earth/ne_50m_lakes.zip')) as src:
 nt=Transformer.from_crs(src.crs,3347,always_xy=True)
 foreign_lakes=[(mapping(transform(nt.transform,shape(feat['geometry']))),1) for feat in src if feat['geometry']]
foreign_lake_mask=rasterize(foreign_lakes,out_shape=(h,w),transform=affine,dtype='uint8')
base[((base==99)|(base==0))&(foreign_lake_mask==1)]=100
del foreign_lake_mask

centers=np.array([grid.center(c,r) for r in range(grid.rows) for c in range(grid.cols)])
x=minx+centers[:,0]*1000; y=maxy-centers[:,1]*1000

def classify(xs,ys):
 rr=((maxy-ys)/res).astype(int); cc=((xs-minx)/res).astype(int); valid=(rr>=0)&(rr<h)&(cc>=0)&(cc<w); result=np.zeros(len(xs),dtype=np.uint8); result[valid]=base[rr[valid],cc[valid]]; return result
samples=[classify(x,y)]
for k in range(6):
 a=math.radians(30+60*k); samples.append(classify(x+15000*math.cos(a),y+15000*math.sin(a)))
samples=np.array(samples).T
owner=[]; lake=[]
for s in samples:
 counts=Counter(int(v) for v in s); m=max(counts.values()); v=int(s[0]) if counts[int(s[0])]==m else min(k for k,c in counts.items() if c==m)
 owner.append(v-1 if 1<=v<=13 else -2 if v==99 else -1); lake.append(v==100)
owner=np.array(owner); lake=np.array(lake)
# 7x7 lattice, 6 km spacing, clipped to pointy hex, near equivalent to overview resolution.
offsets=[(dx,dy) for dx in range(-18,19,6) for dy in range(-24,25,6) if abs(dx)<=math.sqrt(3)*12.5 and abs(dy)<=25-abs(dx)/math.sqrt(3)]

@lru_cache(maxsize=None)
def raster_data(path):
 with rasterio.open(path) as ds:
  return ds.read(1), ds.transform, ds.crs, ds.nodata

def sample_raster(path, coordsx, coordsy):
 arr, affine, crs, nodata = raster_data(path)
 tx=Transformer.from_crs(3347,crs,always_xy=True); xx,yy=tx.transform(coordsx,coordsy); rr,cc=rasterio.transform.rowcol(affine,xx,yy); rr=np.asarray(rr); cc=np.asarray(cc); valid=(rr>=0)&(rr<arr.shape[0])&(cc>=0)&(cc<arr.shape[1]); out=np.full(len(rr),np.nan); out[valid]=arr[rr[valid],cc[valid]]; out[(out==nodata) if nodata is not None else np.zeros(len(out),bool)]=np.nan; return out
# Sample in offset batches; only points actually inside the owning province count.
elevs=[]; covers=[]
for dx,dy in offsets:
 xx=x+dx*1000; yy=y+dy*1000; cls=classify(xx,yy); valid=(owner>=0)&(cls==owner+1)
 e=sample_raster(raw/'nrcan_mrdem/overview.tif',xx,yy); e[~valid]=np.nan; elevs.append(e)
 c=sample_raster(raw/'nrcan_landcover_2020/overview.tif',xx,yy); c[~valid]=np.nan; covers.append(c)
elevs=np.array(elevs).T; covers=np.array(covers).T
bath=sample_raster(raw/'etopo/etopo_2022_60s_surface.tif',x,y)
water=[]; relief=[]; elev=[]; elevmax=[]; cover=[]; pct={k:[] for k in ('forest','crop','pasture','grass','shrub','wetland','developed')}
mapc={1:2,2:2,5:1,6:3,8:4,11:4,10:5,12:5,13:10,16:10,14:8,15:7,17:9,19:11}
for i in range(n):
 o=owner[i]; vals=elevs[i][np.isfinite(elevs[i])]; vals=vals[(vals>-500)&(vals<9000)]
 if o>=0:
  water.append(0); elev.append(round(float(np.mean(vals))) if len(vals) else None); elevmax.append(round(float(np.max(vals))) if len(vals) else None)
  relief.append(classify_relief(vals.tolist()))
 else:
  near=any(0<=rr<grid.rows and 0<=cc<grid.cols and owner[rr*grid.cols+cc]!=-1 for rr in range(max(0,i//grid.cols-1),min(grid.rows,i//grid.cols+2)) for cc in range(max(0,i%grid.cols-1),min(grid.cols,i%grid.cols+2)))
  water.append(0 if o==-2 else 3 if lake[i] else 2 if near or (np.isfinite(bath[i]) and bath[i]>=-200) else 1); elev.append(round(min(0,float(bath[i]))) if o==-1 and np.isfinite(bath[i]) else None); elevmax.append(0 if o==-1 else None); relief.append(0)
 vals=[mapc[int(v)] for v in covers[i] if np.isfinite(v) and int(v) in mapc] if o>=0 else []
 counts=Counter(vals); total=len(vals); cover.append((9 if counts[9]/total>=.3 else counts.most_common(1)[0][0]) if total else 0)
 for key,ids in {'forest':(1,2,3),'crop':(7,),'pasture':(6,),'grass':(5,),'shrub':(4,),'wetland':(8,),'developed':(9,)}.items(): pct[key].append(round(100*sum(counts[j] for j in ids)/total) if total else 0)
provinces=[{'pruid':z['attributes']['PRUID'],'abbr':z['attributes']['PREABBR'],'name':{'en':z['attributes']['PRENAME'],'fr':z['attributes']['PRFNAME']}} for z in f]
world={'version':2,'grid':{'radius':25,'cols':grid.cols,'rows':grid.rows},'width':round(width,3),'height':round(height,3),'margin':200,'crs':'EPSG:3347','projection':{'min_x':minx,'max_y':maxy,'units':'metres','standard_parallels':[49,77],'central_meridian':-91.8666666667},'owner':owner.tolist(),'division':[-1]*n,'elev':elev,'elev_max':elevmax,'water':water,'relief':relief,'cover':cover,'pct':pct,'provinces':provinces,'divisions':[],'rivers':[], 'tables':{'water':[{'id':i,'name':{'en':en,'fr':fr}} for i,(en,fr) in enumerate([('Land','Terre'),('Ocean','Océan'),('Coast','Côte'),('Lake','Lac')])],'relief':[{'id':i,'name':{'en':en,'fr':fr}} for i,(en,fr) in enumerate([('Flat','Plat'),('Hills','Collines'),('Mountains','Montagnes'),('Peaks','Sommets')])],'cover':[{'id':v,'nalcms':k} for k,v in mapc.items()],'notes':{'water':{'en':'Majority of seven points; cartographic interior rings, Atlas waterbodies, and Natural Earth lakes outside Canadian land are lakes. Ocean is coast near land or at depth under 200 m.','fr':'Majorité de sept points; les anneaux intérieurs cartographiques, les plans d’eau de l’Atlas et les lacs Natural Earth hors des terres canadiennes sont des lacs. Les eaux côtières sont près des terres ou à moins de 200 m de profondeur.'},'relief':{'en':'MRDEM 16× overview (~480 m), 6 km lattice: SD 85/260 m, mean 2300/2700 m; low flat lower 60% reduces relief one class.','fr':'Aperçu MRDEM 16× (environ 480 m), grille de 6 km : écarts types 85/260 m, moyennes 2300/2700 m; les 60 % inférieurs plats réduisent le relief.'},'cover':{'en':'2020 land cover overview, 6 km lattice; overall source accuracy about 86.9%.','fr':'Aperçu de la couverture terrestre 2020, grille de 6 km; précision globale de la source environ 86,9 %.'}}}}
out=R/'data/interim'; out.mkdir(parents=True,exist_ok=True); (out/'world.json').write_text(json.dumps(world,ensure_ascii=False,separators=(',',':')))
print('Generated',n,'cells;',Counter(owner),flush=True)
