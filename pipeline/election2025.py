"""Build the 2025 election lens from Elections Canada's official downloads.

Run `uv run python -m pipeline.election2025` (or `--offline` for a verified
cache). Riding areas are clipped against each land hex; without a strict majority
of the intersected official riding area, the hex is null. Source geometry is NAD83 / Statistics Canada Lambert.
"""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import math
from pathlib import Path
import struct
import urllib.request
import zipfile

from pipeline.core.hexgrid import HexGrid
from pipeline.infra import dbf

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/election2025'
WEB = ROOT / 'web/data'
FILES = {
    'results.csv': 'https://www.elections.ca/res/rep/off/ovrGE45/62/data_donnees/table_tableau11.csv',
    'boundaries.zip': 'https://www.elections.ca/res/cir/mapsCorner/vector/FederalElectoralDistricts_2025_SHP.zip',
}
PARTIES = [
    {'value': 'liberal', 'name': {'en': 'Liberal', 'fr': 'Libéral'}, 'color': '#d63836'},
    {'value': 'conservative', 'name': {'en': 'Conservative', 'fr': 'Conservateur'}, 'color': '#3372b6'},
    {'value': 'bloc', 'name': {'en': 'Bloc Québécois', 'fr': 'Bloc Québécois'}, 'color': '#55adca'},
    {'value': 'ndp', 'name': {'en': 'NDP-New Democratic Party', 'fr': 'NPD-Nouveau Parti démocratique'}, 'color': '#e88d35'},
    {'value': 'green', 'name': {'en': 'Green Party', 'fr': 'Parti Vert'}, 'color': '#4c9657'},
]


def fetch(offline=False):
    RAW.mkdir(parents=True, exist_ok=True)
    manifest_path = RAW / 'manifest.json'
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    old_files = {entry['file']: entry for entry in old.get('files', [])}
    entries = []
    for name, url in FILES.items():
        path = RAW / name
        relative = str(path.relative_to(ROOT))
        previous = old_files.get(relative)
        if (previous and previous.get('url') == url and path.exists() and
                hashlib.sha256(path.read_bytes()).hexdigest() == previous.get('sha256')):
            entries.append(previous)
            continue
        if offline:
            raise RuntimeError(f'offline cache missing or unverified: {relative}')
        request = urllib.request.Request(url, headers={'User-Agent': 'CanadaCiv/1.0 (public data atlas)'})
        with urllib.request.urlopen(request, timeout=180) as response:
            data = response.read()
        if name.endswith('.zip'):
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if archive.testzip():
                    raise ValueError('corrupt electoral boundary archive')
        else:
            read_results(data)
        path.write_bytes(data)
        entries.append({'file': relative, 'url': url, 'sha256': hashlib.sha256(data).hexdigest(),
                        'bytes': len(data), 'retrieved': datetime.now(timezone.utc).isoformat()})
    manifest = {'id': 'elections_canada_2025', 'files': entries}
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


def read_results(data):
    """Read elected candidate affiliation, not a guess from name or vote totals."""
    rows = csv.DictReader(io.StringIO(data.decode('utf-8-sig')))
    result = {}
    for row in rows:
        rid = row['Electoral District Number/Numéro de circonscription'].strip()
        candidate = row['Elected Candidate/Candidat élu']
        matches = [p for p in PARTIES if candidate.endswith(' ' + p['name']['en'] + '/' + p['name']['fr'])]
        # Unknown or missing affiliation is deliberately left blank.
        result[rid] = {'name': row['Electoral District Name/Nom de circonscription'],
                       'party': matches[0]['value'] if len(matches) == 1 else None}
    if len(result) != 343:
        raise ValueError(f'expected 343 unique electoral districts, got {len(result)}')
    return result


def polygons(data):
    """Read the polygon rings in a shapefile, retaining ring orientation."""
    offset = 100
    while offset < len(data):
        _, words = struct.unpack_from('>ii', data, offset)
        record = data[offset + 8:offset + 8 + words * 2]
        kind = struct.unpack_from('<i', record)[0]
        if kind != 5:
            raise ValueError(f'expected polygon shape, got {kind}')
        count_parts, count_points = struct.unpack_from('<2i', record, 36)
        indexes = list(struct.unpack_from(f'<{count_parts}i', record, 44)) + [count_points]
        start = 44 + 4 * count_parts
        points = [struct.unpack_from('<2d', record, start + i * 16) for i in range(count_points)]
        yield [points[indexes[i]:indexes[i + 1]] for i in range(count_parts)]
        offset += 8 + words * 2


