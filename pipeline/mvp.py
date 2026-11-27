"""Build the MVP atlas from official 2021 Census and GDP downloads.

The coarse boundary test samples seven points per hex against generalized StatCan
cartographic polygons. No external packages are required.
"""
import csv, hashlib, io, json, math, urllib.request, zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from pipeline.core.hexgrid import HexGrid
ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'data/raw'; OUT=ROOT/'web/data'
PROFILE='https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,{flow}/A5..1.1+6+40+229+331+374+375+376+377+378+1474+2014+2024+2230.1'
# Census industry tables count labour force, not jobs. Use only the separately
# sourced employed-by-industry table for these mappings.
YIELD_NAICS={'food':['11'],'production':['21','23','31-33'],'science':['51','54'],'culture':['71']}
def combine_jobs(jobs,codes):
 values=[jobs.get(code) for code in codes]
 return None if any(v is None for v in values) else sum(values)

def urls():
 d={}
 for flow in ['DF_PR','DF_CD','DF_CMACA','DF_CSD']:d[f'census2021/{flow}.csv']=PROFILE.format(flow=flow)
 for level in [4,6]:d[f'census2021/geo{level}.json']=f'https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer/{level}/query?where=1%3D1&outFields=*&outSR=3347&geometryPrecision=0&maxAllowableOffset=1000&f=json'
 d['census2021/iqaluit.json']='https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer/9/query?where=CSDUID%3D%276204003%27&outFields=*&outSR=3347&geometryPrecision=0&maxAllowableOffset=500&f=json'
 for table in ['98100001','98100002','98100005','98100007']:d[f'population/{table}.zip']=f'https://www150.statcan.gc.ca/n1/tbl/csv/{table}-eng.zip'
 for table in ['36100468','36100711']:d[f'gdp/{table}.zip']=f'https://www150.statcan.gc.ca/n1/tbl/csv/{table}-eng.zip'
 return d

def fetch(offline=False):
 for name,url in urls().items():
  p=RAW/name;p.parent.mkdir(parents=True,exist_ok=True)
  if not p.exists():
   if offline:raise RuntimeError(f'offline cache missing {name}')
   req=urllib.request.Request(url,headers={'User-Agent':'CanadaCiv/1.0','Accept':'text/csv' if name.endswith('.csv') else '*/*'})
   with urllib.request.urlopen(req,timeout=180) as f:p.write_bytes(f.read())
  if p.stat().st_size<100:raise RuntimeError(f'invalid download {name}')
 print('Fetched MVP official sources')

def readzip(name):
 p=RAW/name
 with zipfile.ZipFile(p) as z:
  n=next(n for n in z.namelist() if n.endswith('.csv') and 'MetaData' not in n)
  return list(csv.DictReader(io.TextIOWrapper(z.open(n),encoding='utf-8-sig',newline='')))

def csv_profiles():
 data={}
 for f in ['DF_PR','DF_CD','DF_CMACA','DF_CSD']:
  with (RAW/'census2021'/f'{f}.csv').open(encoding='utf-8-sig',newline='') as fp:
   for row in csv.DictReader(fp):
    try:v=float(row['OBS_VALUE']);v=int(v) if v.is_integer() else v
    except (ValueError,TypeError):v=None
    data.setdefault(row['REF_AREA'],{})[row['CHARACTERISTIC']]=v
 return data

def points_for(cell,grid,proj):
 col=cell%grid.cols;row=cell//grid.cols;x,y=grid.center(col,row)
 result=[]
 for i in range(7):
  angle=math.radians(30+60*(i-1));r=0 if i==0 else 15
  result.append((proj['min_x']+(x+r*math.cos(angle))*1000,proj['max_y']-(y+r*math.sin(angle))*1000))
 return result

