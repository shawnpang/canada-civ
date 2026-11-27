"""Build the MVP atlas from official 2021 Census and GDP downloads.

The coarse boundary test samples seven points per hex against generalized StatCan
cartographic polygons. No external packages are required.
"""
import csv, hashlib, io, json, math, zipfile
from collections import Counter
from pathlib import Path
from pipeline.core.hexgrid import HexGrid
ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'data/raw'; OUT=ROOT/'web/data'
PROFILE='https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,{flow}/A5..1.1+6+7+40+229+331+374+375+376+377+378+1474+2014+2024+2230.1'
# Total gender, total statistic, 2021 Census Profile. Shelter costs include
# utilities where applicable; burden is the share paying 30% or more of income.
CENSUS_ECONOMY='https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,{flow}/A5..1.1478+1480+2225.1'
# Census industry tables count labour force, not jobs. Use only the separately
# sourced employed-by-industry table for these mappings.
YIELD_NAICS={'food':['11'],'production':['21','23','31-33'],'science':['51','54'],'culture':['71']}
def combine_jobs(jobs,codes):
 values=[jobs.get(code) for code in codes]
 return None if any(v is None for v in values) else sum(values)

def urls():
 d={}
 for flow in ['DF_PR','DF_CD','DF_CMACA','DF_CSD']:d[f'census2021/{flow}.csv']=PROFILE.format(flow=flow)
 for flow in ['DF_PR','DF_CMACA','DF_CSD']:d[f'census_economy/{flow}.csv']=CENSUS_ECONOMY.format(flow=flow)
 for level in [4,6]:d[f'census2021/geo{level}.json']=f'https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer/{level}/query?where=1%3D1&outFields=*&outSR=3347&geometryPrecision=0&maxAllowableOffset=1000&f=json'
 d['census2021/iqaluit.json']='https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer/9/query?where=CSDUID%3D%276204003%27&outFields=*&outSR=3347&geometryPrecision=0&maxAllowableOffset=500&f=json'
 for table in ['98100001','98100002','98100005','98100007']:d[f'population/{table}.zip']=f'https://www150.statcan.gc.ca/n1/tbl/csv/{table}-eng.zip'
 for table in ['36100468','36100711']:d[f'gdp/{table}.zip']=f'https://www150.statcan.gc.ca/n1/tbl/csv/{table}-eng.zip'
 return d

def readzip(name):
 p=RAW/name
 with zipfile.ZipFile(p) as z:
  n=next(n for n in z.namelist() if n.endswith('.csv') and 'MetaData' not in n)
  return list(csv.DictReader(io.TextIOWrapper(z.open(n),encoding='utf-8-sig',newline='')))

def read_profiles(paths):
 data={}
 for path in paths:
  with path.open(encoding='utf-8-sig',newline='') as fp:
   for row in csv.DictReader(fp):
    try:
     if row.get('FLAG') in {'1','2','4','6','O'}:raise ValueError('unavailable observation')
     v=float(row['OBS_VALUE']);v=int(v) if v.is_integer() else v
    except (ValueError,TypeError):v=None
    data.setdefault(row['REF_AREA'],{})[row['CHARACTERISTIC']]=v
 return data

def csv_profiles():
 paths=[RAW/'census2021'/f'{f}.csv' for f in ['DF_PR','DF_CD','DF_CMACA','DF_CSD']]
 paths += [RAW/'census_economy'/f'{f}.csv' for f in ['DF_PR','DF_CMACA','DF_CSD']]
 return read_profiles(paths)

def process():
 """Validate cached Census inputs and write the reusable profile interim."""
 profiles=csv_profiles()
 if not profiles.get('2021A000011124',{}).get('1'):
  raise ValueError('Census profile missing national population; fetch valid CSV')
 path=ROOT/'data/interim/mvp-profiles.json'
 path.parent.mkdir(parents=True,exist_ok=True)
 path.write_text(json.dumps(profiles,separators=(',',':')))
 print(f'Processed Census profiles for {len(profiles)} geographies')

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

