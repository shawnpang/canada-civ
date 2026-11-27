"""Combine the M2 source fragments without modifying the shared catalogue.

After running both builders, run ``uv run python scripts/merge_resource_sources.py``.
The integrator can merge the resulting list into web/data/sources.json by id.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRAGMENTS = [ROOT / 'data/raw/resources-sources.json', ROOT / 'data/raw/infra-sources.json']
OUTPUT = ROOT / 'web/data/sources-resources.json'


def main():
    records = []
    ids = set()
    for fragment in FRAGMENTS:
        for record in json.loads(fragment.read_text()):
            if record['id'] in ids:
                raise ValueError(f"Duplicate source id: {record['id']}")
            ids.add(record['id'])
            for entry in record['files']:
                content = (ROOT / entry['file']).read_bytes()
                if hashlib.sha256(content).hexdigest() != entry['sha256']:
                    raise ValueError(f"Source hash mismatch: {entry['file']}")
                if len(content) != entry['bytes']:
                    raise ValueError(f"Source size mismatch: {entry['file']}")
            records.append(record)
    OUTPUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
    print(f'Wrote {len(records)} source records to {OUTPUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