def clip(subject, a, b):
    """Clip a ring against the left side of one directed line."""
    if not subject:
        return []
    dx, dy = b[0] - a[0], b[1] - a[1]
    def distance(p):
        return dx * (p[1] - a[1]) - dy * (p[0] - a[0])
    out = []
    prev = subject[-1]
    dp = distance(prev)
    for cur in subject:
        dc = distance(cur)
        if (dp >= 0) != (dc >= 0):
            t = dp / (dp - dc)
            out.append((prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])))
        if dc >= 0:
            out.append(cur)
        prev, dp = cur, dc
    return out


def signed_area(ring):
    if len(ring) < 3:
        return 0.0
    x0, y0 = ring[0]
    return sum((ring[i][0] - x0) * (ring[i + 1][1] - y0) -
               (ring[i + 1][0] - x0) * (ring[i][1] - y0)
               for i in range(1, len(ring) - 1)) / 2


def hexagon(x, y, radius):
    return [(x + radius * math.cos(math.radians(60 * i - 90)),
             y + radius * math.sin(math.radians(60 * i - 90))) for i in range(6)]


def assign(world, features, results):
    """Strict majority of overlapping official riding area; otherwise null.

    Shapefile ring orientation subtracts holes. Land ownership comes from the
    atlas, and is independent of the election geometry. A hex may include water;
    overlap is measured against the entire official electoral polygon.
    """
    grid = HexGrid(**{k: world['grid'][k] for k in ('cols', 'rows', 'radius')})
    projection = world['projection']
    water = world.get('water')
    area_by_cell = [{} for _ in world['owner']]
    r = grid.radius
    for rid, rings in features:
        if rid not in results:
            continue
        for source_ring in rings:
            ring = [((x - projection['min_x']) / 1000, (projection['max_y'] - y) / 1000)
                    for x, y in source_ring]
            if len(ring) < 4:
                continue
            min_y = min(p[1] for p in ring)
            max_y = max(p[1] for p in ring)
            first = max(0, math.ceil((min_y - r) / (1.5 * r)))
            last = min(grid.rows - 1, math.floor((max_y + r) / (1.5 * r)))
            for row in range(first, last + 1):
                cy = 1.5 * r * row
                # First clip once to a row strip; this makes large coastal rings
                # inexpensive to clip to individual cells in that strip.
                strip = clip(ring, (0, cy - r), (1, cy - r))
                strip = clip(strip, (1, cy + r), (0, cy + r))
                if not strip:
                    continue
                min_x = min(p[0] for p in strip)
                max_x = max(p[0] for p in strip)
                width = math.sqrt(3) * r
                shift = 0.5 * (row & 1)
                c0 = max(0, math.ceil((min_x - width / 2) / width - shift))
                c1 = min(grid.cols - 1, math.floor((max_x + width / 2) / width - shift))
                for col in range(c0, c1 + 1):
                    cell = row * grid.cols + col
                    if world['owner'][cell] < 0 or (water is not None and water[cell] != 0):
                        continue
                    x, y = grid.center(col, row)
                    corners = hexagon(x, y, r)
                    fragment = strip
                    for i in range(6):
                        fragment = clip(fragment, corners[i], corners[(i + 1) % 6])
                        if not fragment:
                            break
                    if fragment:
                        value = signed_area(fragment)
                        areas = area_by_cell[cell]
                        areas[rid] = areas.get(rid, 0.0) + value
    ids, values = [], []
    for areas in area_by_cell:
        # Exterior rings share a sign, and holes have the opposite sign. In map
        # coordinates the ESRI exterior sign is positive after y inversion.
        ranked = sorted(((area, rid) for rid, area in areas.items() if area > 1e-7), reverse=True)
        if not ranked or ranked[0][0] <= sum(area for area, _ in ranked) / 2 + 1e-7:
            ids.append(None)
            values.append(None)
        else:
            rid = ranked[0][1]
            ids.append(rid)
            values.append(results[rid]['party'])
    return ids, values


