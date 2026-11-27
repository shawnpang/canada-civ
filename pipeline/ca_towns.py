"""Build 2021 census agglomeration towns from Statistics Canada data.

Download the inputs (hashes in web/data/sources-towns.json), then build::

    mkdir -p data/raw/ca_towns
    curl -L -o data/raw/ca_towns/census.zip https://www150.statcan.gc.ca/n1/tbl/csv/98100005-eng.zip
    curl -L -o data/raw/ca_towns/census-fr.zip https://www150.statcan.gc.ca/n1/tbl/csv/98100005-fra.zip
    curl -L -o data/raw/ca_towns/estimate.zip https://www150.statcan.gc.ca/n1/tbl/csv/17100148-eng.zip

    uv run python -m pipeline.ca_towns --census-en data/raw/ca_towns/census.zip \
      --census-fr data/raw/ca_towns/census-fr.zip --estimates data/raw/ca_towns/estimate.zip

The included compact CSV is an extract of the disclosed GeoSuite CSD mirror;
the builder requires only Python's standard library.
"""
import argparse
import csv
import hashlib
import io
import json
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

from pipeline.core.geo import MapProjection, project
from pipeline.core.hexgrid import HexGrid

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'web' / 'data'
CUTOFF = 10_000
CAPITALS = {'990', '995'}
TERRITORIES = {'60', '61', '62'}
ABBR = dict(zip(('10','11','12','13','24','35','46','47','48','59','60','61','62'),
                ('NL','PE','NS','NB','QC','ON','MB','SK','AB','BC','YT','NT','NU')))


def select_population(census, estimate):
    if estimate is not None:
        return estimate, '2025'
    if census is not None:
        return census, '2021'
    return None, None


def include_town(uid, pruid, population):
    return uid not in CAPITALS and (pruid in TERRITORIES or (population is not None and population >= CUTOFF))


def read_table(path, member, delimiter=","):
    with ZipFile(path) as z, z.open(member) as raw:
        yield from csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig', newline=''), delimiter=delimiter)


def number(value):
    return int(value) if value and value.isdigit() else None


def validate_inputs(census_en, census_fr, estimates, csd):
    """Refuse to publish figures with provenance for different source files."""
    sources = {s['id']: s for s in json.loads(
        (DATA / 'sources-towns.json').read_text(encoding='utf-8'))['sources']}
    checks = [
        (census_en, sources['statcan_census_ca']['files'][0]['sha256']),
        (census_fr, sources['statcan_census_ca']['files'][1]['sha256']),
        (estimates, sources['statcan_ade_ca']['sha256']),
        (csd, sources['statcan_geosuite_csd']['extract_sha256']),
    ]
    for path, expected in checks:
        digest = hashlib.sha256()
        with open(path, 'rb') as file:
            for block in iter(lambda: file.read(1024 * 1024), b''):
                digest.update(block)
        if digest.hexdigest() != expected:
            raise ValueError(f'Source hash mismatch: {path}. Update provenance before rebuilding.')