def geometry(path,idkey,select=lambda a:True):
 rows=[]
 for feat in json.loads((RAW/path).read_text())['features']:
  a=feat['attributes']
  if not select(a):continue
  rings=[]
  for ring in feat['geometry']['rings']:
   if len(ring)<4:continue
   xs=[p[0] for p in ring];ys=[p[1] for p in ring]
   rings.append(((min(xs),min(ys),max(xs),max(ys)),ring))
  if not rings:continue
  box=(min(r[0][0] for r in rings),min(r[0][1] for r in rings),max(r[0][2] for r in rings),max(r[0][3] for r in rings))
  rows.append({'id':a[idkey], 'a':a,'box':box,'rings':rings})
 return rows

def contains(shape,p):
 x,y=p;b=shape['box']
 if x<b[0] or x>b[2] or y<b[1] or y>b[3]:return False
 inside=False
 for (x0,y0,x1,y1),ring in shape['rings']:
  if not (x0<=x<=x1 and y0<=y<=y1):continue
  cross=False;px,py=ring[-1]
  for qx,qy in ring:
   if (qy>y)!=(py>y) and x < (px-qx)*(y-qy)/(py-qy)+qx:cross=not cross
   px,py=qx,qy
  if cross:inside=not inside
 return inside

def sample_assign(shapes,pts):
 result=[]
 for point in pts:
  val=next((x['id'] for x in shapes if contains(x,point)),None)
  result.append(val)
 return result

def ratio(a,b):return a/b if a is not None and b not in (None,0) else None

def economy(prof,gdp=None):
 jobs={code:None for codes in YIELD_NAICS.values() for code in codes}
 return {'population':prof.get('1'),'employed':None,'jobs':jobs,'yields':{**{k:combine_jobs(jobs,v) for k,v in YIELD_NAICS.items()},'gold':gdp},'gdp':gdp,'gdp_year':2022 if gdp is not None else None,'unemployment':prof.get('2230')/100 if prof.get('2230') is not None else None,'median_income':prof.get('229'),'median_rent':None,'home_value':prof.get('1474'),'rent_burden':None,'growth':None,'growth_years':None,'pop_series':{'2021':prof.get('1')},'gdp_by_industry':{},'gdp_undisclosed':None}

def definitions():
 entries=[('food','Food','Nourriture','NAICS 11','workers'),('production','Production','Production','NAICS 21 + 23 + 31–33','workers'),('gold','Gold','Or','GDP at basic prices, current CAD; place of work','cad_per_year'),('science','Science','Science','NAICS 51 + 54','workers'),('culture','Culture','Culture','NAICS 71','workers')]
 return [{'key':k,'icon':'y-'+k,'label':{'en':e,'fr':f},'description':{'en':desc,'fr':desc},'unit':unit,'color':'#c9a752'} for k,e,f,desc,unit in entries]

