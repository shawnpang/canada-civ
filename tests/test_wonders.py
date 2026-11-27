import csv
import io
import json
from pathlib import Path
import unittest

from pipeline import wonders


ROOT = Path(__file__).resolve().parents[1]


def csv_bytes(rows):
    buffer = io.StringIO(newline='')
    writer = csv.writer(buffer, lineterminator='\r\n')
    writer.writerow(['Place', '2025-26 FY Attendance'])
    writer.writerows(rows)
    return buffer.getvalue().encode('cp1252')


def row(name, count, category):
    return {'name': {'en': name, 'fr': 'FR ' + name},
            'attendance': count, 'category': category}


class AttendanceTests(unittest.TestCase):
    def test_missing_and_zero_are_distinct(self):
        for value in ('UR', 'TC', '', None):
            with self.subTest(value=value):
                self.assertIsNone(wonders.parse_attendance(value))
        self.assertEqual(wonders.parse_attendance('0'), 0)
        self.assertEqual(wonders.parse_attendance('1,234,567'), 1234567)
        self.assertEqual(wonders.parse_attendance('1 234 567'), 1234567)

    def test_bilingual_rows_use_cp1252_and_do_not_turn_missing_into_zero(self):
        en = csv_bytes([('Banff National Park', '4,558,171'),
                        ('Gros Morne National Park', 'UR'),
                        ('Cape Spear Lighthouse National Historic Site', '0'),
                        ('Fortifications of Québec National Historic Site', '1')])
        fr = csv_bytes([('Parc national Banff', '4 558 171'),
                        ('Parc national du Gros Morne', 'UR'),
                        ('Lieu historique national du Phare-de-Cap-Spear', '0'),
                        ('Lieu historique national des Fortifications-de-Québec', '1')])
        rows = wonders.parse_rows(en, fr)
        self.assertEqual(len(rows), 4)
        self.assertEqual(rows[0]['name'], {'en': 'Banff National Park', 'fr': 'Parc national Banff'})
        self.assertEqual(rows[0]['attendance'], 4558171)
        self.assertEqual(rows[0]['category'], 'national_park')
        self.assertIsNone(rows[1]['attendance'])
        self.assertEqual(rows[2]['attendance'], 0)
        self.assertEqual(rows[2]['category'], 'historic_site')
        self.assertEqual(rows[3]['name']['fr'], 'Lieu historique national des Fortifications-de-Québec')

    def test_misaligned_bilingual_inputs_are_rejected(self):
        en = csv_bytes([('Banff National Park', '100'), ('Jasper National Park', '200')])
        with self.assertRaises(ValueError):
            wonders.parse_rows(en, csv_bytes([('Parc national Banff', '100')]))
        with self.assertRaises(ValueError):
            wonders.parse_rows(en, csv_bytes([('Parc national Banff', '200'),
                                              ('Parc national Jasper', '100')]))

    def test_combined_park_is_not_treated_as_one_park(self):
        en = csv_bytes([('Mount Revelstoke & Glacier National Parks', '834,939'),
                        ('Cape Spear Lighthouse National Historic Site', '1')])
        fr = csv_bytes([('Parcs nationaux des Glaciers et du Mont-Revelstoke', '834 939'),
                        ('Lieu historique national du Phare-de-Cap-Spear', '1')])
        rows = wonders.parse_rows(en, fr)
        self.assertEqual(rows[0]['category'], 'excluded')
        self.assertEqual(wonders.select_ranked(rows, 'national_park', 12), [])

    def test_missing_historic_section_marker_is_rejected(self):
        en = csv_bytes([('Banff National Park', '100')])
        fr = csv_bytes([('Parc national Banff', '100')])
        with self.assertRaises(ValueError):
            wonders.parse_rows(en, fr)

    def test_rankings_are_independent_deterministic_and_skip_missing(self):
        rows = [row('Z National Park', 10, 'national_park'),
                row('A National Park', 10, 'national_park'),
                row('Missing National Park', None, 'national_park'),
                row('Zero National Park', 0, 'national_park'),
                row('Big Historic Site', 1000, 'historic_site'),
                row('Combined parks', 2000, 'excluded')]
        parks = wonders.select_ranked(rows, 'national_park', 3)
        self.assertEqual([r['name']['en'] for r in parks],
                         ['A National Park', 'Z National Park', 'Zero National Park'])
        historic = wonders.select_ranked(rows, 'historic_site', 3)
        self.assertEqual([r['name']['en'] for r in historic], ['Big Historic Site'])