def build(census_en, census_fr, estimates, csd):
    validate_inputs(census_en, census_fr, estimates, csd)
    censuses = {}
    for lang, file in [('en', census_en), ('fr', census_fr)]:
        for row in read_table(file, '98100005.csv', ';' if lang == 'fr' else ','):
            dguid = row['DGUID']
            if not dguid.startswith('2021S0504'):
                continue
            uid = dguid[-3:]
            obj = censuses.setdefault(uid, {'names': {}, 'population': None})
            obj['names'][lang] = row['GÉO' if lang == 'fr' else 'GEO']
            if lang == 'en':
                key = next(k for k in row if k.startswith('Population and dwelling counts') and 'Population, 2021' in k)
                obj['population'] = number(row[key])
    annual = {}
    for row in read_table(estimates, '17100148.csv'):
        if (row['REF_DATE'] == '2025' and row['DGUID'].startswith('2021S0504')
                and row['Gender'] == 'Total - gender' and row['Age group'] == 'All ages'):
            annual[row['DGUID'][-3:]] = number(row['VALUE'])
    members = defaultdict(list)
    with open(csd, encoding='utf-8-sig', newline='') as f:
        for row in csv.DictReader(f):
            if row['CMAUID'] in censuses:
                members[row['CMAUID']].append(row)
    world = json.loads((DATA / 'world.json').read_text(encoding='utf-8'))
    grid = HexGrid(**world['grid'])
    projection = MapProjection(world['projection']['min_x'], world['projection']['max_y'])
    land = defaultdict(list)
    for i, owner in enumerate(world['owner']):
        if owner >= 0:
            land[world['provinces'][owner]['pruid']].append((i, *grid.center(i % grid.cols, i // grid.cols)))
    towns = []
    for uid, info in censuses.items():
        rows = members[uid]
        if not rows:
            raise ValueError(f'GeoSuite lacks CSD members for CA {uid}')
        # The most populous member CSD is a published, reproducible anchor, not a CA centroid.
        # Break equal populations by official CSD UID for stable output.
        available = [r for r in rows if r['CSDRPLAT'] and r['CSDRPLONG']]
        if not available:
            raise ValueError(f'GeoSuite lacks coordinates for CA {uid}')
        anchor = min(available, key=lambda r: (-(number(r['CSDPOP2021']) or 0), r['CSDUID']))
        pruid = anchor['PRUID']
        population, vintage = select_population(info['population'], annual.get(uid))
        if not include_town(uid, pruid, population):
            continue
        lon, lat = float(anchor['CSDRPLONG']), float(anchor['CSDRPLAT'])
        x, y = projection.to_map(*project(lon, lat))
        cell = min(land[pruid], key=lambda p: (p[1]-x)**2 + (p[2]-y)**2)[0]
        towns.append({'id': uid, 'kind': 'ca', 'name': info['names'],
                      'provinces': [ABBR[pr] for pr in sorted({r['PRUID'] for r in rows})],
                      'x': round(x, 3), 'y': round(y, 3), 'cell': cell,
                      'anchor': {'csduid': anchor['CSDUID'], 'name': anchor['CSDNAME'],
                                 'latitude': lat, 'longitude': lon},
                      'population': population, 'population_vintage': vintage,
                      'population_source': ('statcan_ade_ca' if vintage == '2025' else
                                            'statcan_census_ca' if vintage == '2021' else None),
                      'pop_series': {'2021': info['population'], '2025': annual.get(uid)}})
    towns.sort(key=lambda t: (-(t['population'] if t['population'] is not None else -1), t['id']))
    return {'version': 1,
            'selection': {'cutoff': CUTOFF,
                'en': '2021 census agglomerations with at least 10,000 residents in the July 1, 2025 estimate, or the 2021 Census count if unavailable; all territorial CAs are included. Whitehorse (990) and Yellowknife (995) already appear as capitals in cities.json and are not duplicated.',
                'fr': 'Agglomérations de recensement de 2021 comptant au moins 10 000 habitants selon les estimations du 1er juillet 2025, ou selon le Recensement de 2021 si elles ne sont pas disponibles; toutes les agglomérations territoriales sont incluses. Whitehorse (990) et Yellowknife (995) figurent déjà parmi les capitales dans cities.json et ne sont pas dupliquées.'},
            'coordinate_method': {
                'en': 'The 2021 GeoSuite representative point of the most populous 2021 member census subdivision anchors each CA; it is not a CA centroid. The map cell is the nearest land hex in that subdivision’s province or territory.',
                'fr': 'Le point représentatif GéoSuite 2021 de la subdivision de recensement membre la plus peuplée en 2021 sert de repère à chaque agglomération; ce point ne représente pas son centroïde. La cellule est l’hexagone terrestre le plus proche dans la province ou le territoire de cette subdivision.'},
            'sources': json.loads((DATA / 'sources-towns.json').read_text(encoding='utf-8'))['sources'],
            'towns': towns}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--census-en', required=True)
    p.add_argument('--census-fr', required=True)
    p.add_argument('--estimates', required=True)
    p.add_argument('--csd', default=str(ROOT / 'pipeline' / 'ca_towns_geosuite.csv'))
    args = p.parse_args()
    data = build(args.census_en, args.census_fr, args.estimates, args.csd)
    (DATA / 'towns.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Wrote {len(data['towns'])} towns")


if __name__ == '__main__':
    main()
