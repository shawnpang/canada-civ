"""One-time COG overview extraction; run with uv --with rasterio, not pipeline runtime.

Optionally pass source ids to refresh only those cached products.
"""
import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import rasterio
from rasterio.enums import Resampling
from affine import Affine

SOURCES = [
 ('nrcan_mrdem','https://canelevation-dem.s3.ca-central-1.amazonaws.com/mrdem-30/mrdem-30-dtm.tif','MRDEM-30-DTM','current',16),
 ('nrcan_landcover_2020','https://datacube-prod-data-public.s3.ca-central-1.amazonaws.com/store/land/landcover/landcover-2020-classification.tif','2020 Land Cover of Canada','2020',64),
]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('sources',nargs='*',choices=[s[0] for s in SOURCES])
selected=parser.parse_args().sources
for ident,url,product,vintage,factor in SOURCES:
 if selected and ident not in selected: continue
 out=Path('data/raw')/ident; out.mkdir(parents=True,exist_ok=True)
 path=out/'overview.tif'; temp=out/'overview.new.tif'
 print('Extracting',ident,flush=True)
 with rasterio.open(url) as src:
  height=(src.height+factor-1)//factor; width=(src.width+factor-1)//factor
  profile=src.profile.copy(); profile.update(width=width,height=height,transform=src.transform*Affine.scale(src.width/width,src.height/height),compress='deflate',tiled=True,blockxsize=256,blockysize=256)
  # Bounded strips avoid loading the full 16× elevation overview into memory.
  with rasterio.open(temp,'w',**profile) as dst:
   for start in range(0,height,512):
    count=min(512,height-start)
    window=rasterio.windows.Window(0,start*src.height/height,src.width,count*src.height/height)
    arr=src.read(1,window=window,out_shape=(count,width),resampling=Resampling.nearest)
    dst.write(arr,1,window=rasterio.windows.Window(0,start,width,count))
 sha=hashlib.sha256()
 with temp.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''): sha.update(chunk)
 meta={'id':ident,'product_id':product,'vintage':vintage,'license':'Open Government Licence – Canada','files':[{'file':str(path),'url':url,'retrieved':datetime.now(timezone.utc).isoformat(),'sha256':sha.hexdigest(),'bytes':temp.stat().st_size,'note':f'Derived {factor}x COG overview extraction; nearest-neighbour extraction from the published overviews, not a checksum of the full remote raster.'}]}
 os.replace(temp,path)
 (out/'manifest.json').write_text(json.dumps(meta,indent=2)+'\n')
 print(path,meta['files'][0]['bytes'],flush=True)
