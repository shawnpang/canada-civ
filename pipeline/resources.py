"""Build the M2 resource inventory from cached NRCan ArcGIS query responses.

Run `uv run python -m pipeline.resources --fetch` to refresh, or without
`--fetch` to build offline. The source catalogue fragment is written to the
raw cache for the integrator to merge into sources.json.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

from pipeline.core.geo import MapProjection, project
from pipeline.core.hexgrid import HexGrid

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'data/raw'
QUERY = '?where=1%3D1&outFields=*&outSR=4326&f=json'
MINE_BASE = 'https://maps-cartes.services.geo.ca/server_serveur/rest/services/NRCan/900A_and_top_100_en/MapServer/'
GEN_BASE = 'https://geoappext.nrcan.gc.ca/arcgis/rest/services/Energy/CERP_EN/MapServer/'
CAPACITY_CUTOFF_MW = 100
PROVINCES = {'Newfoundland and Labrador':'NL', 'Prince Edward Island':'PE', 'Nova Scotia':'NS', 'New Brunswick':'NB', 'Quebec':'QC', 'Ontario':'ON', 'Manitoba':'MB', 'Saskatchewan':'SK', 'Alberta':'AB', 'British Columbia':'BC', 'Yukon':'YT', 'Northwest Territories':'NT', 'Nunavut':'NU'}
GENERATION = [('biomass','Biomass','Biomasse'),('hydro','Hydroelectric','Hydroélectricité'),('nuclear','Nuclear','Nucléaire'),('solar','Solar','Solaire'),('tidal','Tidal','Marémotrice'),('wind','Wind','Éolien')]
MINES = [('metal_mine','Metal mines','Mines métalliques'),('nonmetal_mine','Nonmetal mines','Mines non métalliques'),('coal_mine','Coal mines','Mines de charbon'),('oil_sands','Oil sands mines','Mines de sables bitumineux')]


def paths():
    return [(f'resources-generation-{i}.json', GEN_BASE+str(i)+'/query'+QUERY) for i in range(1,7)] + [(f'resources-mines-{i}.json', MINE_BASE+str(i)+'/query'+QUERY) for i in range(3,7)]


def fetch():
    RAW.mkdir(parents=True, exist_ok=True)
    for filename, url in paths():
        with urlopen(Request(url, headers={'User-Agent':'CanadaCiv/1.0'}), timeout=90) as response:
            data = response.read()
        validate_response(json.loads(data), filename)
        (RAW / filename).write_bytes(data)


def validate_response(data, filename):
    if data.get('error') or data.get('exceededTransferLimit') or not isinstance(data.get('features'), list):
        raise ValueError(f'Incomplete or invalid ArcGIS response: {filename}')
    return data['features']


def point(feature, world):
    geometry = feature.get('geometry') or {}
    lon, lat = geometry.get('x'), geometry.get('y')
    if not isinstance(lon, (float, int)) or not isinstance(lat, (float, int)) or not (-180 <= lon <= 180 and 40 <= lat <= 90):
        return None
    projection = MapProjection(world['projection']['min_x'], world['projection']['max_y'])
    x, y = projection.to_map(*project(lon, lat))
    grid = HexGrid(world['grid']['cols'], world['grid']['rows'], world['grid']['radius'])
    col, row = grid.cell(x, y)
    if not (0 <= col < grid.cols and 0 <= row < grid.rows):
        return None
    return round(x, 2), round(y, 2), row * grid.cols + col


def clean(value):
    """Translate publisher missing-value markers to JSON null."""
    if isinstance(value, str) and value.strip().lower() in ('', 'not available / non disponible', 'n/a'):
        return None
    return value


def build(world, inputs):
    types, items = [], []
    for index, (type_id, en, fr) in enumerate(GENERATION, 1):
        types.append({'id':type_id, 'name':{'en':en,'fr':fr}, 'category':'energy', 'unit':'MW', 'description':{'en':'NRCan 2016 clean generation records with capacity at least 100 MW and valid mapped coordinates; fossil-fuel stations are excluded.', 'fr':'Installations de production d’énergie propre de RNCan de 2016, d’une capacité d’au moins 100 MW et avec des coordonnées cartographiables valides; les centrales aux combustibles fossiles sont exclues.'}, 'source':'nrcan_clean_generation'})
        for feature in inputs[f'resources-generation-{index}.json']:
            a = feature['attributes']; value = a.get('MEGAWATTS'); position = point(feature, world)
            if not isinstance(value, (int,float)) or isinstance(value,bool) or value < CAPACITY_CUTOFF_MW or position is None: continue
            x,y,cell = position
            items.append({'type':type_id, 'name':a.get('STATION'), 'x':x, 'y':y, 'cell':cell, 'value':value, 'detail':{'operator':clean(a.get('STATION_OW')), 'commissioned':clean(a.get('COM_DATE2'))}, 'abbr':(a.get('PROVTERR') or '').strip() or None, 'city':None})
    for index, (type_id,en,fr) in enumerate(MINES, 3):
        types.append({'id':type_id, 'name':{'en':en,'fr':fr}, 'category':'energy' if type_id=='oil_sands' else 'mineral', 'unit':None, 'description':{'en':'All geocoded principal producing sites in NRCan 900A for this category; NRCan selects significant sites and supplies no numerical size cutoff in these records.', 'fr':'Tous les principaux sites producteurs géocodés de cette catégorie dans la carte 900A de RNCan; RNCan sélectionne les sites importants sans seuil numérique de taille dans ces données.'}, 'source':'nrcan_900a'})
        for feature in inputs[f'resources-mines-{index}.json']:
            a = feature['attributes']; position = point(feature, world)
            if position is None: continue
            x,y,cell = position
            items.append({'type':type_id, 'name':a.get('operation_name_en'), 'x':x, 'y':y, 'cell':cell, 'value':None, 'detail':{'product':clean(a.get('product_en_spelt')), 'operator':clean(a.get('operator_owners_en')), 'facility':clean(a.get('facilities_code_en_spelt'))}, 'abbr':PROVINCES.get(a.get('province_en')), 'city':None})
    return {'version':1, 'vintage':{'nrcan_900a':'2025','nrcan_clean_generation':'2016'}, 'sources':['nrcan_900a','nrcan_clean_generation'], 'rules':{'en':'Generating records: at least 100 MW with valid map coordinates. 900A: all geocoded principal producing mine and oil sands records; no numeric size cutoff is supplied. Generation inventory is historical, covers clean power only and is not a complete or current list of power stations. Counts and capacities describe mapped records only, not national totals.', 'fr':'Production électrique : installations d’au moins 100 MW avec coordonnées cartographiables valides. Carte 900A : tous les principaux sites producteurs géocodés de mines et de sables bitumineux; aucun seuil numérique de taille n’est fourni. L’inventaire électrique est historique, limité à l’énergie propre et ne constitue pas une liste complète ou actuelle des centrales. Les nombres et capacités concernent uniquement les enregistrements cartographiés et non les totaux nationaux.'}, 'types':types, 'items':items, 'summary':{'mapped_sites':len(items), 'mapped_generating_capacity_mw':sum(item['value'] for item in items if item['value'] is not None), 'mapped_by_type':{t['id']:sum(item['type']==t['id'] for item in items) for t in types}}}


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--fetch',action='store_true'); args=parser.parse_args()
    if args.fetch: fetch()
    inputs = {name:validate_response(json.loads((RAW/name).read_text()),name) for name,_ in paths()}
    world = json.loads((ROOT/'web/data/world.json').read_text())
    result = build(world, inputs)
    (ROOT/'web/data/resources.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',',':'))+'\n')
    records=[]
    for source_id,title,product,vintage,homepage,subset in [
        ('nrcan_clean_generation','Clean power generating stations by type in megawatts (MW)','65d3db23-b83c-4f49-ab93-65c59ee0e6aa','2016','https://open.canada.ca/data/en/dataset/65d3db23-b83c-4f49-ab93-65c59ee0e6aa',paths()[:6]),
        ('nrcan_900a','Principal Mineral Areas, Producing Mines, and Oil and Gas Fields (900A)','000183ed-8864-42f0-ae43-c4313a860720','2025','https://open.canada.ca/data/en/dataset/000183ed-8864-42f0-ae43-c4313a860720',paths()[6:])]:
        files=[]
        for name,url in subset:
            path=RAW/name; data=path.read_bytes(); retrieved=datetime.datetime.fromtimestamp(path.stat().st_mtime, datetime.timezone.utc).date().isoformat(); files.append({'file':str(path.relative_to(ROOT)),'url':url,'retrieved':retrieved,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
        records.append({'id':source_id,'title':title,'publisher':'Natural Resources Canada','product_id':product,'vintage':vintage,'homepage':homepage,'license':'Open Government Licence – Canada','used_for':'Resource sites and published selection rules','files':files})
    (RAW/'resources-sources.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
    print(f"Wrote {len(result['items'])} resource records")

if __name__ == '__main__': main()
