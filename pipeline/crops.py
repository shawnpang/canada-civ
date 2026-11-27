"""Add schematic 2021 Census of Agriculture crop indicators to resources.

Run `uv run python -m pipeline.crops` to download if absent and merge the
crop payload and catalogue; `--offline` requires the cached official ZIP.
"""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
from urllib.request import Request, urlopen
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/crops/32100309-eng.zip'
WEB = ROOT / 'web/data'
URL = 'https://www150.statcan.gc.ca/n1/en/tbl/csv/32100309-eng.zip'
SOURCE = 'statcan_agriculture_32100309'
CROPS = [
    ('wheat', 'Wheat, total', 'Wheat', 'Blé'),
    ('canola', 'Canola (rapeseed)', 'Canola', 'Canola'),
    ('barley', 'Barley', 'Barley', 'Orge'),
    ('oats', 'Oats', 'Oats', 'Avoine'),
    ('corn', 'Corn, total', 'Corn', 'Maïs'),
    ('soybean', 'Soybeans', 'Soybeans', 'Soja'),
    ('potato', 'Potatoes', 'Potatoes', 'Pommes de terre'),
]
RULES = {
    'en': 'Crop symbols are schematic, not field locations or hex-level crop measurements. For each land hex assigned to a census division with positive 2020 cropland cover, the symbol represents the largest published 2021 hectare area among wheat, canola, barley, oats, corn, soybeans and potatoes in that entire division. Unavailable or suppressed values are excluded; absence of a symbol does not establish zero agriculture. The Census assigns farms to the location of their main operation; Yukon, Northwest Territories and Nunavut are excluded from this table. Values marked E should be used with caution.',
    'fr': 'Les symboles de cultures sont schématiques : ils ne localisent pas les champs et ne mesurent pas les cultures par hexagone. Pour chaque hexagone terrestre attribué à une division de recensement et présentant une couverture de terres cultivées positive en 2020, le symbole représente la plus grande superficie publiée en hectares en 2021 parmi le blé, le canola, l’orge, l’avoine, le maïs, le soja et les pommes de terre dans toute la division. Les valeurs indisponibles ou supprimées sont exclues; l’absence de symbole ne signifie pas une agriculture nulle. Le recensement attribue les fermes à l’emplacement de leur exploitation principale; le Yukon, les Territoires du Nord-Ouest et le Nunavut sont exclus de ce tableau. Les valeurs marquées E doivent être utilisées avec prudence.'
}


def fetch(offline=False):
    if RAW.exists():
        return
    if offline:
        raise FileNotFoundError(RAW)
    RAW.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(Request(URL, headers={'User-Agent': 'CanadaCiv/1.1'}), timeout=120) as response:
        data = response.read()
    # Reject error pages and incomplete archives before caching.
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if '32100309.csv' not in archive.namelist() or archive.testzip():
            raise ValueError('Invalid Census of Agriculture archive')
    RAW.write_bytes(data)


def read_rows(path):
    with zipfile.ZipFile(path) as archive:
        with archive.open('32100309.csv') as source:
            with io.TextIOWrapper(source, encoding='utf-8-sig', newline='') as text:
                yield from csv.DictReader(text)


def build(world, rows):
    """Keep each CD's observed hectares and quality; never impute missing data."""
    keys = {label: crop_id for crop_id, label, _, _ in CROPS}
    observations = {}
    for row in rows:
        dguid = row.get('DGUID', '')
        label = row.get('Field crops and hay')
        if (row.get('REF_DATE') != '2021' or row.get('Unit of measure') != 'Hectares'
                or not dguid.startswith('2021A0003') or len(dguid) != 13 or label not in keys):
            continue
        cduid, crop_id = dguid[-4:], keys[label]
        status, raw = row.get('STATUS', '').strip(), row.get('VALUE', '').strip()
        # F is too unreliable to publish. Preserve other missing markers as null.
        value = int(raw) if raw.isdigit() and status in ('A', 'B', 'C', 'D', 'E') else None
        by_crop = observations.setdefault(cduid, {})
        if crop_id in by_crop:
            raise ValueError(f'Duplicate crop observation: {cduid} {crop_id}')
        by_crop[crop_id] = {'hectares': value, 'quality': status or None}
    divisions = {}
    for division in world['divisions']:
        cduid = division['cduid']
        values = observations.get(cduid, {})
        divisions[cduid] = {crop_id: values.get(crop_id, {'hectares': None, 'quality': None})
                            for crop_id, _, _, _ in CROPS}
    choices = {}
    for cduid, values in divisions.items():
        positive = [(values[crop_id]['hectares'], -i, crop_id)
                    for i, (crop_id, _, _, _) in enumerate(CROPS)
                    if values[crop_id]['hectares'] is not None and values[crop_id]['hectares'] > 0]
        if positive:
            choices[cduid] = max(positive)[2]
    cells = []
    for cell, index in enumerate(world['division']):
        if (world['owner'][cell] < 0 or index < 0 or index >= len(world['divisions'])
                or world['pct']['crop'][cell] <= 0):
            continue
        crop = choices.get(world['divisions'][index]['cduid'])
        if crop:
            cells.append({'cell': cell, 'crop': crop})
    return {'vintage': '2021', 'source': SOURCE, 'rules': RULES,
            'types': [{'id': key, 'name': {'en': en, 'fr': fr}, 'table_label': label}
                      for key, label, en, fr in CROPS],
            'divisions': divisions, 'cells': cells}


def catalogue(path=RAW):
    data = path.read_bytes()
    return {'id': SOURCE, 'title': 'Field crops and hay, Census of Agriculture, 2021',
            'publisher': 'Statistics Canada', 'product_id': '32-10-0309-01', 'vintage': '2021',
            'homepage': 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3210030901',
            'license': 'Statistics Canada Open Licence',
            'description': 'Census of Agriculture field crops and hay by census division, in hectares; quality E means use with caution.',
            'used_for': 'Schematic crop symbols and census-division crop areas',
            'files': [{'file': str(path.relative_to(ROOT)), 'url': URL,
                       'retrieved': datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
                       'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}]}


def merge(resources, sources, crops, source):
    resources['crops'] = crops
    resources['sources'] = [s for s in resources.get('sources', []) if s != SOURCE] + [SOURCE]
    resources['vintage'][SOURCE] = '2021'
    # Almanac already prints the existing bilingual rules, so append this caveat.
    for lang in ('en', 'fr'):
        base = resources['rules'][lang].split('\nCrop symbols are schematic')[0].split('\nLes symboles de cultures sont schématiques')[0]
        resources['rules'][lang] = base + '\n' + RULES[lang]
    return [s for s in sources if s.get('id') != SOURCE] + [source]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    fetch(args.offline)
    world = json.loads((WEB / 'world.json').read_text())
    resources = json.loads((WEB / 'resources.json').read_text())
    sources = json.loads((WEB / 'sources.json').read_text())
    crop_data = build(world, read_rows(RAW))
    source = catalogue()
    sources = merge(resources, sources, crop_data, source)
    (WEB / 'resources.json').write_text(json.dumps(resources, ensure_ascii=False, separators=(',', ':')) + '\n')
    (WEB / 'sources.json').write_text(json.dumps(sources, ensure_ascii=False, indent=2) + '\n')
    (WEB / 'sources-crops.json').write_text(json.dumps([source], ensure_ascii=False, indent=2) + '\n')
    print(f"Built crop data for {len(crop_data['cells'])} schematic cells")


if __name__ == '__main__':
    main()
