"""Area assignment fixtures, including an unassigned cell and polygon hole."""
import unittest

from pipeline.election2025 import assign


def source_ring(points):
    # Map km to the fixture's projected metres with screen-space y inversion.
    return [(x * 1000, -y * 1000) for x, y in points + [points[0]]]


class ElectionGeometryTest(unittest.TestCase):
    def setUp(self):
        self.world = {'grid': {'cols': 4, 'rows': 1, 'radius': 25},
                      'projection': {'min_x': 0, 'max_y': 0},
                      'owner': [0, 0, 0, -1]}
        self.results = {'10001': {'party': 'liberal'}, '10002': {'party': 'conservative'}}

    def test_overlap_join_and_null(self):
        features = [
            ('10001', [source_ring([(-30, -30), (10, -30), (10, 30), (-30, 30)])]),
            ('10002', [source_ring([(10, -30), (64, -30), (64, 30), (10, 30)])]),
        ]
        ids, values = assign(self.world, features, self.results)
        self.assertEqual(ids, ['10001', '10002', None, None])
        self.assertEqual(values, ['liberal', 'conservative', None, None])

    def test_hole_and_unknown_winner_remain_blank(self):
        outer = source_ring([(-30, -30), (30, -30), (30, 30), (-30, 30)])
        hole = source_ring([(-25, -28), (-25, 28), (25, 28), (25, -28)])
        features = [('10001', [outer, hole]), ('10002', [outer])]
        results = {'10001': {'party': 'liberal'}, '10002': {'party': None}}
        ids, values = assign(self.world, features, results)
        self.assertEqual(ids[0], '10002')
        self.assertIsNone(values[0])
        self.assertIsNone(values[2])

    def test_plurality_without_majority_is_unassigned(self):
        areas = [(-30, -3, '10001'), (-3, 8, '10002'), (8, 30, '10003')]
        features = [(rid, [source_ring([(x0, -30), (x1, -30), (x1, 30), (x0, 30)])])
                    for x0, x1, rid in areas]
        results = {rid: {'party': rid} for _, _, rid in areas}
        ids, values = assign(self.world, features, results)
        self.assertIsNone(ids[0])
        self.assertIsNone(values[0])

    def test_tie_is_unassigned(self):
        left = source_ring([(-30, -30), (0, -30), (0, 30), (-30, 30)])
        right = source_ring([(0, -30), (30, -30), (30, 30), (0, 30)])
        ids, values = assign(self.world, [('10001', [left]), ('10002', [right])], self.results)
        self.assertIsNone(ids[0])
        self.assertIsNone(values[0])

    def test_water_with_positive_owner_is_unassigned(self):
        self.world['water'] = [1, 0, 0, 0]
        outer = source_ring([(-30, -30), (30, -30), (30, 30), (-30, 30)])
        ids, values = assign(self.world, [('10001', [outer])], self.results)
        self.assertIsNone(ids[0])
        self.assertIsNone(values[0])


if __name__ == '__main__':
    unittest.main()