def build(world, results, features):
    ids, values = assign(world, features, results)
    lens = {'id': 'election2025', 'group': 'people', 'type': 'categorical',
            'name': {'en': 'Federal election 2025', 'fr': 'Élection fédérale de 2025'},
            'unit': {'en': 'elected candidate’s party', 'fr': 'parti du candidat élu'},
            'source': 'elections_canada_2025', 'vintage': '2025-04-28',
            'description': {'en': 'Party of the elected candidate in the 45th general election.',
                            'fr': 'Parti du candidat élu à la 45e élection générale.'},
            'note': {'en': 'Each land hex takes a riding only when it covers more than half of the total area of the hex overlapped by official riding polygons. Hexes are schematic; riding polygons can include water. No majority, missing results and unassigned hexes are blank, not zero. Colours are a display key, not an Elections Canada standard.',
                     'fr': 'Chaque hexagone terrestre prend une circonscription seulement si celle-ci couvre plus de la moitié de la superficie totale de chevauchement des polygones électoraux officiels avec l’hexagone. Les hexagones sont schématiques; les polygones électoraux peuvent comprendre de l’eau. Les cas sans majorité, les résultats manquants et les hexagones non attribués restent vides, et non à zéro. Les couleurs servent de légende et ne constituent pas une norme d’Élections Canada.'},
            'categories': PARTIES, 'values': values}
    return {'vintage': '2025-04-28', 'assignment': 'strict majority of total area overlapped by official electoral district polygons, including water; no majority and missing results are null',
            'ridings': results, 'riding_ids': ids, 'lens': lens}


def generate(world, offline=True):
    """Produce payload and source record from hash-verified official files."""
    manifest = fetch(offline)
    results = read_results((RAW / 'results.csv').read_bytes())
    with zipfile.ZipFile(RAW / 'boundaries.zip') as archive:
        rows = dbf(archive.read('SHP/FED_CA_2025_EN.dbf'))
        shapes = list(polygons(archive.read('SHP/FED_CA_2025_EN.shp')))
    features = [(row['FED_NUM'], rings) for row, rings in zip(rows, shapes)]
    if len(rows) != len(shapes) or {rid for rid, _ in features} != set(results):
        raise ValueError('official results and geometries have different riding codes')
    payload = build(world, results, features)
    source = {'id': 'elections_canada_2025', 'title': '45th General Election: Official Voting Results, Table 11; Electoral Geography Boundary Files (45th General Election), Federal Electoral Districts SHP',
              'publisher': 'Elections Canada', 'product_id': 'OVR GE45 Table 11; Federal Electoral Districts 2025 SHP', 'vintage': '2025-04-28',
              'homepage': 'https://www.elections.ca/content.aspx?dir=rep/off/45gedata&document=summary&lang=e&section=res',
              'description': 'Official electoral district results and 2025 federal electoral district boundaries.',
              'used_for': 'Federal election 2025 lens',
              'license': 'Elections Canada terms: non-commercial reproduction permitted with attribution; commercial redistribution requires permission. https://www.elections.ca/content.aspx?document=index&lang=e&section=pri',
              'files': manifest['files']}
    return payload, source


def merge(world, lenses, sources):
    """Rebuild and merge the lens and provenance into atlas catalogues."""
    payload, source = generate(world)
    (WEB / 'election2025.json').write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n')
    (WEB / 'sources-election2025.json').write_text(json.dumps([source], ensure_ascii=False, indent=2) + '\n')
    merged_lenses = dict(lenses)
    merged_lenses['lenses'] = [row for row in lenses['lenses'] if row.get('id') != 'election2025'] + [payload['lens']]
    merged_sources = [row for row in sources if row.get('id') != source['id']] + [source]
    return merged_lenses, merged_sources


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    fetch(args.offline)
    world = json.loads((WEB / 'world.json').read_text())
    merge(world, {'lenses': []}, [])
    payload = json.loads((WEB / 'election2025.json').read_text())
    print('Assigned', sum(v is not None for v in payload['lens']['values']), 'of', sum(o >= 0 for o in world['owner']), 'land hexes')


if __name__ == '__main__':
    main()
