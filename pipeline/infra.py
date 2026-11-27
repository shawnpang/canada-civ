"""Build small-scale infrastructure layers from cached official downloads.

Run `python -m pipeline.infra` to fetch absent inputs and rebuild, or add
`--offline` to require cached files. Separate from the shared pipeline CLI.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import urllib.request
import zipfile
from datetime import datetime, timezone

from pipeline.core.geo import A, C, E, N, _t, MapProjection, project
from pipeline.core.hexgrid import HexGrid

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/infra'
WEB = ROOT / 'web/data'
ATLAS = 'https://ftp.geogratis.gc.ca/pub/nrcan_rncan/vector/framework_cadre/Atlas_of_Canada_15M/transportation/'
AIRPORTS = 'https://ftp.cartes.canada.ca/pub/tc_tc/Airports_Aeroport/canadian_airports_w_air_navigation_services/'
HARBOURS = 'https://egisp.dfo-mpo.gc.ca/arcgis/rest/services/open_data_donnees_ouvertes/small_craft_harbours_en/MapServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson'
DND = 'https://www.canada.ca/en/department-national-defence/services/bases-support-units.html'
FILES = {
 'roads.zip': ATLAS + 'AC_15M_Roads.shp.zip',
 'rail.zip': ATLAS + 'AC_15M_Railways.shp.zip',
 'airports-en.zip': AIRPORTS + 'Airports_Aeroports_en_shape.zip',
 'airports-fr.zip': AIRPORTS + 'Airports_Aeroports_fr_shape.zip',
 'harbours.json': HARBOURS,
 'harbour-count.json': 'https://egisp.dfo-mpo.gc.ca/arcgis/rest/services/open_data_donnees_ouvertes/small_craft_harbours_en/MapServer/0/query?where=1%3D1&returnCountOnly=true&f=json',
 'dnd-en.html': DND,
 'dnd-fr.html': 'https://www.canada.ca/fr/ministere-defense-nationale/services/bases-unites-de-soutien.html',
 **{f'geoname-{k}.json': f'https://geogratis.gc.ca/services/geoname/en/geonames/{k}.json' for k in ('EQBXK', 'CAABW', 'IAAGV', 'JCEFI')},
}


def fetch(offline=False):
    RAW.mkdir(parents=True, exist_ok=True)
    for name, url in FILES.items():
        path = RAW / name
        if not path.exists():
            if offline:
                raise FileNotFoundError(path)
            with urllib.request.urlopen(url, timeout=120) as response:
                path.write_bytes(response.read())


def dbf(data):
    count = struct.unpack_from('<I', data, 4)[0]
    header, size = struct.unpack_from('<HH', data, 8)
    fields = []
    for offset in range(32, header - 1, 32):
        entry = data[offset:offset + 32]
        fields.append((entry[:11].split(b'\0')[0].decode('utf-8'), entry[16]))
    rows = []
    for i in range(count):
        record = data[header + i * size:header + (i + 1) * size]
        offset, row = 1, {}
        for name, width in fields:
            row[name] = record[offset:offset + width].decode('utf-8').strip()
            offset += width
        rows.append(row)
    return rows


def shapefile(data):
    """Read point and polyline records without external GIS libraries."""
    offset = 100
    while offset < len(data):
        _, words = struct.unpack_from('>ii', data, offset)
        record = data[offset + 8:offset + 8 + words * 2]
        kind = struct.unpack_from('<i', record)[0]
        if kind == 0:
            yield []
        elif kind == 1:
            yield [struct.unpack_from('<2d', record, 4)]
        elif kind == 3:
            parts, count = struct.unpack_from('<2i', record, 36)
            indexes = list(struct.unpack_from(f'<{parts}i', record, 44)) + [count]
            points = [struct.unpack_from('<2d', record, 44 + 4 * parts + 16 * i) for i in range(count)]
            yield [points[indexes[i]:indexes[i + 1]] for i in range(parts)]
        else:
            raise ValueError(f'Unsupported shape type {kind}')
        offset += 8 + words * 2


def archive(path, basename):
    with zipfile.ZipFile(path) as z:
        def read(suffix):
            name = next(n for n in z.namelist() if n.endswith('/' + basename + suffix) or n == basename + suffix)
            return z.read(name)
        return list(shapefile(read('.shp'))), dbf(read('.dbf'))


def atlas_lonlat(x, y):
    """Inverse NAD83 Canada Atlas Lambert (EPSG:3978)."""
    rho0 = A * C * _t(math.radians(49)) ** N
    dx, dy = x, rho0 - y
    rho = math.hypot(dx, dy)
    t = (rho / (A * C)) ** (1 / N)
    phi = math.pi / 2 - 2 * math.atan(t)
    for _ in range(15):
        s = E * math.sin(phi)
        nxt = math.pi / 2 - 2 * math.atan(t * ((1 - s) / (1 + s)) ** (E / 2))
        if abs(nxt - phi) < 1e-13:
            phi = nxt
            break
        phi = nxt
    return -95 + math.degrees(math.atan2(dx, dy) / N), math.degrees(phi)


def simplify(points, tolerance=2):
    """Iterative Douglas–Peucker in map km; preserves endpoints."""
    if len(points) < 3:
        return points
    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        x1, y1 = points[a]; x2, y2 = points[b]
        dx, dy = x2-x1, y2-y1
        length2 = dx*dx + dy*dy
        best, best_i = tolerance * tolerance, None
        for i in range(a + 1, b):
            x, y = points[i]
            t = min(1, max(0, ((x-x1)*dx+(y-y1)*dy)/length2)) if length2 else 0
            distance = (x-x1-t*dx)**2 + (y-y1-t*dy)**2
            if distance > best:
                best, best_i = distance, i
        if best_i is not None:
            keep.add(best_i)
            stack.extend([(a, best_i), (best_i, b)])
    return [points[i] for i in sorted(keep)]


def source_file(name):
    content = (RAW / name).read_bytes()
    return {'file': 'data/raw/infra/' + name, 'url': FILES[name], 'retrieved': datetime.fromtimestamp((RAW / name).stat().st_mtime, timezone.utc).date().isoformat(), 'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)}


def make_sources():
    def source(id, title, product, vintage, publisher, homepage, license, names, used_for):
        return {'id': id, 'title': title, 'product_id': product, 'vintage': vintage, 'publisher': publisher,
                'homepage': homepage, 'license': license, 'description': title, 'used_for': used_for,
                'files': [source_file(n) for n in names]}
    ogl = 'Open Government Licence – Canada'
    return [
      source('atlas_15m_roads', 'Atlas of Canada National Scale Data 1:15,000,000 – Roads', '1326fb30-046a-546e-b9a3-1102bcfb44b8', '2017', 'Natural Resources Canada', 'https://open.canada.ca/data/en/dataset/1326fb30-046a-546e-b9a3-1102bcfb44b8', ogl, ['roads.zip'], 'Generalized road routes'),
      source('atlas_15m_rail', 'Atlas of Canada National Scale Data 1:15,000,000 – Railways', 'c751172b-37d5-5115-92f0-6652f97b1743', '2017', 'Natural Resources Canada', 'https://open.canada.ca/data/en/dataset/c751172b-37d5-5115-92f0-6652f97b1743', ogl, ['rail.zip'], 'Generalized railway routes'),
      source('tc_airports', 'Airports with air navigation services', '3a1eb6ef-6054-4f9d-b1f6-c30322cd7abf', '2021', 'Transport Canada', 'https://open.canada.ca/data/en/dataset/3a1eb6ef-6054-4f9d-b1f6-c30322cd7abf', ogl, ['airports-en.zip','airports-fr.zip'], 'Airports served by NAV CANADA control towers or flight service stations'),
      source('dfo_small_craft_harbours', 'Small Craft Harbours Locations and Information', '262451e7-6416-47b5-8453-f31d212ea657', '2026-03-24', 'Fisheries and Oceans Canada', 'https://open.canada.ca/data/en/dataset/262451e7-6416-47b5-8453-f31d212ea657', ogl, ['harbours.json', 'harbour-count.json'], 'Core fishing harbour points, not commercial port rankings'),
      source('dnd_bases', 'Canadian Armed Forces bases and support units', 'CAF bases and support units directory', 'current directory; retrieval date in files', 'Department of National Defence', DND, 'Crown copyright; Canada.ca terms', ['dnd-en.html','dnd-fr.html'], 'Public directory used to select curated military points'),
      source('cgn_military', 'Canadian Geographical Names Database', 'CGNDB keys EQBXK, CAABW, IAAGV, JCEFI', 'decisions 1990; retrieval date in files', 'Natural Resources Canada', 'https://natural-resources.canada.ca/maps-tools-publications/maps/geographical-names-canada/geoname-service-api', ogl, [f'geoname-{k}.json' for k in ('EQBXK','CAABW','IAAGV','JCEFI')], 'Official geographical name coordinates for selected directory entries'),
    ]


def build():
    world = json.loads((WEB / 'world.json').read_text())
    projection = MapProjection(world['projection']['min_x'], world['projection']['max_y'])
    grid = HexGrid(**world['grid'])
    def mapped(lon, lat):
        x, y = projection.to_map(*project(lon, lat))
        return [round(x, 2), round(y, 2)]
    def cell(x, y):
        col, row = grid.cell(x, y)
        return row * grid.cols + col if 0 <= col < grid.cols and 0 <= row < grid.rows else None
    routes = {}
    for kind, filename, basename in [('roads','roads.zip','AC_15M_Roads'), ('rail','rail.zip','AC_15M_Railways')]:
        shapes, attrs = archive(RAW / filename, basename)
        routes[kind] = []
        for parts, row in zip(shapes, attrs):
            for part in parts:
                points = simplify([mapped(*atlas_lonlat(*p)) for p in part])
                if len(points) > 1:
                    routes[kind].append({'points': points, 'name': None, 'source': 'atlas_15m_' + kind if kind == 'roads' else 'atlas_15m_rail'})
    airport_shapes, airports_en = archive(RAW / 'airports-en.zip', 'Airports_Aeroports_en_shape')
    _, airports_fr = archive(RAW / 'airports-fr.zip', 'Airports_Aeroports_fr_shape')
    fr = {r['TC_ID']: r for r in airports_fr}
    airports = []
    for shape, en in zip(airport_shapes, airports_en):
        if not shape: continue
        lon, lat = shape[0]; x, y = mapped(lon, lat)
        french = fr.get(en['TC_ID'], {})
        airports.append({'id': en['ICAO'], 'name': {'en': en['AIRPORT'], 'fr': french.get('AÉROPORT', en['AIRPORT'])}, 'x': x, 'y': y, 'cell': cell(x,y), 'source': 'tc_airports'})
    harbours = json.loads((RAW / 'harbours.json').read_text())
    if harbours.get('exceededTransferLimit') or len(harbours['features']) != json.loads((RAW / 'harbour-count.json').read_text())['count']:
        raise ValueError('Harbour service truncated results')
    ports = []
    for f in harbours['features']:
        if not f.get('geometry') or f['geometry']['type'] != 'Point': continue
        p = f['properties']; x, y = mapped(*f['geometry']['coordinates'])
        ports.append({'id': str(p['Harbour_number']), 'name': p['Harbour_Name'], 'kind': 'core_fishing_harbour', 'x': x, 'y': y, 'cell': cell(x,y), 'source': 'dfo_small_craft_harbours'})
    directory = (RAW / 'dnd-en.html').read_text().lower()
    military = []
    for key, place in [('EQBXK','Bagotville'),('CAABW','Greenwood'),('IAAGV','Cold Lake'),('JCEFI','Comox')]:
        if ('canadian forces base ' + place).lower() not in directory:
            raise ValueError(f'{place} missing from DND directory')
        point = json.loads((RAW / f'geoname-{key}.json').read_text())
        x,y = mapped(point['longitude'], point['latitude'])
        military.append({'id':key, 'name': {'en': 'Canadian Forces Base ' + place, 'fr': 'Base des Forces canadiennes ' + place}, 'x':x,'y':y,'cell':cell(x,y),'sources':['dnd_bases','cgn_military']})
    payload = {'version':1, 'vintage':'2017 roads and rail; 2021 airports; 2026 harbours and directory',
      'sources': [s['id'] for s in make_sources()],
      'rules': {'en': 'Roads and rail are the NRCan 1:15,000,000 Atlas networks (2017), further simplified to 2 km; neither is a complete current network. Airports include all sites in Transport Canada’s 2021 inventory of airports with air navigation services. Harbours are DFO core fishing harbours only, not a list or ranking of commercial ports. Military points are four directory bases with matching official CGNDB points; the directory contains more bases. No personnel counts.',
                'fr': 'Les routes et voies ferrées proviennent de l’Atlas de RNCan à 1:15 000 000 (2017), simplifiées à 2 km; ces réseaux ne sont ni complets ni actuels. Les aéroports comprennent les sites de l’inventaire 2021 de Transports Canada avec services de navigation aérienne. Les ports sont uniquement les ports de pêche essentiels du MPO, et non une liste ou un classement des ports commerciaux. Les points militaires représentent quatre bases du répertoire associées aux points officiels de la BDTC; le répertoire contient d’autres bases. Aucun effectif.'},
      'roads':routes['roads'], 'rail':routes['rail'], 'ports':ports, 'airports':airports, 'military':military}
    (WEB / 'infrastructure.json').write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n')
    (RAW.parent / 'infra-sources.json').write_text(json.dumps(make_sources(), ensure_ascii=False, indent=2) + '\n')
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    fetch(args.offline)
    data = build()
    print('Built infrastructure:', ', '.join(f'{k}={len(data[k])}' for k in ('roads','rail','ports','airports','military')))


if __name__ == '__main__':
    main()
