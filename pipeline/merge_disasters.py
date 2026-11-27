"""Fetch and integrate the Canadian Disaster Database point-marker lens.

The shipped source record also supplies provenance for an identical cached
extract. Otherwise a fetch manifest must verify the file before it is used.
"""
import json
from pathlib import Path

from pipeline import disasters
from pipeline import mvp_sources as src

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/cdd'
OUT = ROOT / 'web/data'


def _shipped_entry(path):
    """Use the published record only when it identifies these exact bytes."""
    source_path = OUT / 'sources-disasters.json'
    if not source_path.exists():
        return None
    records = json.loads(source_path.read_text())
    entries = [f for record in records if record.get('id') == 'cdd'
               for f in record.get('files', [])]
    return next((entry for entry in entries
                 if src._valid(path, entry, disasters.URL, None)), None)


def _entry(path):
    manifest = src._read_manifest(RAW / 'manifest.json')
    entry = src._previous(manifest, path)
    if entry and src._valid(path, entry, disasters.URL, None):
        return entry
    return _shipped_entry(path)


def fetch(offline=False):
    """Verify a cached extract or fetch it and record its actual retrieval time."""
    path = RAW / 'cdd-extract-1.xlsx'
    entry = src._get(path, disasters.URL, _entry(path), offline)
    # A successful HTTP response is not enough: reject non-CDD workbooks.
    disasters.read_records(path)
    src._save(RAW / 'manifest.json', {'id': 'cdd', 'files': [entry]})
    print('Verified Canadian Disaster Database extract', flush=True)


def _write_if_changed(path, data, *, indent=None):
    if path.exists() and json.loads(path.read_text()) == data:
        return
    path.write_text(json.dumps(data, ensure_ascii=False, indent=indent,
                               separators=None if indent else (',', ':')) + '\n')


def merge(world, lenses, sources):
    """Rebuild CDD for this world and replace its catalogue entries exactly once."""
    path = RAW / 'cdd-extract-1.xlsx'
    entry = _entry(path)
    if not entry:
        raise RuntimeError('CDD extract missing or unverified; run python -m pipeline fetch')
    payload = disasters.build(world, disasters.read_records(path))
    source = disasters.source_record(path, entry['retrieved'])
    _write_if_changed(OUT / 'disasters.json', payload)
    _write_if_changed(OUT / 'sources-disasters.json', [source], indent=2)
    result_lenses = dict(lenses)
    result_lenses['lenses'] = [row for row in lenses['lenses'] if row.get('id') != 'disasters'] + [payload['lens']]
    result_sources = [row for row in sources if row.get('id') != 'cdd'] + [source]
    return result_lenses, result_sources
