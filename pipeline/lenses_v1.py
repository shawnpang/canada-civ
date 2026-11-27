"""Additional Census Profile lenses. Run ``python -m pipeline.lenses_v1 --fetch``
then ``python -m pipeline.lenses_v1 --apply`` to refresh the shipped payload.

The Profile CD endpoint is a 25% sample, with random rounding and suppression.
Its exact request and hash are recorded in sources-lenses-v1.json.
"""
import argparse
import csv
import hashlib
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from pipeline.mvp_lenses import bilingual, domain, fraction

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data/raw/lenses_v1/DF_CD.csv'
MANIFEST = CACHE.with_name('manifest.json')
OUTPUT = ROOT / 'web/data/lenses.json'
SOURCES = ROOT / 'web/data/sources-lenses-v1.json'
IDS = ('1400', '1401', '1513', '1515', '1935', '1937', '1959',
       '1969', '1976', '2611', '2614', '2615', '2616')
URL = ('https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/'
       'STC_CP,DF_CD/A5..1.' + '+'.join(IDS) + '.1')
LENS_IDS = ('foreign_born', 'commute', 'homeownership', 'faith', 'faith_tradition', 'migration')


def read_profiles(path):
    """Preserve true zero, treating suppressed or missing observations as null."""
    profiles = {}
    with path.open(encoding='utf-8-sig', newline='') as stream:
        for row in csv.DictReader(stream):
            try:
                if row.get('FLAG') in {'1', '2', '4', '6', 'O'}:
                    raise ValueError('suppressed')
                value = float(row['OBS_VALUE'])
                if not value.is_integer() or value < 0:
                    raise ValueError('invalid count')
                value = int(value)
            except (TypeError, ValueError):
                value = None
            profiles.setdefault(row['REF_AREA'], {})[row['CHARACTERISTIC']] = value
    return profiles


def fetch():
    request = urllib.request.Request(URL, headers={'Accept': 'text/csv', 'User-Agent': 'CanadaCiv/1.0'})
    with urllib.request.urlopen(request, timeout=180) as response:
        data = response.read()
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_bytes(data)
    profiles = read_profiles(CACHE)
    if len(profiles) < 290 or not profiles.get('2021A00033520', {}).get('1513'):
        CACHE.unlink()
        raise ValueError('Incomplete Census Profile CD data')
    record = {'file': str(CACHE.relative_to(ROOT)), 'url': URL,
              'retrieved': datetime.now(timezone.utc).isoformat(),
              'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
              'request_headers': {'Accept': 'text/csv'}}
    MANIFEST.write_text(json.dumps(record, indent=2) + '\n')
    return record


def load_profiles():
    if not CACHE.exists() or not MANIFEST.exists():
        raise RuntimeError('Census v1 lens cache missing; run python -m pipeline.lenses_v1 --fetch')
    manifest = json.loads(MANIFEST.read_text())
    if manifest.get('url') != URL or manifest.get('sha256') != hashlib.sha256(CACHE.read_bytes()).hexdigest():
        raise RuntimeError('Census v1 lens cache failed provenance validation; re-fetch')
    return read_profiles(CACHE)


def _sum_counts(p, ids):
    counts = [p.get(i) for i in ids]
    return None if any(v is None for v in counts) else sum(counts)


def _religious(p):
    total, secular = p.get('1935'), p.get('1959')
    if total is None or secular is None or secular > total:
        return None
    return fraction(total - secular, total)


