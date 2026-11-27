"""Build the Explorer's 2021 census-subdivision table from StatCan table 98-10-0002-01.

Run ``uv run python -m pipeline.csd_explorer`` after placing the two cited
ZIPs in data/raw/csd_explorer. Downloads are verified against the release used
for the committed output, so revised upstream files need a deliberate update.
"""
import csv
import hashlib
import io
import json
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'data/raw/csd_explorer'
OUTPUT = ROOT / 'web/data/csd-explorer.json'
HASHES = {
    'eng': '36ab6c8f3f6b82d70d9dea927cb5cf04f6fbf9b543a7ad543695e6ea70d22876',
    'fra': '9b862c8bdc0ee3bad8ccb76e24a25ec44b917faef5c6396336d24599bf203bdd',
}
# StatCan's wide table has a value and symbol column for each numbered measure.
FIELDS = {'population': 4, 'growth_census': 8, 'dwellings': 10,
          'occupied_dwellings': 16, 'land_area': 22, 'density': 24}


def read_rows(path, language):
    content = path.read_bytes()
    if hashlib.sha256(content).hexdigest() != HASHES[language]:
        raise ValueError(f'Unexpected SHA-256 for {path}')
    with ZipFile(io.BytesIO(content)) as archive:
        text = io.TextIOWrapper(archive.open('98100002.csv'), encoding='utf-8-sig', newline='')
        rows = csv.reader(text, delimiter=',' if language == 'eng' else ';')
        next(rows)
        return {row[2][9:]: row for row in rows if len(row) >= 30 and row[2].startswith('2021A0005') and len(row[2]) == 16}


def numeric(row, index, fraction=False):
    # Non-empty symbols indicate suppression or a value that must not be used.
    if row[index + 1] or not row[index]:
        return None
    value = float(row[index])
    return value / 100 if fraction else int(value) if value.is_integer() else value


def build(english, french):
    en, fr = read_rows(english, 'eng'), read_rows(french, 'fra')
    if en.keys() != fr.keys():
        raise ValueError('English and French CSD identifiers differ')
    columns = {key: [] for key in ['csduid', 'name', 'pruid', *FIELDS]}
    for uid in sorted(en):
        row = en[uid]
        columns['csduid'].append(uid)
        columns['name'].append({'en': row[1], 'fr': fr[uid][1]})
        columns['pruid'].append(uid[:2])
        for key, index in FIELDS.items():
            columns[key].append(numeric(row, index, key == 'growth_census'))
    return {'vintage': '2021 Census', 'source': 'statcan_csd_population_98100002', 'columns': columns}


def main():
    data = build(RAW / '98100002-eng.zip', RAW / '98100002-fra.zip')
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f"Wrote {len(data['columns']['csduid'])} census subdivisions to {OUTPUT.relative_to(ROOT)}")


if __name__ == '__main__':
    main()
