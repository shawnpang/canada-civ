import json
from pathlib import Path
import unittest

from pipeline import districts

ROOT = Path(__file__).resolve().parents[1]


def complete_counts(city_total=100, national_total=100):
    national = {'total': national_total, **{code: 10 for _, code, _, _ in districts.SECTORS}}
    city = {'total': city_total, **{code: 10 for _, code, _, _ in districts.SECTORS}}
    return {'Canada': national, '123': city}


class DistrictTests(unittest.TestCase):
    def test_quotient_and_missing_or_zero_denominator(self):
        self.assertEqual(districts.quotient(20, 100, 10, 100), 2)
        self.assertEqual(districts.quotient(0, 100, 10, 100), 0)
        for inputs in ((None, 100, 10, 100), (20, None, 10, 100), (20, 0, 10, 100),
                       (20, 100, None, 100), (20, 100, 0, 100), (20, 100, 10, 0)):
            with self.subTest(inputs=inputs):
                self.assertIsNone(districts.quotient(*inputs))

    def test_inclusive_threshold_ranking_limit_and_tie_break(self):
        counts = complete_counts(city_total=200)
        # A 25/200 city share divided by a 10/100 national share is exactly 1.25.
        counts['123'].update({'11': 25, '21': 40, '22': 40, '23': 40, '31-33': 24})
        result = districts.build([{'id': '123'}], counts)
        city = result['cities']['123']
        self.assertEqual(city['districts'], [{'type': 'construction', 'lq': 2},
                                             {'type': 'mining', 'lq': 2},
                                             {'type': 'utilities', 'lq': 2}])
        self.assertEqual(city['badge'], 'construction')
        self.assertEqual(city['quotients']['agriculture'], 1.25)
        self.assertEqual(result['threshold'], 1.25)
        counts['123'].update({'21': 20, '22': 20, '23': 20})
        city = districts.build([{'id': '123'}], counts)['cities']['123']
        self.assertEqual(city['districts'], [{'type': 'agriculture', 'lq': 1.25}])

    def test_incomplete_input_is_not_misrepresented_as_no_specialisation(self):
        counts = complete_counts()
        counts['123']['11'] = None
        result = districts.build([{'id': '123'}, {'id': 'unavailable'}], counts)
        for city in result['cities'].values():
            self.assertIsNone(city['badge'])
            self.assertIsNone(city['districts'])
        self.assertIsNone(result['cities']['123']['quotients']['agriculture'])
        self.assertTrue(all(v is None for v in result['cities']['unavailable']['quotients'].values()))

    def test_complete_data_with_no_qualifying_sector(self):
        city = districts.build([{'id': '123'}], complete_counts())['cities']['123']
        self.assertEqual(city['districts'], [])
        self.assertIsNone(city['badge'])

    def test_shipped_rules_sources_and_cities(self):
        data = json.loads((ROOT / 'web/data/districts.json').read_text())
        cities = json.loads((ROOT / 'web/data/cities.json').read_text())
        source = json.loads((ROOT / 'web/data/sources-districts.json').read_text())[0]
        self.assertEqual(set(data['cities']), {city['id'] for city in cities})
        self.assertEqual(data['sources'], [source['id']])
        self.assertEqual(source['product_id'], '98-10-0594-01')
        self.assertEqual(source['vintage'], '2021 Census')
        self.assertIn('1.25', data['rules']['en'])
        self.assertIn('1,25', data['rules']['fr'])
        self.assertIn('schematic', data['rules']['en'])
        self.assertTrue(all(t['name']['en'] and t['name']['fr'] for t in data['types']))
        self.assertIsNone(data['cities']['csd-6204003']['districts'])
        self.assertIsNone(data['cities']['csd-6204003']['badge'])
        self.assertTrue(any(city['districts'] for city in data['cities'].values()))
        for city in data['cities'].values():
            if city['districts'] is not None:
                self.assertEqual(city['badge'], city['districts'][0]['type'] if city['districts'] else None)
                self.assertLessEqual(len(city['districts']), data['maximum_districts'])
                self.assertTrue(all(d['lq'] >= data['threshold'] for d in city['districts']))


if __name__ == '__main__':
    unittest.main()
