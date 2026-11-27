"""Build lazy citizen rows from Statistics Canada's 2021 Census Profile SDMX service.

Run `python -m pipeline.citizens` to fetch and rebuild, or pass --cache DIR
and --offline to rebuild from previously fetched cma.csv and iqaluit.csv.
Only standard-library modules are required.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ID = 'statcan_census_2021_profile'


def label(en, fr):
    return {'en': en, 'fr': fr}


def category(id, characteristic, en, fr):
    return {'id': id, 'characteristic': str(characteristic), 'label': label(en, fr)}


THEMES = [
    {'id': 'occupation', 'label': label('Occupation', 'Profession'), 'total_characteristic': '2248',
     'universe': label('Labour force aged 15 and over with an applicable occupation; NOC 2021; 25% sample.', 'Population active de 15 ans et plus ayant une profession applicable; CNP 2021; échantillon de 25 %.'),
     'categories': [category('management',2249,'Legislative and senior management','Corps législatifs et cadres supérieurs'), category('business',2250,'Business, finance and administration','Affaires, finance et administration'), category('science',2251,'Natural and applied sciences and related occupations','Sciences naturelles et appliquées et domaines apparentés'), category('health',2252,'Health','Santé'), category('education_law',2253,'Education, law and social, community and government services','Enseignement, droit et services sociaux, communautaires et gouvernementaux'), category('arts',2254,'Art, culture, recreation and sport','Arts, culture, sports et loisirs'), category('sales',2255,'Sales and service','Vente et services'), category('trades',2256,'Trades, transport, equipment operators and related occupations','Métiers, transport, machinerie et domaines apparentés'), category('resources',2257,'Natural resources, agriculture and related production','Ressources naturelles, agriculture et production connexe'), category('manufacturing',2258,'Manufacturing and utilities','Fabrication et services d’utilité publique')]},
    {'id': 'age', 'label': label('Age', 'Âge'), 'total_characteristic': '8',
     'universe': label('Total population; 100% data.', 'Population totale; données intégrales.'),
     'categories': [category('0_14',9,'0–14 years','0 à 14 ans'), category('15_64',13,'15–64 years','15 à 64 ans'), category('65_plus',24,'65 years and over','65 ans et plus')]},
    {'id': 'commute', 'label': label('Main commute mode', 'Principal mode de navette'), 'total_characteristic': '2603',
     'universe': label('Employed labour force aged 15 and over with a usual workplace or no fixed workplace; excludes work at home; 25% sample.', 'Population active occupée de 15 ans et plus ayant un lieu habituel de travail ou sans adresse de travail fixe; exclut le travail à domicile; échantillon de 25 %.'),
     'categories': [category('car',2604,'Car, truck or van','Automobile, camion ou fourgonnette'), category('transit',2607,'Public transit','Transport en commun'), category('walk',2608,'Walked','À pied'), category('bicycle',2609,'Bicycle','Bicyclette'), category('other',2610,'Other method','Autre moyen')]},
    {'id': 'education', 'label': label('Highest education', 'Plus haut niveau de scolarité'), 'total_characteristic': '1998',
     'universe': label('Population aged 15 and over in private households; 25% sample.', 'Population de 15 ans et plus dans les ménages privés; échantillon de 25 %.'),
     'categories': [category('none',1999,'No certificate, diploma or degree','Aucun certificat, diplôme ou grade'), category('secondary',2000,'Secondary school diploma or equivalent','Diplôme d’études secondaires ou équivalent'), category('below_bachelor',2002,'Postsecondary below bachelor level','Études postsecondaires inférieures au baccalauréat'), category('bachelor_plus',2008,'Bachelor’s degree or higher','Baccalauréat ou grade supérieur')]},
    {'id': 'origin', 'label': label('Immigrant status', 'Statut d’immigrant'), 'total_characteristic': '1513',
     'universe': label('Population in private households; immigrant status, not ethnicity; 25% sample.', 'Population dans les ménages privés; statut d’immigrant, et non origine ethnique; échantillon de 25 %.'),
     'categories': [category('non_immigrant',1514,'Non-immigrants','Non-immigrants'), category('immigrant',1515,'Immigrants','Immigrants'), category('non_permanent',1523,'Non-permanent residents','Résidents non permanents')]},
]

# Profile characteristic publication dates as returned by the SDMX service.
for theme in THEMES:
    theme['release_date'] = ('2022-04-27' if theme['id'] == 'age' else
                             '2022-10-26' if theme['id'] == 'origin' else '2022-11-30')

CHARACTERISTICS = sorted({t['total_characteristic'] for t in THEMES} | {c['characteristic'] for t in THEMES for c in t['categories']}, key=int)
BASE = 'https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,'
URLS = {
    'cma.csv': BASE + 'DF_CMACA/A5..1.' + '+'.join(CHARACTERISTICS) + '.1',
    'iqaluit.csv': BASE + 'DF_CSD/A5.2021A00056204003.1.' + '+'.join(CHARACTERISTICS) + '.1',
}


def parse_count(value, flag=''):
    """Return a reported nonnegative whole count; never coerce missing to zero."""
    value = str('' if value is None else value).strip()
    if str(flag or '').strip() or not value.isascii() or not value.isdigit():
        return None
    return int(value)


def largest_remainder(values, icons=20):
    """Allocate exactly icons symbols to complete, positive counts, by ordered ties."""
    if not values or any(v is None or not isinstance(v, int) or v < 0 for v in values) or sum(values) == 0:
        return [None] * len(values)
    if not isinstance(icons, int) or icons < 0:
        raise ValueError('icons must be a nonnegative integer')
    denominator = sum(values)
    floors = [v * icons // denominator for v in values]
    remaining = icons - sum(floors)
    order = sorted(range(len(values)), key=lambda i: (-(values[i] * icons % denominator), i))
    for i in order[:remaining]:
        floors[i] += 1
    return floors


def build_theme(counts, categories, total):
    values = [counts.get(c['characteristic']) for c in categories]
    total_value = counts.get(total)
    figures = largest_remainder(values) if total_value is not None and total_value > 0 else [None] * len(values)
    return {'total': total_value, 'values': [{'id': c['id'], 'count': v, 'icons': n} for c, v, n in zip(categories, values, figures)]}


def read_profiles(paths):
    profiles = {}
    for path in paths:
        with path.open(encoding='utf-8-sig', newline='') as f:
            for row in csv.DictReader(f):
                geo = row['REF_AREA']
                characteristic = row['CHARACTERISTIC']
                if characteristic not in CHARACTERISTICS:
                    continue
                counts = profiles.setdefault(geo, {})
                if characteristic in counts:
                    raise ValueError(f'duplicate characteristic {characteristic} for {geo}')
                counts[characteristic] = parse_count(row['OBS_VALUE'], row['FLAG'])
    return profiles


def city_ref(city):
    if city['id'] == 'csd-6204003':
        return '2021A00056204003'
    return ('2021S0504' if city['kind'] == 'ca' else '2021S0503') + city['id']


def build(profiles, cities):
    entries = {}
    for city in cities:
        counts = profiles.get(city_ref(city), {})
        entries[city['id']] = {'themes': {t['id']: build_theme(counts, t['categories'], t['total_characteristic']) for t in THEMES}}
    return {'version': 1, 'vintage': '2021', 'source_ids': [SOURCE_ID], 'pictograms_per_row': 20,
            'rules': label('Each row represents its stated population, not individual people. Twenty symbols are apportioned by largest remainder from the sum of displayed categories, with ties in displayed order. Census counts are rounded by Statistics Canada and may not sum to the published total. A missing count or total leaves the row unallocated. The 25% sample reflects Census Day 2021, including pandemic-era commuting.', 'Chaque rangée représente la population indiquée, et non des personnes individuelles. Vingt pictogrammes sont répartis selon la méthode des plus forts restes à partir de la somme des catégories affichées, les ex æquo suivant leur ordre. Les chiffres du Recensement sont arrondis par Statistique Canada et leur somme peut différer du total publié. Une donnée ou un total manquant empêche la répartition. L’échantillon de 25 % reflète le jour du Recensement de 2021, y compris la navette en période de pandémie.'),
            'themes': THEMES, 'cities': entries}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--cache', type=Path, default=Path('/tmp/canada-citizens'))
    p.add_argument('--offline', action='store_true')
    args = p.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    manifest_path = args.cache / 'manifest.json'
    if not args.offline:
        files = []
        for name, url in URLS.items():
            dest = args.cache / name
            req = Request(url, headers={'Accept': 'text/csv', 'User-Agent': 'Canada-Civ/1.0'})
            with urlopen(req, timeout=120) as response:
                data = response.read()
            if not data.startswith(b'DATAFLOW,'):
                raise ValueError('Statistics Canada returned an unexpected response')
            dest.write_bytes(data)
            files.append({'file': name, 'url': url,
                          'retrieved': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                          'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
        manifest_path.write_text(json.dumps(files, indent=2) + '\n', encoding='utf-8')
    if not manifest_path.exists():
        raise FileNotFoundError(f'No source manifest in {args.cache}; fetch online first')
    files = json.loads(manifest_path.read_text(encoding='utf-8'))
    if {f['file'] for f in files} != set(URLS):
        raise ValueError('Source manifest does not match required files')
    for item in files:
        dest = args.cache / item['file']
        data = dest.read_bytes()
        if (item['url'] != URLS[item['file']] or len(data) != item['bytes'] or
                hashlib.sha256(data).hexdigest() != item['sha256'] or not item.get('retrieved')):
            raise ValueError(f'Cached source does not match manifest: {dest}')
    paths = [args.cache / n for n in URLS]
    cities = json.loads((ROOT / 'web/data/cities.json').read_text(encoding='utf-8'))
    result = build(read_profiles(paths), cities)
    (ROOT / 'web/data/citizens.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    source = {'id': SOURCE_ID, 'title': 'Census Profile, 2021 Census of Population (Catalogue 98-401-X)', 'publisher': 'Statistics Canada', 'homepage': 'https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/index.cfm?Lang=E', 'license': 'Statistics Canada Open Licence', 'license_url': 'https://www.statcan.gc.ca/en/reference/licence', 'vintage': '2021', 'description': 'Census Profile SDMX dataflows DF_CMACA and DF_CSD, version 1.3, all genders, counts.', 'used_for': 'City citizen pictogram rows: age, occupation, commuting, education and immigrant status.', 'files': files}
    (ROOT / 'web/data/sources-citizens.json').write_text(json.dumps([source], ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Built citizen rows for {len(result["cities"])} cities')


if __name__ == '__main__':
    main()
