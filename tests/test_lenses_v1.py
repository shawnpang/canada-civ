import csv
import tempfile
import unittest
from pathlib import Path

from pipeline.lenses_v1 import build, read_profiles


class V1LensTests(unittest.TestCase):
    def setUp(self):
        self.world = {'owner': [0, 0, -1, 0, 0, 0], 'water': [0, 0, 0, 1, 0, 0],
                      'division': [0, 1, 0, 0, -1, 0],
                      'divisions': [{'cduid': '3520'}, {'cduid': '3501'}]}
        self.profiles = {'2021A00033520': {
            '1400': 10, '1401': 0, '1513': 100, '1515': 20,
            '1935': 100, '1937': 25, '1959': 40, '1969': 100,
            '1976': 5, '2611': 100, '2614': 10, '2615': 5, '2616': 0,
        }, '2021A00033501': {'1400': 10, '1401': None}}
        self.lenses = {row['id']: row for row in build(self.world, self.profiles)}

    def test_measures_and_mask(self):
        expected = {'foreign_born': .2, 'commute': .15, 'homeownership': 0,
                    'faith': .6, 'faith_tradition': .25, 'migration': .05}
        for name, value in expected.items():
            row = self.lenses[name]
            self.assertEqual(row['values'], [value, None, None, None, None, value])
            self.assertEqual(len(row['values']), len(self.world['owner']))
            self.assertEqual(row['vintage'], '2021 Census')
            self.assertEqual(set(row['description']), {'en', 'fr'})
            self.assertEqual(set(row['note']), {'en', 'fr'})

    def test_suppression_is_not_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'profile.csv'
            with path.open('w', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=['REF_AREA', 'CHARACTERISTIC', 'OBS_VALUE', 'FLAG'])
                writer.writeheader()
                for char, value, flag in [('1400', '100', ''), ('1401', '0', ''), ('1515', '0', '1'), ('1513', '', '')]:
                    writer.writerow({'REF_AREA': 'geo', 'CHARACTERISTIC': char, 'OBS_VALUE': value, 'FLAG': flag})
            profiles = read_profiles(path)['geo']
            self.assertEqual(profiles['1401'], 0)
            self.assertIsNone(profiles['1515'])
            self.assertIsNone(profiles['1513'])

    def test_missing_commute_band_and_invalid_religion(self):
        p = self.profiles['2021A00033520']
        p['2616'] = None
        p['1959'] = 101
        lenses = {row['id']: row for row in build(self.world, self.profiles)}
        self.assertIsNone(lenses['commute']['values'][0])
        self.assertIsNone(lenses['faith']['values'][0])


if __name__ == '__main__':
    unittest.main()
