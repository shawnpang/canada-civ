"""Citizen distributions keep observed zero and missing data distinct."""
import csv
import json
import tempfile
from pathlib import Path
import unittest

from pipeline.citizens import build, build_theme, city_ref, largest_remainder, parse_count, read_profiles


class CountParsingTests(unittest.TestCase):
    def test_observed_counts_and_zero(self):
        self.assertEqual(parse_count('123'), 123)
        self.assertEqual(parse_count('0'), 0)
        self.assertEqual(parse_count(0), 0)

    def test_absent_suppressed_or_unparseable_counts_are_missing(self):
        for value in ('', None, 'x', '..', '-1', '1.5'):
            with self.subTest(value=value):
                self.assertIsNone(parse_count(value))
        self.assertIsNone(parse_count('0', flag='x'))


class PictogramRoundingTests(unittest.TestCase):
    def test_rounding_conserves_icons_and_ties_follow_category_order(self):
        self.assertEqual(largest_remainder([1, 1, 1], 20), [7, 7, 6])
        self.assertEqual(largest_remainder([100, 200, 300], 20), [3, 7, 10])
        self.assertEqual(sum(largest_remainder([39, 37, 24], 20)), 20)

    def test_observed_zero_has_zero_icons(self):
        self.assertEqual(largest_remainder([0, 25, 75], 20), [0, 5, 15])

    def test_missing_category_and_zero_total_do_not_invent_a_distribution(self):
        self.assertEqual(largest_remainder([0, None, 20], 20), [None, None, None])
        self.assertEqual(largest_remainder([0, 0, 0], 20), [None, None, None])


class ThemeMappingTests(unittest.TestCase):
    def setUp(self):
        # Values are keyed by StatCan characteristic ID, never by label or
        # position in an input CSV. Category order is the published order.
        self.categories = [
            {'id': 'first', 'characteristic': '101', 'label': {'en': 'First', 'fr': 'Premier'}},
            {'id': 'second', 'characteristic': '205', 'label': {'en': 'Second', 'fr': 'Deuxième'}},
            {'id': 'third', 'characteristic': '999', 'label': {'en': 'Third', 'fr': 'Troisième'}},
        ]

    def test_maps_characteristic_ids_and_preserves_observed_zero(self):
        theme = build_theme({'205': 25, '999': 0, '100': 100, '101': 75}, self.categories, '100')
        self.assertEqual(theme['total'], 100)
        self.assertEqual(theme['values'], [
            {'id': 'first', 'count': 75, 'icons': 15},
            {'id': 'second', 'count': 25, 'icons': 5},
            {'id': 'third', 'count': 0, 'icons': 0},
        ])

    def test_missing_category_keeps_count_null_and_all_icons_null(self):
        theme = build_theme({'100': 100, '101': 75, '999': 0}, self.categories, '100')
        self.assertIsNone(theme['values'][1]['count'])
        self.assertEqual([v['icons'] for v in theme['values']], [None, None, None])
        self.assertEqual(theme['values'][2]['count'], 0)

    def test_zero_total_does_not_invent_icons(self):
        theme = build_theme({'100': 0, '101': 75, '205': 25, '999': 0}, self.categories, '100')
        self.assertEqual([v['icons'] for v in theme['values']], [None, None, None])

    def test_missing_total_does_not_invent_icons(self):
        theme = build_theme({'101': 75, '205': 25, '999': 0}, self.categories, '100')
        self.assertIsNone(theme['total'])
        self.assertEqual([v['icons'] for v in theme['values']], [None, None, None])


