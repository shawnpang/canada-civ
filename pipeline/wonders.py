"""Build the wonders payload. Run with --fetch to refresh the cited inputs.

The 2025–26 attendance files are Windows-1252. Offline builds use the
cached files in data/raw/wonders; the landmark list is a curated source file.
"""
import argparse
import csv
import datetime
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen

from pipeline.core.geo import MapProjection, project
from pipeline.core.hexgrid import HexGrid
from pipeline.wonders_landmarks import LANDMARKS

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'data/raw/wonders'
DATASET = 'https://open.canada.ca/data/en/dataset/1e2bd6b2-d6c7-415b-8c95-f5f6b2459759'
URLS = {
    'attendance-en.csv': 'https://open.canada.ca/data/dataset/1e2bd6b2-d6c7-415b-8c95-f5f6b2459759/resource/73609a87-77f6-4a69-bd96-b8e3f3451aa7/download/parks-canada-attendance-2025_26.csv',
    'attendance-fr.csv': 'https://open.canada.ca/data/dataset/1e2bd6b2-d6c7-415b-8c95-f5f6b2459759/resource/c018c61f-ea87-4995-9224-9e529a7944a2/download/frequentation-a-parcs-canada-2025_26.csv',
    'locations-en.html': 'https://parks.canada.ca/',
}
PARK_LIMIT, HISTORIC_LIMIT = 12, 10


def parse_attendance(value):
    """Publisher's UR and TC are missing, while an actual zero stays zero."""
    value = (value or '').strip().replace('\u00a0', ' ')
    if value.upper() in ('', 'UR', 'TC'):
        return None
    if not re.fullmatch(r'[0-9][0-9, ]*', value):
        raise ValueError('Invalid attendance: ' + value)
    return int(value.replace(',', '').replace(' ', ''))


def parse_rows(en_bytes, fr_bytes):
    def read(data):
        rows = list(csv.reader(io.StringIO(data.decode('cp1252'))))
        return [row for row in rows[1:] if len(row) >= 2 and row[0] and not row[0].startswith(('UR =', 'TC ='))]
    en, fr = read(en_bytes), read(fr_bytes)
    if len(en) != len(fr):
        raise ValueError('Attendance translations have different row counts')
    result = []
    historic = False
    for a, b in zip(en, fr):
        av, bv = parse_attendance(a[1]), parse_attendance(b[1])
        if av != bv or a[1].strip() in ('UR', 'TC') and a[1].strip() != b[1].strip():
            raise ValueError('Attendance translations are not aligned: ' + a[0])
        if a[0] == 'Cape Spear Lighthouse National Historic Site':
            historic = True
        category = 'historic_site' if historic else 'national_park'
        if not historic and ('Marine Park' in a[0] or a[0] == 'Mount Revelstoke & Glacier National Parks'):
            category = 'excluded'
        result.append({'name': {'en': a[0], 'fr': b[0]}, 'attendance': av, 'category': category})
    if not historic:
        raise ValueError('Historic-site section marker missing')
    return result


def select_ranked(records, category, limit):
    return sorted((r for r in records if r['category'] == category and r['attendance'] is not None),
                  key=lambda r: (-r['attendance'], r['name']['en']))[:limit]


class LocationParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.point = None; self.cells = []; self.in_td = False; self.text = [] ; self.locations = {}
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'tr':
            m = re.fullmatch(r'POINT \(([-\d.]+) ([-\d.]+)\)', attrs.get('data-geometry', ''))
            self.point = tuple(map(float, m.groups())) if m else None; self.cells = []
        elif tag == 'td' and self.point:
            self.in_td = True; self.text = []
    def handle_data(self, data):
        if self.in_td: self.text.append(data)
    def handle_endtag(self, tag):
        if tag == 'td' and self.in_td:
            self.cells.append(''.join(self.text).strip()); self.in_td = False
        elif tag == 'tr' and self.point:
            if len(self.cells) >= 2: self.locations[self.cells[1]] = self.point
            self.point = None


def position(world, lon, lat):
    if lon is None or lat is None: return None, None, None
    if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)) or not (-180 <= lon <= 180 and 40 <= lat <= 90):
        raise ValueError('Invalid coordinates')
    projection = MapProjection(world['projection']['min_x'], world['projection']['max_y'])
    x, y = projection.to_map(*project(lon, lat))
    grid = HexGrid(world['grid']['cols'], world['grid']['rows'], world['grid']['radius'])
    col, row = grid.cell(x, y)
    if not (0 <= col < grid.cols and 0 <= row < grid.rows): return None, None, None
    return round(x, 2), round(y, 2), row * grid.cols + col


