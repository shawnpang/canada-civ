"""Census observations retain missing values, real zeros and their vintage."""
import csv
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pipeline import mvp


class CensusProfileTests(unittest.TestCase):
    def test_profile_parser_preserves_zero_and_missing_observations(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            profile_dir = root / 'census2021'
            profile_dir.mkdir()
            economy_dir = root / 'census_economy'
            economy_dir.mkdir()
            rows = [
                {'REF_AREA': 'zero', 'CHARACTERISTIC': '2225', 'OBS_VALUE': '0'},
                {'REF_AREA': 'missing', 'CHARACTERISTIC': '2225', 'OBS_VALUE': ''},
                {'REF_AREA': 'suppressed', 'CHARACTERISTIC': '2225', 'OBS_VALUE': '..'},
                {'REF_AREA': 'actual', 'CHARACTERISTIC': '2225', 'OBS_VALUE': '17321695'},
                {'REF_AREA': 'zero', 'CHARACTERISTIC': '1480', 'OBS_VALUE': '0'},
                {'REF_AREA': 'missing', 'CHARACTERISTIC': '1480', 'OBS_VALUE': ''},
                {'REF_AREA': 'suppressed', 'CHARACTERISTIC': '1478', 'OBS_VALUE': '..'},
                {'REF_AREA': 'flagged', 'CHARACTERISTIC': '2225', 'OBS_VALUE': '0', 'FLAG': '6'},
                {'REF_AREA': 'revised', 'CHARACTERISTIC': '2225', 'OBS_VALUE': '0', 'FLAG': '7'},
            ]
            for directory, flows in ((profile_dir, ('DF_PR', 'DF_CD', 'DF_CMACA', 'DF_CSD')),
                                     (economy_dir, ('DF_PR', 'DF_CMACA', 'DF_CSD'))):
                for flow in flows:
                    with (directory / f'{flow}.csv').open('w', newline='') as stream:
                        writer = csv.DictWriter(stream, fieldnames=['REF_AREA', 'CHARACTERISTIC', 'OBS_VALUE', 'FLAG'])
                        writer.writeheader()
                        if directory == economy_dir and flow == 'DF_PR':
                            writer.writerows(rows)
                        if directory == profile_dir and flow == 'DF_PR':
                            writer.writerow({'REF_AREA': 'actual', 'CHARACTERISTIC': '2230',
                                             'OBS_VALUE': '10.3'})
            with patch.object(mvp, 'RAW', root):
                profiles = mvp.csv_profiles()
        self.assertEqual(profiles['zero']['2225'], 0)
        self.assertIsNone(profiles['missing']['2225'])
        self.assertIsNone(profiles['suppressed']['2225'])
        self.assertEqual(profiles['actual']['2225'], 17321695)
        self.assertEqual(profiles['actual']['2230'], 10.3)
        self.assertEqual(profiles['zero']['1480'], 0)
        self.assertIsNone(profiles['missing']['1480'])
        self.assertIsNone(profiles['suppressed']['1478'])
        self.assertIsNone(profiles['flagged']['2225'])
        self.assertEqual(profiles['revised']['2225'], 0)

    def test_economy_retains_census_rent_and_burden(self):
        row = mvp.economy({'1480': 1070, '1478': 33.2})
        self.assertEqual(row['median_rent'], 1070)
        self.assertAlmostEqual(row['rent_burden'], .332)
        row = mvp.economy({'1480': 0, '1478': 0})
        self.assertEqual(row['median_rent'], 0)
        self.assertEqual(row['rent_burden'], 0)
        for profile in ({}, {'1480': None, '1478': None}):
            row = mvp.economy(profile)
            self.assertIsNone(row['median_rent'])
            self.assertIsNone(row['rent_burden'])

    def test_economy_retains_census_employment_and_unemployment(self):
        zero = mvp.economy({'2225': 0, '2230': 0})
        self.assertEqual(zero['employed'], 0)
        self.assertEqual(zero['unemployment'], 0)
        row = mvp.economy({'2225': 17321695, '2230': 10.3})
        self.assertEqual(row['employed'], 17321695)
        self.assertAlmostEqual(row['unemployment'], 0.103)
        self.assertIsNone(mvp.economy({'2225': None, '2230': None})['employed'])
        self.assertIsNone(mvp.economy({})['employed'])
        self.assertIsNone(mvp.economy({})['unemployment'])


if __name__ == '__main__':
    unittest.main()
