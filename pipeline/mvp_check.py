"""Validation for the Milestone 1 atlas data contracts.

The validator accepts decoded objects so it can also be exercised against broken
fixtures without modifying the shipped files.
"""
import json
import math
from pathlib import Path

YIELDS = frozenset(('food', 'production', 'gold', 'science', 'culture'))
LENSES = frozenset(('density', 'income', 'home', 'age', 'bachelors',
                    'forest', 'farmland', 'developed', 'official_language'))
# 2021 Census cartographic CMA/CA boundary attributes, CMATYPE=B.
CMA_IDS = frozenset('001 205 305 310 320 408 421 433 442 447 462 505 521 522 529 532 535 537 539 541 543 550 555 559 568 580 595 602 705 725 810 825 830 835 915 925 930 932 933 935 938'.split())


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _bilingual(value):
    return isinstance(value, dict) and all(isinstance(value.get(k), str) and value[k].strip() for k in ('en', 'fr'))


def validate(data):
    """Return human-readable errors for decoded required atlas payloads."""
    errors = []
    def require(condition, message):
        if not condition:
            errors.append(message)
        return condition

    world = data['world']
    owner = world['owner']
    size = world['grid']['cols'] * world['grid']['rows']
    province_meta = world['provinces']
    provinces = data['provinces'].get('provinces', [])
    cities = data['cities']
    nation = data['nation']
    lenses = data['lenses'].get('lenses', [])
    sources = data['sources']
    require(isinstance(sources, list) and len(sources) > 0, 'sources must be a nonempty list')
    for source in sources:
        label = source.get('id', '(missing id)')
        for field in ('id', 'title', 'publisher', 'product_id', 'vintage', 'license', 'homepage', 'used_for'):
            require(bool(source.get(field)), f'source {label}: missing {field}')
        require(str(source.get('homepage', '')).startswith(('http://', 'https://')), f'source {label}: invalid homepage')
        files = source.get('files')
        if require(isinstance(files, list) and bool(files), f'source {label}: missing downloaded files'):
            for f in files:
                require(str(f.get('url', '')).startswith(('http://', 'https://')), f'source {label}: missing file URL')
                require(all(f.get(k) for k in ('file', 'retrieved', 'sha256', 'bytes')), f'source {label}: incomplete file provenance')
    source_ids = {s.get('id') for s in sources}
    if require(len(provinces) == 13, 'provinces must contain 13 entries'):
        require([p.get('pruid') for p in provinces] == [p.get('pruid') for p in province_meta], 'provinces must follow world PRUID order')
    for p in provinces:
        label = p.get('abbr', '?')
        require(_bilingual(p.get('name')), f'province {label}: missing bilingual name')
        require(_number(p.get('population')) and p['population'] >= 0, f'province {label}: missing population')
    city_ids = [c.get('id') for c in cities]
    require(len(cities) == 44, 'cities must contain 41 CMAs and three territorial capitals')
    require(len(set(city_ids)) == len(city_ids), 'city ids must be unique')
    require({c.get('id') for c in cities if c.get('kind') == 'cma'} == CMA_IDS, 'cities must contain exactly the 41 official 2021 CMAs')
    for uid, kind in [('990', 'ca'), ('995', 'ca'), ('csd-6204003', 'capital')]:
        require(any(c.get('id') == uid and c.get('kind') == kind and c.get('capital') for c in cities), f'missing territorial capital {uid}')
    iqaluit = next((c for c in cities if c.get('id') == 'csd-6204003'), None)
    if iqaluit:
        require(iqaluit.get('metro') is False and iqaluit.get('gdp') is None, 'Iqaluit must be non-metro and have null GDP')
    ottawa = next((c for c in cities if c.get('id') == '505'), None)
    require(ottawa is not None and set(ottawa.get('provinces', [])) == {'ON', 'QC'}, 'Ottawa–Gatineau must include Ontario and Quebec')
    used_cells = set()
    previous_population = float('inf')
    for c in cities:
        label = c.get('id', '?')
        require(_bilingual(c.get('name')) and _bilingual(c.get('full')), f'city {label}: missing bilingual name')
        pop = c.get('population')
        if require(_number(pop) and pop >= 0, f'city {label}: missing population'):
            require(pop <= previous_population, 'cities must be sorted by descending population')
            previous_population = pop
        cell = c.get('cell')
        cell_ok = isinstance(cell, int) and not isinstance(cell, bool) and 0 <= cell < size and owner[cell] >= 0
        require(cell_ok, f'city {label}: invalid land cell')
        footprint = c.get('footprint')
        if require(isinstance(footprint, list) and len(footprint) > 0, f'city {label}: empty footprint'):
            require(cell in footprint, f'city {label}: footprint excludes city cell')
            valid = all(isinstance(i, int) and not isinstance(i, bool) and 0 <= i < size and owner[i] >= 0 for i in footprint)
            require(valid, f'city {label}: invalid footprint cell')
            require(not used_cells.intersection(footprint), f'city {label}: footprint overlaps another city')
            used_cells.update(footprint)
    require(nation.get('year') is not None and bool(nation.get('vintage')), 'nation: missing year or vintage')
    metrics = nation.get('nation', {})
    require(_number(metrics.get('population')) and metrics['population'] >= 0, 'nation: missing population')
    definitions = nation.get('yields', [])
    keys = {y.get('key') for y in definitions}
    require(keys == YIELDS, 'nation: missing or extra yield definitions')
    for definition in definitions:
        key = definition.get('key')
        require(_bilingual(definition.get('label')) and _bilingual(definition.get('description')), f'yield {key}: missing bilingual definition')
        if key == 'gold':
            require(definition.get('unit') in ('cad', 'cad_per_year'), 'gold must use CAD')
    for label, row in [('nation', metrics)] + [(p.get('abbr', '?'), p) for p in provinces] + [(c.get('id', '?'), c) for c in cities]:
        yields = row.get('yields', {})
        require(set(yields) >= YIELDS, f'{label}: missing yields')
        for key in YIELDS:
            value = yields.get(key)
            require(value is None or (_number(value) and value >= 0), f'{label}: invalid {key}')
        value = row.get('unemployment')
        require(value is None or (_number(value) and 0 <= value <= 1), f'{label}: unemployment must be null or a fraction')
    ids = {lens.get('id') for lens in lenses}
    require(LENSES <= ids and bool({'poverty', 'unaffordability'} & ids), 'missing required MVP lenses')
    require(len(ids) == len(lenses), 'lens ids must be unique')
    for lens in lenses:
        label = lens.get('id', '?')
        for field in ('name', 'unit', 'description', 'note'):
            require(_bilingual(lens.get(field)), f'lens {label}: missing bilingual {field}')
        require(lens.get('source') in source_ids, f'lens {label}: unknown source')
        values = lens.get('values')
        if require(isinstance(values, list) and len(values) == size, f'lens {label}: wrong array length'):
            require(all(v is None or _number(v) for v in values), f'lens {label}: invalid value')
            require(all(v is None for v, o in zip(values, owner) if o < 0), f'lens {label}: non-Canadian cells must be null')
            if lens.get('format') == 'pct':
                require(all(v is None or (_number(v) and 0 <= v <= 1) for v in values), f'lens {label}: percentages must be fractions')
    return errors


def check(directory):
    """Check required JSON files and report all discovered violations."""
    directory = Path(directory)
    try:
        data = {name: json.loads((directory / (name + '.json')).read_text()) for name in
                ('world', 'nation', 'provinces', 'cities', 'lenses', 'sources')}
        errors = validate(data)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        print(f'FAIL: atlas data could not be validated: {exc}')
        return 1
    if errors:
        for error in errors:
            print('FAIL:', error)
        return 1
    total = sum((directory / (name + '.json')).stat().st_size for name in data)
    print(f'PASS: atlas contracts; 44 cities, 13 provinces and territories; {total:,} required JSON bytes')
    if total >= 8_000_000:
        print('WARN: required MVP JSON exceeds the 8 MB target')
    return 0
