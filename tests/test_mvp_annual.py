"""Annual estimates must never be mixed with census counts for growth."""
import unittest
from unittest.mock import patch

from pipeline import mvp_annual


class AnnualPopulationTests(unittest.TestCase):
    def test_growth_uses_estimates_and_preserves_census_population(self):
        row = {'population': 123}
        mvp_annual._assign(row, {'2021': 100, '2025': 120}, '17100148')
        self.assertEqual(row['population'], 120)
        self.assertEqual(row['census_population'], 123)
        self.assertAlmostEqual(row['growth'], .2)
        self.assertEqual(row['growth_years'], [2021, 2025])

    def test_missing_or_implausible_estimate_gives_null_growth(self):
        for series in ({'2021': 100}, {'2025': 120}, {'2021': 0, '2025': 120},
                       {'2021': 100, '2025': 301}):
            with self.subTest(series=series):
                row = {'population': 123}
                mvp_annual._assign(row, series, '17100148')
                self.assertIsNone(row['growth'])
                self.assertIsNone(row['growth_years'])

    def test_missing_latest_estimate_uses_documented_census_fallback(self):
        row = {'population': 123}
        mvp_annual._assign(row, {'2021': 100}, '17100148')
        self.assertEqual(row['population'], 123)
        self.assertIn('unavailable', row['population_vintage'])

    def test_selects_all_ages_and_total_gender_and_preserves_missing(self):
        base = {'REF_DATE': '2025', 'DGUID': '2021S0503535', 'Gender': 'Total - gender',
                'Age group': 'All ages', 'UOM': 'Persons', 'SCALAR_FACTOR': 'units', 'VALUE': '100'}
        other = dict(base, **{'Age group': '0 to 4 years', 'VALUE': '4'})
        missing = dict(base, DGUID='2021S0503935', VALUE='')
        with patch.object(mvp_annual, 'rows', return_value=iter([base, other, missing])):
            self.assertEqual(mvp_annual._series('17100148'), {'2021S0503535': {'2025': 100}})


if __name__ == '__main__':
    unittest.main()