def build(world, profiles):
    common = bilingual(
        'Census division values colour whole hexes and do not show variation within divisions. Census 25% sample estimates are randomly rounded; missing and suppressed values remain blank.',
        'Les valeurs des divisions de recensement colorent les hexagones entiers et ne montrent pas les variations à l’intérieur des divisions. Les estimations de l’échantillon de 25 % sont arrondies aléatoirement; les valeurs manquantes ou supprimées restent vides.')
    specs = [
        ('foreign_born', 'Immigrant share', 'Part des immigrants',
         'Share of people in private households who are immigrants (landed immigrants or permanent residents). This is immigrant status, not birthplace: it excludes non-permanent residents and people born abroad who are Canadian citizens by birth.',
         'Part des personnes en ménage privé qui sont immigrantes (immigrants reçus ou résidents permanents). Il s’agit du statut d’immigrant, et non du lieu de naissance : les résidents non permanents et les citoyens canadiens de naissance nés à l’étranger sont exclus.',
         lambda p: fraction(p.get('1515'), p.get('1513'))),
        ('commute', 'Commute of 30 minutes or more', 'Trajet de 30 minutes ou plus',
         'Share of employed commuters aged 15 and over with a usual or no fixed workplace who travel at least 30 minutes to work. Workers at home are excluded; commuting in May 2021 was affected by the pandemic.',
         'Part des travailleurs de 15 ans et plus ayant un lieu de travail habituel ou sans lieu de travail fixe dont le trajet dure au moins 30 minutes. Les personnes travaillant à domicile sont exclues; la pandémie a influencé les déplacements en mai 2021.',
         lambda p: fraction(_sum_counts(p, ('2614', '2615', '2616')), p.get('2611'))),
        ('homeownership', 'Homeownership', 'Propriété du logement',
         'Share of private households that own their dwelling.',
         'Part des ménages privés propriétaires de leur logement.',
         lambda p: fraction(p.get('1401'), p.get('1400'))),
        ('faith', 'Religious affiliation', 'Appartenance religieuse',
         'Share of people in private households reporting a religion or spiritual tradition, calculated as the complement of no religion and secular perspectives. Religion is self-reported and is not a measure of observance.',
         'Part des personnes en ménage privé déclarant une religion ou une tradition spirituelle, calculée comme le complément de « aucune religion et perspectives laïques ». La religion est autodéclarée et ne mesure pas la pratique.', _religious),
        ('faith_tradition', 'Christian affiliation', 'Appartenance chrétienne',
         'Share of people in private households reporting a Christian affiliation, including Christian-related traditions. Religion is self-reported and is not a measure of observance.',
         'Part des personnes en ménage privé déclarant une appartenance chrétienne, y compris les traditions apparentées. La religion est autodéclarée et ne mesure pas la pratique.',
         lambda p: fraction(p.get('1937'), p.get('1935'))),
        ('migration', 'Interprovincial arrivals', 'Arrivées interprovinciales',
         'Share of people aged 5 and over in private households who lived in another province or territory five years earlier. Counts arrivals at destination, not net migration; excludes people who left.',
         'Part des personnes de 5 ans et plus en ménage privé qui habitaient une autre province ou un autre territoire cinq ans auparavant. Il s’agit des arrivées à destination, et non de la migration nette; les départs sont exclus.',
         lambda p: fraction(p.get('1976'), p.get('1969'))),
    ]
    out = []
    for ident, en, fr, desc_en, desc_fr, measure in specs:
        values = []
        for i, owner in enumerate(world['owner']):
            cd = world['division'][i]
            p = profiles.get('2021A0003' + world['divisions'][cd]['cduid'], {}) if owner >= 0 and world['water'][i] == 0 and 0 <= cd < len(world['divisions']) else {}
            values.append(measure(p))
        out.append({'id': ident, 'group': 'people', 'name': bilingual(en, fr),
                    'description': bilingual(desc_en, desc_fr), 'note': common,
                    'vintage': '2021 Census', 'unit': bilingual('share', 'part'),
                    'format': 'pct', 'scale': 'linear', 'domain': domain(values),
                    'ramp': ['#1b2838', '#e6c35c'], 'higher_is': 'neutral',
                    'source': 'statcan_census_2021_profile', 'values': values})
    return out


def apply():
    world = json.loads((ROOT / 'web/data/world.json').read_text())
    payload = json.loads(OUTPUT.read_text())
    payload['lenses'] = [l for l in payload['lenses'] if l['id'] not in LENS_IDS] + build(world, load_profiles())
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n')
    record = json.loads(MANIFEST.read_text())
    source = {'id': 'statcan_census_2021_profile', 'title': '2021 Census Profile, census divisions',
              'product_id': '98-401-X2021006; SDMX DF_CD 1.3', 'publisher': 'Statistics Canada',
              'homepage': 'https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/index.cfm?Lang=E',
              'license': 'Statistics Canada Open Licence; https://www.statcan.gc.ca/en/reference/licence',
              'vintage': '2021 Census', 'characteristic_ids': list(IDS),
              'used_for': ', '.join(LENS_IDS), 'files': [record]}
    existing = json.loads(SOURCES.read_text()) if SOURCES.exists() else []
    if not isinstance(existing, list):
        raise ValueError('sources-lenses-v1.json must be a list')
    existing = [item for item in existing if item.get('id') != source['id']] + [source]
    SOURCES.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch', action='store_true')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not (args.fetch or args.apply):
        parser.error('choose --fetch and/or --apply')
    if args.fetch:
        fetch()
    if args.apply:
        apply()


if __name__ == '__main__':
    main()
