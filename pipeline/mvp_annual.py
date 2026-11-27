"""Annual population estimates on 2021 geography.

Estimates are independent of census counts and are never mixed to calculate growth.
"""
import csv
import io
import json
import zipfile

from pipeline import mvp_sources as src

GROUP = 'annual_population'
TABLES = {
    '17100005': ('17-10-0005-01', 'Population estimates on July 1 by age and gender', '2021–2025; Canada and provinces and territories'),
    '17100148': ('17-10-0148-01', 'Population estimates by CMA and CA, 2021 boundaries', '2021–2025; CMAs and CAs'),
    '17100155': ('17-10-0155-01', 'Population estimates by census subdivision, 2021 boundaries', '2021–2025; Iqaluit CSD'),
}


def fetch(offline=False):
    directory = src.RAW / GROUP
    path = directory / 'manifest.json'
    old = src._read_manifest(path)
    files = []
    manifest = {'id': 'statcan_annual_population', 'publisher': 'Statistics Canada',
                'title': 'Annual population estimates, July 1', 'license': src.LICENCE,
                'vintage': '2021–2025',
                'products': [{'id': details[0], 'title': details[1], 'vintage': details[2],
                              'homepage': f'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid={code}01'}
                             for code, details in TABLES.items()], 'files': files}
    for code in TABLES:
        dest = directory / (code + '.zip')
        url = f'https://www150.statcan.gc.ca/n1/tbl/csv/{code}-eng.zip'
        files.append(src._get(dest, url, src._previous(old, dest), offline))
        src._save(path, manifest)
        print(f'  Verified annual population {code}', flush=True)


def catalogue():
    manifest = src._read_manifest(src.RAW / GROUP / 'manifest.json')
    result = []
    for code, (product, title, vintage) in TABLES.items():
        path = src.RAW / GROUP / (code + '.zip')
        url = f'https://www150.statcan.gc.ca/n1/tbl/csv/{code}-eng.zip'
        entry = src._previous(manifest, path)
        if not entry or not src._valid(path, entry, url, None):
            raise RuntimeError(f'missing or invalid provenance for {path}')
        result.append({'id': 'statcan_annual_population_' + code, 'title': title,
                       'publisher': 'Statistics Canada', 'product_id': product,
                       'vintage': vintage, 'license': src.LICENCE,
                       'homepage': f'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid={code}01',
                       'description': 'Annual July 1 postcensal population estimates; distinct from Census counts.',
                       'used_for': 'Population, population history and growth.',
                       'files': [entry]})
    return result


def rows(code):
    with zipfile.ZipFile(src.RAW / GROUP / (code + '.zip')) as archive:
        name = next(name for name in archive.namelist() if name.endswith('.csv') and 'MetaData' not in name)
        with io.TextIOWrapper(archive.open(name), encoding='utf-8-sig', newline='') as stream:
            yield from csv.DictReader(stream)


def _series(code):
    series = {}
    for row in rows(code):
        year = row['REF_DATE']
        if year not in ('2021', '2022', '2023', '2024', '2025'):
            continue
        if code != '17100155' and (row['Gender'] != 'Total - gender' or row['Age group'] != 'All ages'):
            continue
        if row['UOM'] != 'Persons' or row['SCALAR_FACTOR'] != 'units':
            continue
        dguid, value = row['DGUID'], row['VALUE']
        if not dguid or not value.isdigit():
            continue
        years = series.setdefault(dguid, {})
        if year in years:
            raise ValueError(f'duplicate annual population estimate for {dguid}, {year}')
        years[year] = int(value)
    return series


def _assign(row, series, code):
    row['census_population'] = row.get('population')
    row['pop_series'] = series
    row['pop_series_source'] = 'statcan_annual_population_' + code
    row['pop_series_vintage'] = ('July 1 population estimates, 2021–2025; '
                                 + ('2021 geography; 2025 preliminary' if code != '17100005' else 'revised national and P/T series'))
    if series.get('2025') is not None:
        row['population'] = series['2025']
        row['population_vintage'] = row['pop_series_vintage']
    else:
        row['population_vintage'] = 'Census 2021; 2025 estimate unavailable'
    first, last = series.get('2021'), series.get('2025')
    # A change larger than 100% in either direction is treated as a bad match.
    change = (last / first - 1) if first and last is not None else None
    row['growth'] = change if change is not None and abs(change) <= 1 else None
    row['growth_years'] = [2021, 2025] if row['growth'] is not None else None
    row['growth_note'] = {
        'en': 'July 1 estimates, 2021 to 2025; changes over 100% are omitted as a match sanity check. Estimates are not census counts.',
        'fr': 'Estimations au 1er juillet, de 2021 à 2025; les variations de plus de 100 % sont omises par vérification de concordance. Les estimations ne sont pas des chiffres du recensement.'}


def apply(nation, provinces, cities):
    """Add annual history to the nation wrapper, P/T list, and city list.

    The headline population is a 2025 estimate when available; the 2021 census
    count is retained separately. For consistent growth, both endpoints come
    from the same table and the same geographic identifier.
    Province/national series are revised later than the CMA and CSD estimates;
    their totals therefore need not reconcile with the earlier subprovincial release.
    """
    pt, metro, csd = (_series(code) for code in TABLES)
    _assign(nation['nation'], pt.get('2021A000011124', {}), '17100005')
    for province in provinces:
        _assign(province, pt.get('2021A0002' + province['pruid'], {}), '17100005')
    for city in cities:
        if city['kind'] == 'capital':
            _assign(city, csd.get('2021A0005' + city['id'].removeprefix('csd-'), {}), '17100155')
        else:
            prefix = '2021S0503' if city['kind'] == 'cma' else '2021S0504'
            _assign(city, metro.get(prefix + city['id'], {}), '17100148')
    nation['year'] = 2025
    nation['vintage'] = 'Population estimates July 2025; Census 2021 characteristics'
    nation['population_note'] = {
        'en': 'July 1, 2025 population estimates use 2021 boundaries. National and provincial estimates have been revised since the January 2026 subprovincial release and may not reconcile with city estimates. Industry yields and census-based lenses use Census 2021.',
        'fr': 'Les estimations de population au 1er juillet 2025 utilisent les limites de 2021. Les estimations nationales et provinciales ont été révisées depuis la diffusion infraprovinciale de janvier 2026 et peuvent différer des estimations des villes. Les rendements par industrie et les couches fondées sur le recensement utilisent le Recensement de 2021.'}