def build(world, rows, locations, landmarks):
    items = []
    for category, limit in [('national_park', PARK_LIMIT), ('historic_site', HISTORIC_LIMIT)]:
        for rank, row in enumerate(select_ranked(rows, category, limit), 1):
            lon, lat = locations.get(row['name']['en'], (None, None))
            x, y, cell = position(world, lon, lat)
            items.append({'type': category, 'name': row['name'], 'attendance': row['attendance'], 'rank': rank,
                          'x': x, 'y': y, 'cell': cell, 'sources': ['parks_canada_attendance', 'parks_canada_locations']})
    for row in landmarks:
        x, y, cell = position(world, row.get('lon'), row.get('lat'))
        items.append({'type':'landmark', 'name':row['name'], 'attendance':None, 'rank':None,
                      'x':x, 'y':y, 'cell':cell, 'sources':[row['source']],
                      'source_url': 'https://geonames.nrcan.gc.ca/search-place-names/unique?id=' + row['geoname_id'] if row.get('geoname_id') else None})
    return {'version':1, 'vintage':{'parks_canada_attendance':'2025–26', 'parks_canada_locations':'see source retrieval date', 'nrcan_cgn':'retrieved 2026-11-27'},
        'sources':['parks_canada_attendance','parks_canada_locations','nrcan_cgn'],
        'rules':[
            {'id':'national_park', 'en':'Select the 12 highest reported 2025–26 attendance counts for individual national parks and national park reserves, across all provinces and territories; ties sort by English name. Marine parks and the combined Mount Revelstoke and Glacier reporting unit are excluded. UR (unable to report) and TC (temporarily closed) are not zero and cannot be ranked.', 'fr':'Sélectionner les 12 parcs nationaux et réserves de parc national individuels ayant les fréquentations déclarées les plus élevées en 2025–2026, dans toutes les provinces et tous les territoires; les égalités sont triées selon le nom anglais. Les parcs marins et l’unité de déclaration combinée Mont-Revelstoke et Glaciers sont exclus. UR (impossible de calculer) et TC (temporairement fermé) ne sont pas des zéros et ne peuvent être classés.'},
            {'id':'historic_site', 'en':'Separately select the 10 highest reported 2025–26 counts among the historic-site reporting units in the Parks Canada file, including canals and other combined units; ties sort by English name. Unknown counts are excluded.', 'fr':'Sélectionner séparément les 10 fréquentations déclarées les plus élevées en 2025–2026 parmi les unités de déclaration de lieux historiques du fichier de Parcs Canada, y compris les canaux et autres unités combinées; les égalités sont triées selon le nom anglais. Les valeurs inconnues sont exclues.'},
            {'id':'landmark', 'en':'A short editorial selection of named natural landmarks for regional spread, at most one per city, excluding the selected park and historic-site units; this is illustrative, not a ranking. Positions use the Canadian Geographical Names Database.', 'fr':'Courte sélection éditoriale de repères naturels nommés répartis entre les régions, au maximum un par ville, à l’exclusion des unités de parcs et de lieux historiques sélectionnées; elle est illustrative et ne constitue pas un classement. Les positions proviennent de la Base de données toponymiques du Canada.'},
            {'id':'universities', 'en':'University wonders are omitted: no openly accessible comparable institution-level R&D or sponsored-research series was found. Statistics Canada’s higher-education R&D series is geographically aggregated.', 'fr':'Les universités sont omises : aucune série comparable de recherche-développement ou de recherche commanditée par établissement accessible librement n’a été trouvée. La série de Statistique Canada sur la R-D dans l’enseignement supérieur est agrégée géographiquement.'},
            {'id':'caveat', 'en':'Attendance is a fiscal-year reporting-unit count, not a count of unique people; methods and access differ among places. Points are schematic official location markers, not boundaries; a ranked unit without a matching point remains in the list with a null position. An unavailable count may affect the ordering.', 'fr':'La fréquentation est un dénombrement par unité de déclaration et exercice financier, et non un nombre de personnes distinctes; les méthodes et l’accès varient selon les lieux. Les points sont des repères officiels schématiques, non des limites; une unité classée sans point correspondant reste dans la liste avec une position nulle. Une valeur indisponible peut modifier le classement.'}], 'items':items}


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--fetch', action='store_true'); args = parser.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)
    if args.fetch:
        for name, url in URLS.items():
            with urlopen(Request(url, headers={'User-Agent':'CanadaCiv/1.0'}), timeout=90) as response: data = response.read()
            (RAW/name).write_bytes(data)
    rows = parse_rows((RAW/'attendance-en.csv').read_bytes(), (RAW/'attendance-fr.csv').read_bytes())
    locations = LocationParser(); locations.feed((RAW/'locations-en.html').read_text(encoding='utf-8'))
    landmarks = LANDMARKS
    world = json.loads((ROOT/'web/data/world.json').read_text())
    payload = build(world, rows, locations.locations, landmarks)
    (ROOT/'web/data/wonders.json').write_text(json.dumps(payload, ensure_ascii=False, separators=(',',':'))+'\n')
    def file_info(name):
        p = RAW/name; b = p.read_bytes()
        return {'file':str(p.relative_to(ROOT)), 'url':URLS[name], 'retrieved':datetime.datetime.fromtimestamp(p.stat().st_mtime, datetime.timezone.utc).date().isoformat(), 'sha256':hashlib.sha256(b).hexdigest(), 'bytes':len(b)}
    sources = [
        {'id':'parks_canada_attendance','title':'Parks Canada attendance 2025–26','publisher':'Parks Canada','homepage':DATASET,'license':'Open Government Licence – Canada','vintage':'2025–26','used_for':'National park and historic-site attendance rules','files':[file_info('attendance-en.csv'),file_info('attendance-fr.csv')]},
        {'id':'parks_canada_locations','title':'Find a Parks Canada location','publisher':'Parks Canada','homepage':URLS['locations-en.html'],'license':'Open Government Licence – Canada','vintage':'retrieval date','used_for':'Schematic points for attendance units','files':[file_info('locations-en.html')]},
        {'id':'nrcan_cgn','title':'Canadian Geographical Names Database','publisher':'Natural Resources Canada','homepage':'https://open.canada.ca/data/en/dataset/e27c6eba-3c5d-4051-9db2-082dc6411c2c','license':'Open Government Licence – Canada','vintage':'retrieved 2026-11-27','used_for':'Curated landmark coordinates and names; individual record URLs are on the items','files':[]},
    ]
    (ROOT/'web/data/sources-wonders.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2)+'\n')
    print('Wrote', len(payload['items']), 'wonders;', sum(i['x'] is None for i in payload['items']), 'without positions')

if __name__ == '__main__': main()
