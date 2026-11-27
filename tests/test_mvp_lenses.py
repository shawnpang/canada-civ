import unittest

from pipeline.mvp_lenses import build, fraction


class LensTests(unittest.TestCase):
    def setUp(self):
        self.world = {
            'owner': [0, 0, -1, 0, 0],
            'water': [0, 0, 1, 0, 0],
            'division': [0, 1, -1, -1, 0],
            'divisions': [{'cduid': '3520'}, {'cduid': '3501'}],
            'cover': [1, 0, 0, 1, 1],
            'pct': {'forest': [35, 0, 0, 10, 0], 'crop': [0, 0, 0, 25, 0],
                    'developed': [1, 0, 0, 0, 0]},
        }
        self.profiles = {'2021A00033520': {
            '6': 42.5, '229': 85000, '1474': 900000, '331': 10.5,
            '40': 42.0, '2014': 100, '2024': 40, '374': 100, '376': 2,
        }}
        self.lenses = {row['id']: row for row in build(self.world, self.profiles)['lenses']}

    def test_census_values_and_mask(self):
        self.assertEqual(self.lenses['poverty']['values'], [0.105, None, None, None, 0.105])
        self.assertEqual(self.lenses['bachelors']['values'], [0.4, None, None, None, 0.4])
        self.assertEqual(self.lenses['official_language']['values'], [0.02, None, None, None, 0.02])

    def test_cover_zero_is_distinct_from_missing(self):
        self.assertEqual(self.lenses['forest']['values'], [0.35, None, None, 0.1, 0.0])
        self.assertEqual(self.lenses['farmland']['values'], [0.0, None, None, 0.25, 0.0])

    def test_suppressed_or_invalid_ratios(self):
        for numerator, denominator in ((None, 3), (3, None), (1, 0), (4, 3)):
            self.assertIsNone(fraction(numerator, denominator))
        self.assertEqual(fraction(0, 10), 0)


if __name__ == '__main__':
    unittest.main()
