"""Build a standalone Canadian Disaster Database point-marker lens.

Run: uv run python -m pipeline.disasters --input data/raw/cdd/cdd-extract-1.xlsx --retrieved YYYY-MM-DD
The XLSX is the Open Government Portal's CDD_Extract_2022_EN resource. Only
point geometries are mapped; polygons are excluded pending a documented
spatial intersection method.
"""
import argparse
from collections import Counter, defaultdict
from datetime import date
import hashlib
import json
import math
from pathlib import Path
import re
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from pipeline.core.geo import MapProjection, project
from pipeline.core.hexgrid import HexGrid

ROOT = Path(__file__).resolve().parent.parent
URL = 'https://open.canada.ca/data/dataset/1c3d15f9-9cfa-4010-8462-0d67e493d9b9/resource/c701e05e-4554-4c96-b7c9-0ec4a845fe91/download/cdd-extract-1.xlsx'
HOME = 'https://open.canada.ca/data/en/dataset/1c3d15f9-9cfa-4010-8462-0d67e493d9b9'
LICENSE = 'https://open.canada.ca/en/open-government-licence-canada'
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
POINT = re.compile(r'^POINT\s*\(\s*([-+\d.eE]+)\s+([-+\d.eE]+)\s*\)$', re.I)


def read_records(path):
    """Read EVENT_ID and GEOG_OBJ from the publisher's XLSX with stdlib only."""
    with ZipFile(path) as book:
        strings_root = ET.fromstring(book.read('xl/sharedStrings.xml'))
        strings = [''.join(node.itertext()) for node in strings_root]
        sheet = ET.fromstring(book.read('xl/worksheets/sheet1.xml'))
        rows = []
        for row in sheet.findall('.//s:sheetData/s:row', NS):
            cells = {}
            for cell in row.findall('s:c', NS):
                column = re.match(r'[A-Z]+', cell.get('r', ''))
                value = cell.find('s:v', NS)
                if column is None or value is None or value.text is None:
                    continue
                text = value.text
                if cell.get('t') == 's':
                    text = strings[int(text)]
                cells[column.group()] = text
            rows.append(cells)
    if not rows or rows[0].get('A') != 'EVENT_ID' or rows[0].get('X') != 'GEOG_OBJ':
        raise ValueError('Unexpected CDD workbook columns; refusing to interpret the extract')
    return [{'id': row.get('A'), 'geometry': row.get('X')} for row in rows[1:]]


def marker_cell(geometry, world):
    """Return (cell, reason), assigning only exact WKT points to Canadian land."""
    if not geometry or geometry.strip().upper() in ('NULL', 'EMPTY'):
        return None, 'missing_geometry'
    match = POINT.fullmatch(geometry.strip())
    if not match:
        return None, 'non_point_geometry'
    try:
        lon, lat = map(float, match.groups())
    except ValueError:
        return None, 'invalid_point'
    if not (math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 < lat < 90):
        return None, 'invalid_point'
    grid = HexGrid(**world['grid'])
    proj = world['projection']
    x, y = MapProjection(proj['min_x'], proj['max_y']).to_map(*project(lon, lat))
    col, row = grid.cell(x, y)
    if not (0 <= col < grid.cols and 0 <= row < grid.rows):
        return None, 'outside_grid'
    index = row * grid.cols + col
    if world['owner'][index] < 0 or world['water'][index] != 0:
        return None, 'not_canadian_land'
    return index, 'mapped'


def build(world, records):
    size = world['grid']['cols'] * world['grid']['rows']
    if len(world['owner']) != size or len(world['water']) != size:
        raise ValueError('World ownership and water arrays must match grid')
    events = defaultdict(set)
    reasons = Counter()
    for record in records:
        event_id = str(record.get('id') or '').strip()
        if not event_id or event_id.upper() == 'NULL':
            reasons['missing_id'] += 1
            continue
        cell, reason = marker_cell(record.get('geometry'), world)
        reasons[reason] += 1
        if cell is not None:
            events[cell].add(event_id)
    values = [None] * size
    for cell, ids in events.items():
        values[cell] = len(ids)
    domain = [0, max((v for v in values if v is not None), default=1)]
    lens = {
        'id': 'disasters', 'group': 'land',
        'name': {'en': 'Recorded disaster markers', 'fr': 'Repères de catastrophes recensées'},
        'unit': {'en': 'distinct recorded events', 'fr': 'événements distincts recensés'},
        'format': 'int', 'scale': 'linear', 'domain': domain,
        'ramp': ['#f4d88a', '#a52d2d'], 'higher_is': 'neutral', 'source': 'cdd',
        'vintage': {'en': 'CDD_Extract_2022_EN; resource updated 2026-02-10', 'fr': 'CDD_Extract_2022_EN; ressource mise à jour le 2026-02-10'},
        'description': {'en': 'Distinct Canadian Disaster Database event IDs whose supplied point markers fall in each Canadian land hex. Blank means no mappable point is shown, not zero events.', 'fr': 'Identifiants distincts de la Base de données canadienne sur les catastrophes dont les repères ponctuels fournis se trouvent dans chaque hexagone terrestre canadien. Une case vide indique qu’aucun point cartographiable n’est affiché, et non l’absence d’événements.'},
        'note': {'en': 'Only supplied POINT geometries are counted; polygons, missing or invalid locations, and points outside Canadian land are omitted. A marker is not the affected area. The database is selective, incomplete and based on outside sources that may be inaccurate; counts are not all disasters or a risk measure. Third-party material may have additional restrictions.', 'fr': 'Seules les géométries POINT fournies sont comptées; les polygones, les lieux manquants ou invalides et les points hors des terres canadiennes sont exclus. Un repère ne représente pas la zone touchée. La base est sélective et incomplète et repose sur des sources externes qui peuvent être inexactes; les nombres ne représentent ni toutes les catastrophes ni une mesure du risque. Des documents de tiers peuvent être soumis à des restrictions supplémentaires.'},
        'values': values,
    }
    return {'version': 1, 'sources': ['cdd'], 'lens': lens,
            'summary': {'input_rows': len(records), 'rows_by_result': dict(sorted(reasons.items())),
                        'cells_with_markers': len(events), 'mapped_distinct_event_ids': len(set().union(*events.values())) if events else 0}}


def source_record(path, retrieved):
    data = path.read_bytes()
    return {'id': 'cdd', 'title': 'Canadian Disaster Database — CDD_Extract_2022_EN',
            'publisher': 'Public Safety Canada', 'product_id': '1c3d15f9-9cfa-4010-8462-0d67e493d9b9',
            'vintage': 'CDD_Extract_2022_EN; resource updated 2026-02-10',
            'license': 'Open Government Licence – Canada', 'license_url': LICENSE,
            'homepage': HOME, 'used_for': 'Distinct CDD event point markers assigned to Canadian land hexes',
            'files': [{'file': 'cdd-extract-1.xlsx', 'url': URL,
                       'retrieved': retrieved,
                       'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--retrieved', required=True, type=date.fromisoformat, help='Actual retrieval date (YYYY-MM-DD); do not use a file modification date')
    args = parser.parse_args()
    world = json.loads((ROOT / 'web/data/world.json').read_text())
    result = build(world, read_records(args.input))
    (ROOT / 'web/data/disasters.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    (ROOT / 'web/data/sources-disasters.json').write_text(json.dumps([source_record(args.input, args.retrieved.isoformat())], ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result['summary'], ensure_ascii=False))


if __name__ == '__main__':
    main()
