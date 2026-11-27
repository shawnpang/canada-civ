"""Town selection must use the published cutoff and preserve existing capitals."""
import json
import unittest
from pathlib import Path

from pipeline.ca_towns import include_town, select_population

ROOT = Path(__file__).resolve().parents[1]


class TownSelectionTests(unittest.TestCase):
    def test_estimate_takes_precedence_even_below_cutoff(self):
        population, vintage = select_population(12000, 9999)
        self.assertEqual((population, vintage), (9999, '2025'))
        self.assertFalse(include_town('123', '35', population))
        self.assertEqual(select_population(8000, 10000), (10000, '2025'))
        self.assertTrue(include_town('123', '35', 10000))

    def test_census_fallback_and_null(self):
        self.assertEqual(select_population(10000, None), (10000, '2021'))
        self.assertTrue(include_town('123', '35', 10000))
        self.assertFalse(include_town('123', '35', 9999))
        self.assertFalse(include_town('123', '35', None))
        self.assertIsNone(select_population(None, None)[0])

    def test_territorial_exceptions_and_capitals(self):
        for province in ('60', '61', '62'):
            with self.subTest(province=province):
                self.assertTrue(include_town('123', province, 1))
                self.assertTrue(include_town('123', province, None))
        for uid in ('990', '995'):
            self.assertFalse(include_town(uid, '60', 100000))

    def test_published_towns_do_not_duplicate_existing_city_ids(self):
        towns = json.loads((ROOT / 'web/data/towns.json').read_text())['towns']
        cities = json.loads((ROOT / 'web/data/cities.json').read_text())
        ids = [town['id'] for town in towns]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertFalse(set(ids) & {city['id'] for city in cities})

    def test_published_population_and_provenance(self):
        payload = json.loads((ROOT / 'web/data/towns.json').read_text())
        source_ids = {source['id'] for source in payload['sources']}
        self.assertEqual(payload['selection']['cutoff'], 10000)
        self.assertTrue(payload['selection']['en'] and payload['selection']['fr'])
        for town in payload['towns']:
            with self.subTest(uid=town['id']):
                expected, vintage = select_population(town['pop_series']['2021'],
                                                      town['pop_series']['2025'])
                self.assertEqual((town['population'], town['population_vintage']), (expected, vintage))
                self.assertIn(town['population_source'], source_ids)
                self.assertTrue(town['name']['en'] and town['name']['fr'])
                self.assertTrue(all(isinstance(town[key], (int, float)) for key in ('x', 'y')))
                if not set(town['provinces']) & {'YT', 'NT', 'NU'}:
                    self.assertGreaterEqual(town['population'], 10000)


if __name__ == '__main__':
    unittest.main()
