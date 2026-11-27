import math
import unittest
from pipeline.core.geo import MapProjection, project, unproject
from pipeline.core.hexgrid import HexGrid

class GeoTests(unittest.TestCase):
    def test_origin_and_roundtrip(self):
        x, y = project(-91.8666666666667, 63.390675)
        self.assertAlmostEqual(x, 6200000, places=5)
        self.assertAlmostEqual(y, 3000000, places=5)
        for lon, lat in [(-123.12, 49.28), (-79.38, 43.65), (-68.52, 63.75), (-90, 82)]:
            lon2, lat2 = unproject(*project(lon, lat))
            self.assertAlmostEqual(lon, lon2, places=7)
            self.assertAlmostEqual(lat, lat2, places=7)
    def test_map_axes(self):
        p = MapProjection(1000, 5000)
        self.assertEqual(p.to_map(3000, 2000), (2, 3))
        self.assertEqual(p.from_map(2, 3), (3000, 2000))
    def test_centers_roundtrip(self):
        g = HexGrid.covering(1000, 1000)
        for r in range(g.rows):
            for c in range(g.cols):
                self.assertEqual(g.cell(*g.center(c, r)), (c, r))

    def test_pointy_top_odd_row_and_neighbor_picking(self):
        g = HexGrid.covering(1000, 1000)
        width = math.sqrt(3) * 25
        self.assertEqual(g.radius, 25)
        self.assertAlmostEqual(g.center(0, 0)[0], 0)
        self.assertAlmostEqual(g.center(0, 1)[0], width / 2)
        self.assertAlmostEqual(g.center(0, 1)[1], 37.5)
        self.assertEqual(g.cell(width * .49, 0), (0, 0))
        self.assertEqual(g.cell(width * .51, 0), (1, 0))
        self.assertEqual(g.cell(width / 2, 37.5), (0, 1))
        self.assertEqual(g.cell(-width / 2, 37.5), (-1, 1))