class CityCoverageTests(unittest.TestCase):
    def test_ref_area_codes_keep_cma_ca_and_iqaluit_geographies_distinct(self):
        self.assertEqual(city_ref({'id': '535', 'kind': 'cma'}), '2021S0503535')
        self.assertEqual(city_ref({'id': '990', 'kind': 'ca'}), '2021S0504990')
        self.assertEqual(city_ref({'id': 'csd-6204003', 'kind': 'capital'}), '2021A00056204003')

    def test_census_characteristics_map_to_correct_cities_and_age_groups(self):
        cities = [{'id': '535', 'kind': 'cma'}, {'id': 'csd-6204003', 'kind': 'capital'}]
        profiles = {
            '2021S0503535': {'8': 100, '9': 20, '13': 60, '24': 20},
            '2021A00056204003': {'8': 200, '9': 50, '13': 100, '24': 50},
        }
        rows = build(profiles, cities)['cities']
        self.assertEqual([v['count'] for v in rows['535']['themes']['age']['values']], [20, 60, 20])
        self.assertEqual([v['icons'] for v in rows['535']['themes']['age']['values']], [4, 12, 4])
        self.assertEqual([v['count'] for v in rows['csd-6204003']['themes']['age']['values']], [50, 100, 50])
        self.assertTrue(all(v['count'] is None and v['icons'] is None
                            for v in rows['535']['themes']['commute']['values']))

    def test_all_five_themes_use_their_census_characteristic_ids(self):
        # Explicit IDs guard against accidentally substituting nested child or
        # unrelated profile characteristics when changing a category definition.
        expected = {
            'occupation': ('2248', ['2249', '2250', '2251', '2252', '2253', '2254', '2255', '2256', '2257', '2258']),
            'age': ('8', ['9', '13', '24']),
            'commute': ('2603', ['2604', '2607', '2608', '2609', '2610']),
            'education': ('1998', ['1999', '2000', '2002', '2008']),
            'origin': ('1513', ['1514', '1515', '1523']),
        }
        counts = {}
        for total, categories in expected.values():
            counts[total] = sum(range(1, len(categories) + 1))
            counts.update({characteristic: i for i, characteristic in enumerate(categories, 1)})
        row = build({'2021S0503535': counts}, [{'id': '535', 'kind': 'cma'}])['cities']['535']['themes']
        for theme_id, (_, categories) in expected.items():
            self.assertEqual([v['count'] for v in row[theme_id]['values']],
                             list(range(1, len(categories) + 1)), theme_id)
            self.assertEqual(sum(v['icons'] for v in row[theme_id]['values']), 20, theme_id)

    def test_read_profiles_preserves_suppression_and_absence(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'profile.csv'
            with path.open('w', encoding='utf-8', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=['REF_AREA', 'CHARACTERISTIC', 'OBS_VALUE', 'FLAG'])
                writer.writeheader()
                writer.writerows([
                    {'REF_AREA': '2021S0503535', 'CHARACTERISTIC': '8', 'OBS_VALUE': '100', 'FLAG': ''},
                    {'REF_AREA': '2021S0503535', 'CHARACTERISTIC': '9', 'OBS_VALUE': '0', 'FLAG': ''},
                    {'REF_AREA': '2021S0503535', 'CHARACTERISTIC': '13', 'OBS_VALUE': '', 'FLAG': 'x'},
                ])
            profiles = read_profiles([path])
        counts = profiles['2021S0503535']
        self.assertEqual(counts['9'], 0)
        self.assertIsNone(counts['13'])
        self.assertNotIn('24', counts)
        row = build(profiles, [{'id': '535', 'kind': 'cma'}])['cities']['535']['themes']['age']
        self.assertEqual([v['count'] for v in row['values']], [0, None, None])
        self.assertEqual([v['icons'] for v in row['values']], [None, None, None])

    def test_published_rows_cover_cities_and_have_complete_metadata(self):
        root = Path(__file__).resolve().parents[1]
        cities = json.loads((root / 'web/data/cities.json').read_text(encoding='utf-8'))
        payload = json.loads((root / 'web/data/citizens.json').read_text(encoding='utf-8'))
        self.assertEqual(set(payload['cities']), {city['id'] for city in cities})
        self.assertIn('csd-6204003', payload['cities'])
        self.assertEqual(payload['vintage'], '2021')
        self.assertIn('statcan_census_2021_profile', payload['source_ids'])
        self.assertTrue(all(payload['rules'].get(lang) for lang in ('en', 'fr')))
        themes = {theme['id']: theme for theme in payload['themes']}
        self.assertEqual(set(themes), {'occupation', 'age', 'commute', 'education', 'origin'})
        for theme in themes.values():
            for lang in ('en', 'fr'):
                self.assertTrue(theme['label'].get(lang))
                self.assertTrue(theme['universe'].get(lang))
                self.assertTrue(all(category['label'].get(lang) for category in theme['categories']))
        for city_id, city in payload['cities'].items():
            self.assertEqual(set(city['themes']), set(themes), city_id)
            for theme_id, row in city['themes'].items():
                values = row['values']
                self.assertEqual([v['id'] for v in values],
                                 [c['id'] for c in themes[theme_id]['categories']])
                if row['total'] is None or any(v['count'] is None for v in values):
                    self.assertTrue(all(v['icons'] is None for v in values), (city_id, theme_id))
                elif sum(v['count'] for v in values) > 0:
                    self.assertEqual(sum(v['icons'] for v in values), payload['pictograms_per_row'],
                                     (city_id, theme_id))


if __name__ == '__main__':
    unittest.main()
