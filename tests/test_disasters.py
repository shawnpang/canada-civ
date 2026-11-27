import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from pipeline import disasters, merge_disasters, mvp_sources
from pipeline.core.geo import MapProjection, unproject
from pipeline.core.hexgrid import HexGrid

ROOT = Path(__file__).resolve().parents[1]


class DisasterLensTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.world = json.loads((ROOT / 'web/data/world.json').read_text())
        cls.payload = json.loads((ROOT / 'web/data/disasters.json').read_text())
        cls.source = json.loads((ROOT / 'web/data/sources-disasters.json').read_text())[0]

    def marker_for(self, cell):
        grid = HexGrid(**self.world['grid'])
        x, y = grid.center(cell % grid.cols, cell // grid.cols)
        projection = self.world['projection']
        metres = MapProjection(projection['min_x'], projection['max_y']).from_map(x, y)
        lon, lat = unproject(*metres)
        return f'POINT ({lon} {lat})'

    def test_point_mapping_duplicate_and_unknown(self):
        land = next(i for i, (o, w) in enumerate(zip(self.world['owner'], self.world['water'])) if o >= 0 and w == 0)
        sea = next(i for i, o in enumerate(self.world['owner']) if o < 0)
        marker = self.marker_for(land)
        self.assertEqual(disasters.marker_cell(marker, self.world), (land, 'mapped'))
        records = [{'id': 'one', 'geometry': marker}, {'id': 'one', 'geometry': marker},
                   {'id': 'two', 'geometry': marker}, {'id': 'three', 'geometry': 'POLYGON ((0 0, 1 1, 0 0))'},
                   {'id': 'four', 'geometry': None}, {'id': 'five', 'geometry': self.marker_for(sea)}]
        result = disasters.build(self.world, records)
        values = result['lens']['values']
        self.assertEqual(values[land], 2)
        self.assertEqual(len(values), 17956)
        self.assertEqual(sum(v is not None for v in values), 1)
        self.assertNotIn(0, values)
        self.assertIsNone(values[sea])
        self.assertEqual(result['summary']['rows_by_result']['non_point_geometry'], 1)
        self.assertEqual(result['summary']['rows_by_result']['missing_geometry'], 1)
        self.assertEqual(result['summary']['rows_by_result']['not_canadian_land'], 1)

    def test_invalid_and_outside_markers_are_not_counted(self):
        for geometry in ('POINT (nan 45)', 'POINT (0 90)', 'POINT (1 2 3)'):
            self.assertIsNone(disasters.marker_cell(geometry, self.world)[0])
        self.assertEqual(disasters.marker_cell('POINT (0 0)', self.world)[1], 'outside_grid')

    def test_shipped_lens_grid_and_nulls(self):
        lens = self.payload['lens']
        self.assertEqual(lens['id'], 'disasters')
        self.assertEqual(lens['source'], self.source['id'])
        self.assertEqual(len(lens['values']), 17956)
        self.assertTrue(any(value is not None for value in lens['values']))
        self.assertTrue(all(value is None or (isinstance(value, int) and value > 0) for value in lens['values']))
        self.assertTrue(all(value is None for value, owner, water in zip(lens['values'], self.world['owner'], self.world['water']) if owner < 0 or water != 0))
        for field in ('name', 'description', 'note', 'vintage', 'unit'):
            self.assertTrue(all(lens[field].get(lang) for lang in ('en', 'fr')))
        self.assertEqual(sum(value is not None for value in lens['values']), self.payload['summary']['cells_with_markers'])
        file = self.source['files'][0]
        self.assertRegex(file['sha256'], r'^[0-9a-f]{64}$')
        self.assertEqual(file['url'], disasters.URL)
        self.assertGreater(file['bytes'], 0)

    def test_reproducible_if_cached_extract_is_available(self):
        raw = ROOT / 'data/raw/cdd/cdd-extract-1.xlsx'
        if not raw.exists():
            self.skipTest('Official source extract is not cached')
        self.assertEqual(hashlib.sha256(raw.read_bytes()).hexdigest(), self.source['files'][0]['sha256'])
        self.assertEqual(disasters.build(self.world, disasters.read_records(raw)), self.payload)

    def test_catalogues_match_disaster_payload_and_preserve_other_lenses(self):
        lenses = json.loads((ROOT / 'web/data/lenses.json').read_text())['lenses']
        sources = json.loads((ROOT / 'web/data/sources.json').read_text())
        self.assertEqual([lens for lens in lenses if lens['id'] == 'disasters'],
                         [self.payload['lens']])
        self.assertEqual([source for source in sources if source['id'] == 'cdd'],
                         [self.source])
        self.assertTrue({'density', 'income', 'home', 'poverty', 'age', 'bachelors',
                         'forest', 'farmland', 'developed', 'official_language',
                         'foreign_born', 'commute', 'homeownership', 'faith',
                         'faith_tradition', 'migration'} <= {lens['id'] for lens in lenses})

    def test_merge_replaces_stale_entries_and_is_idempotent(self):
        lenses = {'vintage': 'original', 'groups': [{'id': 'land'}],
                  'lenses': [{'id': 'other', 'values': [None]},
                             {'id': 'disasters', 'values': [999]},
                             {'id': 'disasters', 'values': [999]}]}
        sources = [{'id': 'other', 'title': 'unchanged'}, {'id': 'cdd'}, {'id': 'cdd'}]
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            cache, out = root / 'raw', root / 'out'
            cache.mkdir()
            out.mkdir()
            extract = cache / 'cdd-extract-1.xlsx'
            extract.write_bytes(b'fixture')
            source = disasters.source_record(extract, '2026-01-01')
            (out / 'sources-disasters.json').write_text(json.dumps([source]))
            with patch.object(merge_disasters, 'RAW', cache), patch.object(merge_disasters, 'OUT', out), \
                    patch.object(disasters, 'read_records', return_value=[]), \
                    patch.object(disasters, 'build', return_value=self.payload):
                merged_lenses, merged_sources = merge_disasters.merge(self.world, lenses, sources)
                self.assertEqual(merge_disasters.merge(self.world, merged_lenses, merged_sources),
                                 (merged_lenses, merged_sources))
            self.assertEqual(merged_lenses['vintage'], 'original')
            self.assertEqual(merged_lenses['groups'], lenses['groups'])
            self.assertEqual(merged_lenses['lenses'], [lenses['lenses'][0], self.payload['lens']])
            self.assertEqual(merged_sources, [sources[0], source])
            self.assertEqual(json.loads((out / 'disasters.json').read_text()), self.payload)
            self.assertEqual(json.loads((out / 'sources-disasters.json').read_text()), [source])

    def test_fetch_verifies_offline_cache_and_refreshes_corrupt_cache(self):
        content = b'workbook fixture' * 20
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            cache = root / 'data/raw/cdd'
            out = root / 'web/data'
            cache.mkdir(parents=True)
            out.mkdir(parents=True)
            target = cache / 'cdd-extract-1.xlsx'
            target.write_bytes(content)
            source = disasters.source_record(target, '2026-01-01')
            (out / 'sources-disasters.json').write_text(json.dumps([source]))
            with patch.object(merge_disasters, 'RAW', cache), patch.object(merge_disasters, 'OUT', out), \
                    patch.object(mvp_sources, 'ROOT', root), patch.object(mvp_sources, '_request') as request, \
                    patch.object(disasters, 'read_records', return_value=[]):
                merge_disasters.fetch(offline=True)
                request.assert_not_called()
                target.write_bytes(b'corrupt')
                with self.assertRaisesRegex(RuntimeError, 'offline cache missing or unverified'):
                    merge_disasters.fetch(offline=True)
                request.return_value = content
                merge_disasters.fetch()
                request.assert_called_once()
                entry = json.loads((cache / 'manifest.json').read_text())['files'][0]
                self.assertEqual(entry['sha256'], hashlib.sha256(content).hexdigest())
                self.assertEqual(entry['url'], disasters.URL)


if __name__ == '__main__':
    unittest.main()
