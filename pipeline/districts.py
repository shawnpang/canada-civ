"""Build the district specialisations from Statistics Canada 2021 Census data.

Run `uv run python -m pipeline.districts --fetch` to fetch and build, then run
without --fetch to reproduce from the verified raw cache. No CSD approximation
is made for Iqaluit, which is not covered by this CMA/CA table.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/districts2021'
WDS = 'https://www150.statcan.gc.ca/t1/wds/rest/'
SOURCE = 'statcan_labour_98100594'
THRESHOLD = 1.25
LIMIT = 3
# Each is exactly one NAICS 2017 sector in table 98-10-0594-01.
SECTORS = [
 ('agriculture','11','Agriculture and natural resources','Agriculture et ressources naturelles'),
 ('mining','21','Mining and extraction','Mines et extraction'),
 ('utilities','22','Utilities','Services publics'),
 ('construction','23','Construction','Construction'),
 ('manufacturing','31-33','Manufacturing','Fabrication'),
 ('wholesale','41','Wholesale trade','Commerce de gros'),
 ('retail','44-45','Retail trade','Commerce de détail'),
 ('transport','48-49','Transportation and warehousing','Transport et entreposage'),
 ('information','51','Information and culture','Information et culture'),
 ('finance','52','Finance and insurance','Finance et assurances'),
 ('real_estate','53','Real estate and rental','Immobilier et location'),
 ('professional','54','Professional and scientific services','Services professionnels et scientifiques'),
 ('management','55','Management of companies','Gestion de sociétés'),
 ('administration','56','Administrative and support services','Services administratifs et de soutien'),
 ('education','61','Education','Enseignement'),
 ('health','62','Health and social assistance','Santé et assistance sociale'),
 ('arts','71','Arts and recreation','Arts et loisirs'),
 ('hospitality','72','Accommodation and food services','Hébergement et restauration'),
 ('other_services','81','Other services','Autres services'),
 ('public_administration','91','Public administration','Administrations publiques'),
]
RULES = {
 'en': 'Using the 2021 Census employed labour force by industry of employment and place of residence, the location quotient (LQ) is (city sector employment / city all-industry employment) divided by (Canada sector employment / Canada all-industry employment). Each district is one NAICS 2017 sector. Select up to three sectors with LQ at least 1.25, ordered by unrounded LQ descending, with sector ID ascending to break ties. The city-type badge is the first selected sector. When any input needed to compare sectors is missing or suppressed, districts and badge are unavailable; a zero national sector or total denominator is also unavailable. Plaques are schematic specialisations, not the locations of jobs or neighbourhoods. Census counts are rounded and describe employed residents, not jobs located in the city.',
 'fr': 'Selon le Recensement de 2021, pour la population active occupée par industrie et selon le lieu de résidence, le quotient de localisation (QL) est (emploi du secteur dans la ville / emploi de toutes les industries dans la ville) divisé par (emploi du secteur au Canada / emploi de toutes les industries au Canada). Chaque quartier représente un secteur du SCIAN 2017. On retient au plus trois secteurs dont le QL est d’au moins 1,25, classés par QL non arrondi décroissant, puis par identifiant de secteur croissant en cas d’égalité. Le premier secteur retenu détermine le badge du type de ville. Si une donnée nécessaire à la comparaison manque ou est supprimée, les quartiers et le badge sont indisponibles; un dénominateur national de secteur ou un total nul rend aussi le calcul indisponible. Les plaques représentent des spécialisations schématiques, et non la localisation des emplois ou des quartiers. Les chiffres du recensement sont arrondis et décrivent les résidents occupés, non les emplois situés dans la ville.'
}


def quotient(city_sector, city_total, national_sector, national_total):
    """Return null for unavailable, invalid, or zero denominators; real zero survives."""
    values = (city_sector, city_total, national_sector, national_total)
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0 for v in values):
        return None
    if city_total == 0 or national_sector == 0 or national_total == 0:
        return None
    return (city_sector / city_total) / (national_sector / national_total)


def build(cities, counts):
    nation = counts.get('Canada', {})
    types = [{'id': ident, 'naics': code, 'name': {'en': en, 'fr': fr}} for ident, code, en, fr in SECTORS]
    results = {}
    for city in cities:
        values = counts.get(city['id'], {})
        lqs = {ident: quotient(values.get(code), values.get('total'), nation.get(code), nation.get('total')) for ident, code, _, _ in SECTORS}
        selected = None
        badge = None
        if all(value is not None for value in lqs.values()):
            ranked = sorted(((ident, value) for ident, value in lqs.items() if value >= THRESHOLD), key=lambda pair: (-pair[1], pair[0]))[:LIMIT]
            selected = [{'type': ident, 'lq': value} for ident, value in ranked]
            badge = selected[0]['type'] if selected else None
        results[city['id']] = {'badge': badge, 'districts': selected, 'quotients': lqs}
    return {'version': 1, 'vintage': '2021 Census', 'sources': [SOURCE], 'rules': RULES,
            'threshold': THRESHOLD, 'maximum_districts': LIMIT, 'types': types, 'cities': results}


def post(endpoint, body):
    data = json.dumps(body, separators=(',', ':')).encode()
    req = Request(WDS + endpoint, data=data, headers={'Content-Type': 'application/json', 'User-Agent': 'CanadaCiv/1.0 (open data atlas)'})
    with urlopen(req, timeout=180) as response:
        return response.read()


def fetch(cities):
    RAW.mkdir(parents=True, exist_ok=True)
    files = []
    def request(name, endpoint, body):
        data = post(endpoint, body)
        obj = json.loads(data)
        if not isinstance(obj, list) or any(entry.get('status') != 'SUCCESS' and (entry.get('object') or {}).get('responseStatusCode') != 2 for entry in obj):
            raise ValueError(f'Unsuccessful Statistics Canada response: {name}')
        path = RAW / name
        path.write_bytes(data)
        files.append({'file': str(path.relative_to(ROOT)), 'url': WDS + endpoint, 'request_body': body,
                      'retrieved': datetime.now(timezone.utc).isoformat(), 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
        return obj
    metadata = request('metadata.json', 'getCubeMetadata', [{'productId': 98100594}])[0]['object']
    geos = metadata['dimension'][0]['member']
    industries = metadata['dimension'][1]['member']
    members = {str(m['classificationCode']): m['memberId'] for m in geos if m['geoLevel'] in (503, 504)}
    members['Canada'] = next(m['memberId'] for m in geos if m['geoLevel'] == 0)
    industry_ids = {'total': next(m['memberId'] for m in industries if m['memberNameEn'] == 'All industries')}
    for _, code, _, _ in SECTORS:
        industry_ids[code] = next(m['memberId'] for m in industries if m['memberNameEn'].startswith(code + ' '))
    selected_geos = {city['id']: members[city['id']] for city in cities if city['kind'] in ('cma', 'ca') and city['id'] in members}
    selected_geos['Canada'] = members['Canada']
    coords = [{'productId': 98100594, 'coordinate': f'{geo}.{industry}.1.1.1.1.2.0.0.0', 'latestN': 1}
              for geo in selected_geos.values() for industry in industry_ids.values()]
    for n, start in enumerate(range(0, len(coords), 200)):
        request(f'data-{n:02d}.json', 'getDataFromCubePidCoordAndLatestNPeriods', coords[start:start + 200])
    manifest = {'id': SOURCE, 'title': 'Labour force status by occupation, industry, age and gender',
                'publisher': 'Statistics Canada', 'product_id': '98-10-0594-01', 'vintage': '2021 Census',
                'license': 'Statistics Canada Open Licence; https://www.statcan.gc.ca/en/reference/licence',
                'homepage': 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810059401',
                'description': 'Employed labour force by industry of employment, place of residence; all industries and NAICS 2017 sectors.',
                'used_for': 'District and city-type location quotients', 'files': files}
    (RAW / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    return manifest


def read_counts(manifest):
    for file in manifest['files']:
        data = (ROOT / file['file']).read_bytes()
        if hashlib.sha256(data).hexdigest() != file['sha256']:
            raise ValueError('District source cache does not match its manifest')
    metadata = json.loads((RAW / 'metadata.json').read_text())[0]['object']
    geos = {str(m['memberId']): ('Canada' if m['geoLevel'] == 0 else str(m['classificationCode']))
            for m in metadata['dimension'][0]['member'] if m['geoLevel'] in (0, 503, 504)}
    industries = metadata['dimension'][1]['member']
    codes = {str(m['memberId']): ('total' if m['memberNameEn'] == 'All industries' else next((code for _, code, _, _ in SECTORS if m['memberNameEn'].startswith(code + ' ')), None)) for m in industries}
    counts = {}
    for f in manifest['files']:
        if Path(f['file']).name == 'metadata.json':
            continue
        for item in json.loads((ROOT / f['file']).read_text()):
            obj = item.get('object') or {}
            parts = obj.get('coordinate', '').split('.')
            if len(parts) < 2 or parts[0] not in geos or codes.get(parts[1]) is None:
                raise ValueError('Unexpected Statistics Canada coordinate')
            points = obj.get('vectorDataPoint') or []
            value = points[0].get('value') if points and item.get('status') == 'SUCCESS' else None
            counts.setdefault(geos[parts[0]], {})[codes[parts[1]]] = value
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch', action='store_true')
    args = parser.parse_args()
    cities = json.loads((ROOT / 'web/data/cities.json').read_text())
    manifest = fetch(cities) if args.fetch else json.loads((RAW / 'manifest.json').read_text())
    result = build(cities, read_counts(manifest))
    (ROOT / 'web/data/districts.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    (ROOT / 'web/data/sources-districts.json').write_text(json.dumps([manifest], ensure_ascii=False, indent=2) + '\n')
    print(f"Wrote districts for {len(result['cities'])} cities; {sum(city['badge'] is not None for city in result['cities'].values())} badges")


if __name__ == '__main__':
    main()