def economy(prof,gdp=None,gdp_year=None):
 jobs={code:None for codes in YIELD_NAICS.values() for code in codes}
 return {'population':prof.get('1'),'employed':prof.get('2225'),'jobs':jobs,'yields':{**{k:combine_jobs(jobs,v) for k,v in YIELD_NAICS.items()},'gold':gdp},'gdp':gdp,'gdp_year':gdp_year if gdp is not None else None,'unemployment':prof.get('2230')/100 if prof.get('2230') is not None else None,'median_income':prof.get('229'),'median_rent':prof.get('1480'),'home_value':prof.get('1474'),'rent_burden':prof.get('1478')/100 if prof.get('1478') is not None else None,'growth':None,'growth_years':None,'pop_series':{'2021':prof.get('1')},'gdp_by_industry':{},'gdp_undisclosed':None}

def refresh_census_economy():
 """Refresh only economic Census fields in existing atlas payloads.

 This is useful when the remainder of the atlas is maintained independently.
 Provenance is verified before any output is written.
 """
 from pipeline.mvp_sources import catalogue
 files=[f'{flow}.csv' for flow in ('DF_PR','DF_CMACA','DF_CSD')]
 sources=catalogue({'census_economy':files})
 profiles=read_profiles([RAW/'census_economy'/name for name in files])
 nation=json.loads((OUT/'nation.json').read_text())
 provinces=json.loads((OUT/'provinces.json').read_text())
 cities=json.loads((OUT/'cities.json').read_text())
 rows=[(nation['nation'],'2021A000011124')]
 rows += [(p,'2021A0002'+p['pruid']) for p in provinces['provinces']]
 rows += [(c, '2021A0005'+c['id'][4:] if c['kind']=='capital' else
           '2021S050'+('4' if c['kind']=='ca' else '3')+c['id']) for c in cities]
 for row,geography in rows:
  values=economy(profiles.get(geography,{}))
  for key in ('employed','median_rent','rent_burden'):row[key]=values[key]
 write('nation.json',nation);write('provinces.json',provinces);write('cities.json',cities)
 write('sources-census.json',sources)

