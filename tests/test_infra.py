import json
import math
import unittest
from pathlib import Path

from pipeline.infra import atlas_lonlat, simplify

ROOT = Path(__file__).resolve().parents[1]


class InfrastructureGeometryTests(unittest.TestCase):
    def test_atlas_lambert_origin_and_round_trip(self):
        lon, lat = atlas_lonlat(0, 0)
        self.assertAlmostEqual(lon, -95, places=7)
        self.assertAlmostEqual(lat, 49, places=7)
        # 1,000 km due east of the origin reaches a plausible location.
        lon, lat = atlas_lonlat(1_000_000, 0)
        self.assertTrue(-82 < lon < -80)
        self.assertTrue(47 < lat < 50)

    def test_simplification_keeps_significant_bends_and_endpoints(self):
        points = [(0, 0), (1, 0.5), (2, 4), (3, 0.5), (4, 0)]
        self.assertEqual(simplify(points, 2), [(0, 0), (2, 4), (4, 0)])

    def test_published_data_has_rules_and_traceable_military(self):
        payload = json.loads((ROOT / 'web/data/infrastructure.json').read_text())
        self.assertIn('2 km', payload['rules']['en'])
        self.assertIn('2 km', payload['rules']['fr'])
        self.assertIn('not a list or ranking', payload['rules']['en'])
        for layer in ('roads', 'rail', 'ports', 'airports', 'military'):
            self.assertTrue(payload[layer], layer)
        for point in payload['military']:
            self.assertEqual(point['sources'], ['dnd_bases', 'cgn_military'])
            self.assertNotIn('troops', point)
        self.assertLess((ROOT / 'web/data/infrastructure.json').stat().st_size, 300_000)
        for layer in ('ports', 'airports', 'military'):
            self.assertTrue(all(math.isfinite(p['x']) and math.isfinite(p['y']) and p['cell'] is not None for p in payload[layer]))


if __name__ == '__main__':
    unittest.main()