def source(id,title,product,homepage,used,files):
 entries=[]
 for name in files:
  p=RAW/name;b=p.read_bytes();entries.append({'file':name,'url':urls()[name],'retrieved':datetime.fromtimestamp(p.stat().st_mtime,timezone.utc).isoformat(),'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)})
 return {'id':id,'title':title,'publisher':'Statistics Canada','product_id':product,'vintage':'2021' if 'gdp' not in id else '2022 (CMA); 2021 (P/T)','license':'Statistics Canada Open Licence; https://www.statcan.gc.ca/en/reference/licence','homepage':homepage,'description':used,'used_for':used,'files':entries}

def write(name,data): (OUT/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))

def labour():
 directory=RAW/'labour2021'
 if not (directory/'metadata.json').exists():return {}
 meta=json.loads((directory/'metadata.json').read_text())[0]['object']['dimension'][0]['member']
 ids={str(m['memberId']):(str(m['classificationCode']),m['geoLevel']) for m in meta}
 codes={'4':'11','5':'21','7':'23','8':'31-33','12':'51','15':'54','20':'71'};out={}
 for p in sorted(directory.glob('data-*.json')):
  for item in json.loads(p.read_text()):
   obj=item.get('object') or {};coord=obj.get('coordinate','').split('.')
   if len(coord)<2 or coord[0] not in ids or coord[1] not in codes:continue
   code,level=ids[coord[0]];values=obj.get('vectorDataPoint') or []
   v=values[0].get('value') if values and item['status']=='SUCCESS' else None
   out.setdefault((code,level),{})[codes[coord[1]]]=int(v) if v is not None else None
 return out

def add_jobs(econ,jobs):
 if jobs:
  econ['jobs'].update(jobs)
  for k,codes in YIELD_NAICS.items():econ['yields'][k]=combine_jobs(econ['jobs'],codes)

def build():
 world=json.loads((OUT/'world.json').read_text());grid=HexGrid(**{k:world['grid'][k] for k in ['cols','rows','radius']});owner=world['owner'];proj=world['projection'];profiles=csv_profiles();jobdata=labour()
 cd=geometry('census2021/geo4.json','CDUID');citygeo=geometry('census2021/geo6.json','CMAUID',lambda a:a['CMATYPE']=='B' or a['CMAUID'] in ('990','995'));citygeo+=geometry('census2021/iqaluit.json','CSDUID')
 # Store sampled area assignments as an interim: this also accelerates rebuilds.
 cache=ROOT/'data/interim/mvp-geometry.json'
 if cache.exists():geo=json.loads(cache.read_text())
 else:
  divisions=[];citysamples=[]
  for i,o in enumerate(owner):
   if o<0:divisions.append(None);citysamples.append(None);continue
   points=points_for(i,grid,proj);v=sample_assign(cd,points);counts=Counter(x for x in v if x is not None)
   divisions.append(max(counts,key=lambda x:(counts[x],x==v[0])) if counts else None)
   v=sample_assign(citygeo,points);counts=Counter(x for x in v if x is not None)
   citysamples.append(max(counts,key=lambda x:(counts[x],x==v[0])) if counts and max(counts.values())>=4 else None)
  geo={'division':divisions,'city':citysamples};cache.parent.mkdir(parents=True,exist_ok=True);cache.write_text(json.dumps(geo));print('Sampled census division and CMA boundaries')
 cds=sorted(cd,key=lambda x:x['id']);cdidx={c['id']:i for i,c in enumerate(cds)}
 world['divisions']=[{'cduid':c['id'],'name':{'en':c['a']['CDNAME'],'fr':c['a']['CDNAME']},'pruid':c['a']['PRUID']} for c in cds]
 world['division']=[cdidx.get(c,-1) for c in geo['division']];write('world.json',world)
 poprows=readzip('population/98100005.zip');popmap={r['DGUID']:r for r in poprows};iqrow=next(r for r in readzip('population/98100002.zip') if r['DGUID']=='2021A00056204003')
 popkey=next(x for x in iqrow if x.startswith('Population and dwelling counts') and 'Population, 2021' in x)
 gdpcma={}
 for r in readzip('gdp/36100468.zip'):
  if r['REF_DATE']=='2022' and r['VALUE'] and r['DGUID']:gdpcma[r['GEO'].split(',')[0]]=round(float(r['VALUE'])*1_000_000)
 gdppt={}
 for r in readzip('gdp/36100711.zip'):
  if r['REF_DATE']=='2021' and r['Prices']=='Current dollars' and r['North American Industry Classification System (NAICS)']=='All industries [T001]' and r['VALUE']:
   gdppt[r['DGUID'][-2:]]=round(float(r['VALUE'])*1_000_000)
 provinces=[]
 for p in world['provinces']:
  pr=p['pruid'];a=economy(profiles.get('2021A0002'+pr,{}),gdppt.get(pr));add_jobs(a,jobdata.get((pr,2)))
  cells=[i for i,o in enumerate(owner) if o==len(provinces) and world['cover'][i]>0]
  a.update(p);a['land']={k:sum(world['pct'][k][i] for i in cells)/len(cells)/100 for k in world['pct']} if cells else None;a['energy']=None;a['label']=None;provinces.append(a)
 national=economy(profiles.get('2021A000011124',{}),gdpcma.get('Canada'));add_jobs(national,jobdata.get(('11124',0)))
 # 36-10-0468 reflects older CMA boundaries, so its totals cannot be paired
 # with 2021 CMA boundaries without implying a false exact match.
 cities=[];used=set();byid={}
 for shape in citygeo:byid.setdefault(shape['id'],[]).append(shape)
 for id,parts in byid.items():
  is_iq=id=='6204003';kind='capital' if is_iq else ('ca' if id in ('990','995') else 'cma');uid='csd-6204003' if is_iq else id
  dguid='2021A00056204003' if is_iq else '2021S050'+('4' if kind=='ca' else '3')+id
  row=iqrow if is_iq else popmap.get(dguid,{})
  name=row.get('GEO') or parts[0]['a'].get('CMANAME','Iqaluit');name=name.replace(' - ','–')
  prof=profiles.get(dguid,{}).copy()
  if prof.get('1') is None and row.get(popkey):prof['1']=int(row[popkey])
  a=economy(prof);add_jobs(a,jobdata.get((id,503 if kind=='cma' else 504)))
  fp=[i for i,c in enumerate(geo['city']) if c==id and i not in used]
  # Use the centre of the largest official polygon as a schematic anchor.
  main=max(parts,key=lambda s:(s['box'][2]-s['box'][0])*(s['box'][3]-s['box'][1]));b=main['box'];x=((b[0]+b[2])/2-proj['min_x'])/1000;y=(proj['max_y']-(b[1]+b[3])/2)/1000
  candidates=fp or [i for i,o in enumerate(owner) if o>=0 and i not in used and world['provinces'][o]['pruid'] in [s['a']['PRUID'] for s in parts]]
  cell=min(candidates,key=lambda i:(grid.center(i%grid.cols,i//grid.cols)[0]-x)**2+(grid.center(i%grid.cols,i//grid.cols)[1]-y)**2)
  if not fp:fp=[cell]
  used.update(fp);x,y=grid.center(cell%grid.cols,cell//grid.cols)
  prs=list(dict.fromkeys(world['provinces'][o]['abbr'] for o in [next(j for j,p in enumerate(world['provinces']) if p['pruid']==s['a']['PRUID']) for s in parts]))
  names={'en':name,'fr':name};a.update({'id':uid,'kind':kind,'name':names,'full':{'en':name+', '+', '.join(prs),'fr':name+' ('+', '.join(prs)+')'},'provinces':prs,'metro':kind=='cma','capital':is_iq or id in ('990','995','505'),'x':x,'y':y,'cell':cell,'footprint':fp,'divisions':sorted({geo['division'][i] for i in fp if geo['division'][i]}),'ranks':{},'peers':[]});cities.append(a)
 cities.sort(key=lambda c:-(c['population'] or 0))
 for seq in [cities,provinces]:
  for key in ['population','gdp','gold','food','production','science','culture','unemployment']:
   value=lambda a:a['yields'].get(key) if key in a['yields'] else a.get(key)
   ranked=sorted((x for x in seq if value(x) is not None),key=lambda a:-value(a))
   for i,a in enumerate(ranked):a.setdefault('ranks',{})[key]=i+1
 for c in cities:c['peers']=[x['id'] for x in sorted((x for x in cities if x is not c),key=lambda x:abs((x['population'] or 0)-(c['population'] or 0)))[:5]]
 nation={'year':2021,'vintage':'Census 2021','gdp_vintage':'2022, 36-10-0468-01; provinces 2021, 36-10-0711-01','nation':national,'yields':definitions(),'industries':{}}
 write('nation.json',nation);write('provinces.json',{'provinces':provinces});write('cities.json',cities)