def definitions():
 entries=[
  ('food','Food','Nourriture','Employed residents in agriculture, forestry, fishing and hunting (NAICS 11).','Personnes occupées résidentes en agriculture, foresterie, pêche et chasse (SCIAN 11).','workers'),
  ('production','Production','Production','Employed residents in mining, construction and manufacturing (NAICS 21, 23 and 31–33).','Personnes occupées résidentes dans les mines, la construction et la fabrication (SCIAN 21, 23 et 31–33).','workers'),
  ('gold','Gold','Or','GDP in current Canadian dollars at basic prices, by place of work. CMA figures use the boundary vintage recorded on each city, which may differ from the 2021 Census boundary; basic prices exclude product taxes and include product subsidies.','PIB en dollars canadiens courants aux prix de base, selon le lieu de travail. Les chiffres des RMR utilisent le millésime géographique indiqué pour chaque ville, qui peut différer des limites du Recensement de 2021; les prix de base excluent les taxes sur les produits et incluent les subventions sur les produits.','cad_per_year'),
  ('science','Science','Science','Employed residents in information and cultural industries and professional, scientific and technical services (NAICS 51 and 54).','Personnes occupées résidentes dans l’industrie de l’information et l’industrie culturelle et les services professionnels, scientifiques et techniques (SCIAN 51 et 54).','workers'),
  ('culture','Culture','Culture','Employed residents in arts, entertainment and recreation (NAICS 71).','Personnes occupées résidentes dans les arts, spectacles et loisirs (SCIAN 71).','workers')]
 return [{'key':k,'icon':'y-'+k,'label':{'en':e,'fr':f},'description':{'en':en,'fr':fr},'unit':unit,'color':'#c9a752'} for k,e,f,en,fr,unit in entries]

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
 world=json.loads((OUT/'world.json').read_text())
 # Normalize the alpha abbreviations required by the shared atlas contract.
 abbreviations={'10':'NL','11':'PE','12':'NS','13':'NB','24':'QC','35':'ON','46':'MB','47':'SK','48':'AB','59':'BC','60':'YT','61':'NT','62':'NU'}
 for province in world['provinces']:province['abbr']=abbreviations[province['pruid']]
 grid=HexGrid(**{k:world['grid'][k] for k in ['cols','rows','radius']});owner=world['owner'];proj=world['projection'];profiles=json.loads((ROOT/'data/interim/mvp-profiles.json').read_text());jobdata=labour()
 cd=geometry('census2021/geo4.json','CDUID');citygeo=geometry('census2021/geo6.json','CMAUID',lambda a:a['CMATYPE']=='B' or a['CMAUID'] in ('990','995'));citygeo+=geometry('census2021/iqaluit.json','CSDUID')
 # Store sampled area assignments as an interim: this also accelerates rebuilds.
 cache=ROOT/'data/interim/mvp-geometry.json'
 fingerprint=hashlib.sha256((json.dumps(owner,separators=(',',':'))+''.join(hashlib.sha256((RAW/name).read_bytes()).hexdigest() for name in ['census2021/geo4.json','census2021/geo6.json','census2021/iqaluit.json'])).encode()).hexdigest()
 geo=json.loads(cache.read_text()) if cache.exists() else {}
 if geo.get('fingerprint') != fingerprint:
  divisions=[];citysamples=[]
  for i,o in enumerate(owner):
   if o<0:divisions.append(None);citysamples.append(None);continue
   points=points_for(i,grid,proj);v=sample_assign(cd,points);counts=Counter(x for x in v if x is not None)
   divisions.append(max(counts,key=lambda x:(counts[x],x==v[0])) if counts else None)
   v=sample_assign(citygeo,points);counts=Counter(x for x in v if x is not None)
   citysamples.append(max(counts,key=lambda x:(counts[x],x==v[0])) if counts and max(counts.values())>=4 else None)
  geo={'division':divisions,'city':citysamples,'fingerprint':fingerprint};cache.parent.mkdir(parents=True,exist_ok=True);cache.write_text(json.dumps(geo));print('Sampled census division and CMA boundaries')
 cds=sorted(cd,key=lambda x:x['id']);cdidx={c['id']:i for i,c in enumerate(cds)}
 world['divisions']=[{'cduid':c['id'],'name':{'en':c['a']['CDNAME'],'fr':c['a']['CDNAME']},'pruid':c['a']['PRUID']} for c in cds]
 world['division']=[cdidx.get(c,-1) for c in geo['division']];write('world.json',world)
 poprows=readzip('population/98100005.zip');popmap={r['DGUID']:r for r in poprows};iqrow=next(r for r in readzip('population/98100002.zip') if r['DGUID']=='2021A00056204003')
 popkey=next(x for x in iqrow if x.startswith('Population and dwelling counts') and 'Population, 2021' in x)
 gdpcma={}
 for r in readzip('gdp/36100468.zip'):
  if r['REF_DATE']=='2022' and r['VALUE'] and r['DGUID']:
   dguid=r['DGUID']; value=round(float(r['VALUE'])*1_000_000)
   if dguid=='2016A000011124': gdpcma['Canada']=value
   elif 'S0503' in dguid: gdpcma[dguid[-3:]]=(value,dguid[:4])
   elif 'S0505' in dguid and dguid.endswith('505'):
    prior=gdpcma.get('505',(0,dguid[:4]));gdpcma['505']=(prior[0]+value,dguid[:4])
 gdppt={}
 for r in readzip('gdp/36100711.zip'):
  if r['REF_DATE']=='2021' and r['Prices']=='Current dollars' and r['North American Industry Classification System (NAICS)']=='All industries [T001]' and r['VALUE']:
   gdppt[r['DGUID'][-2:]]=round(float(r['VALUE'])*1_000_000)
 provinces=[]
 for p in world['provinces']:
  pr=p['pruid'];a=economy(profiles.get('2021A0002'+pr,{}),gdppt.get(pr),2021);add_jobs(a,jobdata.get((pr,2)))
  cells=[i for i,o in enumerate(owner) if o==len(provinces) and world['cover'][i]>0]
  a.update(p);a['land']={k:sum(world['pct'][k][i] for i in cells)/len(cells)/100 for k in world['pct']} if cells else None;a['energy']=None;a['label']=None;provinces.append(a)
 national=economy(profiles.get('2021A000011124',{}),gdpcma.get('Canada'),2022);add_jobs(national,jobdata.get(('11124',0)))
 cities=[];used=set();byid={}
 for shape in citygeo:byid.setdefault(shape['id'],[]).append(shape)
 for id,parts in byid.items():
  is_iq=id=='6204003';kind='capital' if is_iq else ('ca' if id in ('990','995') else 'cma');uid='csd-6204003' if is_iq else id
  dguid='2021A00056204003' if is_iq else '2021S050'+('4' if kind=='ca' else '3')+id
  row=iqrow if is_iq else popmap.get(dguid,{})
  name=row.get('GEO') or parts[0]['a'].get('CMANAME','Iqaluit');name=name.replace(' - ','–')
  prof=profiles.get(dguid,{}).copy()
  if prof.get('1') is None and row.get(popkey):prof['1']=int(row[popkey])
  gdp=gdpcma.get(id) if kind=='cma' else None
  a=economy(prof,gdp[0] if gdp else None,2022);add_jobs(a,jobdata.get((id,503 if kind=='cma' else 504)))
  a['gdp_geography_vintage']=gdp[1] if gdp else None
  fp=[i for i,c in enumerate(geo['city']) if c==id and i not in used]
  # Use the centre of the largest official polygon as a schematic anchor.
  main=max(parts,key=lambda s:(s['box'][2]-s['box'][0])*(s['box'][3]-s['box'][1]));b=main['box'];x=((b[0]+b[2])/2-proj['min_x'])/1000;y=(proj['max_y']-(b[1]+b[3])/2)/1000
  candidates=fp or [i for i,o in enumerate(owner) if o>=0 and i not in used and world['provinces'][o]['pruid'] in [s['a']['PRUID'] for s in parts]]
  cell=min(candidates,key=lambda i:(grid.center(i%grid.cols,i//grid.cols)[0]-x)**2+(grid.center(i%grid.cols,i//grid.cols)[1]-y)**2)
  if not fp:fp=[cell]
  used.update(fp);x,y=grid.center(cell%grid.cols,cell//grid.cols)
  prs=list(dict.fromkeys(world['provinces'][o]['abbr'] for o in [next(j for j,p in enumerate(world['provinces']) if p['pruid']==s['a']['PRUID']) for s in parts]))
  names={'en':name,'fr':name};a.update({'id':uid,'kind':kind,'name':names,'full':{'en':name+', '+', '.join(prs),'fr':name+' ('+', '.join(prs)+')'},'provinces':prs,'metro':kind=='cma','capital':is_iq or id in ('990','995','505'),'x':x,'y':y,'cell':cell,'footprint':fp,'divisions':sorted({geo['division'][i] for i in fp if geo['division'][i]}),'ranks':{},'peers':[]});cities.append(a)
 nation={'year':2021,'vintage':'Census 2021','gdp_vintage':'2022, 36-10-0468-01 (CMA geography varies: see gdp_geography_vintage); provinces 2021, 36-10-0711-01','nation':national,'yields':definitions(),'industries':{}}
 from pipeline.mvp_annual import apply as apply_annual
 apply_annual(nation,provinces,cities)
 cities.sort(key=lambda c:-(c['population'] or 0))
 for seq in [cities,provinces]:
  for key in ['population','gdp','gold','food','production','science','culture','unemployment']:
   value=lambda a:a['yields'].get(key) if key in a['yields'] else a.get(key)
   ranked=sorted((x for x in seq if value(x) is not None),key=lambda a:-value(a))
   for i,a in enumerate(ranked):a.setdefault('ranks',{})[key]=i+1
 for c in cities:c['peers']=[x['id'] for x in sorted((x for x in cities if x is not c),key=lambda x:abs((x['population'] or 0)-(c['population'] or 0)))[:5]]
 write('nation.json',nation);write('provinces.json',{'provinces':provinces});write('cities.json',cities)
 from pipeline.mvp_lenses import build as build_lenses, fraction
 lenses=build_lenses(world,profiles)
 # Column-oriented CD values: land-cover measures are averages of the valid
 # sampled hex values, while census measures come directly from the profile.
 fields=['cduid','name','abbr','population','land_area','density','income','home','poverty','age','bachelors','forest','farmland','developed','official_language','cma','cell']
 columns={field:[] for field in fields}
 lens_by_id={lens['id']:lens for lens in lenses['lenses']}
 by_pr={p['pruid']:p['abbr'] for p in world['provinces']}
 for index,division in enumerate(world['divisions']):
  cells=[i for i,assigned in enumerate(world['division']) if assigned==index]
  profile=profiles.get('2021A0003'+division['cduid'],{})
  row={'cduid':division['cduid'],'name':division['name'],'abbr':by_pr[division['pruid']],
       'population':profile.get('1'),'land_area':profile.get('7'),
       'cma':None,'cell':cells[0] if cells else None,
       'density':profile.get('6'),'income':profile.get('229'),'home':profile.get('1474'),
       'poverty':fraction(profile.get('331'),100),'age':profile.get('40'),
       'bachelors':fraction(profile.get('2024'),profile.get('2014')),
       'official_language':fraction(profile.get('376'),profile.get('374'))}
  for key in ('forest','farmland','developed'):
   lens=lens_by_id[key]
   values=[lens['values'][i] for i in cells if lens['values'][i] is not None]
   row[key]=sum(values)/len(values) if values else None
  for field in fields:columns[field].append(row.get(field))
 write('divisions.json',{'vintage':'Census 2021; land cover 2020','fields':fields,'columns':columns,'rows':len(world['divisions']),
       'note':{'en':'Land-cover shares average assigned hex samples; missing census observations remain null. CMA membership is not inferred from overlapping coarse hexes.',
               'fr':'Les parts de couverture terrestre sont des moyennes des échantillons d’hexagones attribués; les observations manquantes du recensement restent nulles. L’appartenance à une RMR n’est pas déduite des hexagones approximatifs.'}})
 from pipeline.mvp_sources import catalogue
 sources=json.loads((OUT/'sources.json').read_text())
 world_ids={'statcan_boundaries_2021','nrcan_mrdem','nrcan_landcover_2020','etopo','natural_earth','atlas_rivers','atlas_lakes'}
 sources=[item for item in sources if item['id'] in world_ids]
 used={'census2021':['DF_PR.csv','DF_CD.csv','DF_CMACA.csv','DF_CSD.csv','geo4.json','geo6.json','iqaluit.json'],
       'census_economy':['DF_PR.csv','DF_CMACA.csv','DF_CSD.csv'],
       'population':['98100005.zip','98100002.zip'], 'gdp':['36100468.zip','36100711.zip'],
       'labour2021':['metadata.json']+[p.name for p in sorted((RAW/'labour2021').glob('data-*.json'))]}
 sources.extend(catalogue(used))
 from pipeline.mvp_annual import catalogue as annual_catalogue
 sources.extend(annual_catalogue())
 from pipeline.merge_disasters import merge as merge_disasters
 lenses,sources=merge_disasters(world,lenses,sources)
 from pipeline.election2025 import RAW as ELECTION_RAW, merge as merge_election2025
 if (ELECTION_RAW / 'results.csv').exists() and (ELECTION_RAW / 'boundaries.zip').exists():
  lenses,sources=merge_election2025(world,lenses,sources)
 else:
  election=OUT/'election2025.json'
  if election.exists():
   payload=json.loads(election.read_text())
   if payload.get('lens'):
    lenses['lenses']=[row for row in lenses['lenses'] if row.get('id')!='election2025']+[payload['lens']]
  election_sources=OUT/'sources-election2025.json'
  if election_sources.exists():
   extra=json.loads(election_sources.read_text())
   sources=[row for row in sources if row.get('id') not in {item.get('id') for item in extra}]+extra
 for name in ('sources-csd-explorer.json','sources-crops.json'):
  extra_path=OUT/name
  if extra_path.exists():
   extra=json.loads(extra_path.read_text())
   sources=[row for row in sources if row.get('id') not in {item.get('id') for item in extra}]+extra
 write('lenses.json',lenses);write('sources.json',sources)
 print('Built MVP atlas data and source catalogue')