class WondersBuildTests(unittest.TestCase):
    def test_build_preserves_unavailable_landmark_attendance(self):
        world = json.loads((ROOT / 'web/data/world.json').read_text())
        rows = [row('Banff National Park', 42, 'national_park'),
                row('Unknown National Park', None, 'national_park')]
        locations = {'Banff National Park': (-115.57, 51.18),
                     'Unknown National Park': (-115.5, 51.1)}
        landmarks = [{'name': {'en': 'Example landmark', 'fr': 'Monument exemple'},
                      'lon': -79.38, 'lat': 43.64, 'source': 'example'}]
        payload = wonders.build(world, rows, locations, landmarks)
        self.assertTrue(payload['rules'])
        items = payload['items']
        self.assertEqual({i['type'] for i in items}, {'national_park', 'landmark'})
        self.assertFalse(any(i['name']['en'] == 'Unknown National Park' for i in items))
        landmark = next(i for i in items if i['type'] == 'landmark')
        self.assertIsNone(landmark['attendance'])

    def test_ranked_site_without_location_remains_listed(self):
        world = json.loads((ROOT / 'web/data/world.json').read_text())
        rows = [row('Missing location National Park', 123, 'national_park')]
        payload = wonders.build(world, rows, {}, [])
        self.assertEqual(len(payload['items']), 1)
        item = payload['items'][0]
        self.assertEqual(item['attendance'], 123)
        self.assertEqual(item['rank'], 1)
        self.assertEqual((item['x'], item['y'], item['cell']), (None, None, None))

    def test_shipped_payload_rules_ranks_and_positions(self):
        world = json.loads((ROOT / 'web/data/world.json').read_text())
        payload = json.loads((ROOT / 'web/data/wonders.json').read_text())
        groups = {category: [item for item in payload['items'] if item['type'] == category]
                  for category in ('national_park', 'historic_site', 'landmark')}
        self.assertEqual(sum(map(len, groups.values())), len(payload['items']))
        self.assertEqual(len(groups['national_park']), 12)
        self.assertEqual(len(groups['historic_site']), 10)
        self.assertGreater(len(groups['landmark']), 0)
        self.assertLessEqual(len(groups['landmark']), 12)
        self.assertEqual({rule['id'] for rule in payload['rules']},
                         {'national_park', 'historic_site', 'landmark', 'universities', 'caveat'})
        for rule in payload['rules']:
            self.assertTrue(rule['en'])
            self.assertTrue(rule['fr'])
        for category in ('national_park', 'historic_site'):
            ranked = groups[category]
            self.assertEqual([item['rank'] for item in ranked], list(range(1, len(ranked) + 1)))
            self.assertTrue(all(isinstance(item['attendance'], int) and item['attendance'] >= 0
                                for item in ranked))
            self.assertEqual([item['attendance'] for item in ranked],
                             sorted((item['attendance'] for item in ranked), reverse=True))
        limit = world['grid']['cols'] * world['grid']['rows']
        for item in payload['items']:
            with self.subTest(name=item['name']['en']):
                self.assertTrue(item['name']['en'])
                self.assertTrue(item['name']['fr'])
                if item['type'] == 'landmark':
                    self.assertIsNone(item['attendance'])
                    self.assertIsNone(item['rank'])
                position = (item['x'], item['y'], item['cell'])
                if any(value is None for value in position):
                    self.assertEqual(position, (None, None, None))
                else:
                    self.assertGreaterEqual(item['x'], 0)
                    self.assertLessEqual(item['x'], world['width'])
                    self.assertGreaterEqual(item['y'], 0)
                    self.assertLessEqual(item['y'], world['height'])
                    self.assertGreaterEqual(item['cell'], 0)
                    self.assertLess(item['cell'], limit)


if __name__ == '__main__':
    unittest.main()
