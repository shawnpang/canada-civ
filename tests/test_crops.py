import json
from pathlib import Path
import unittest

from pipeline import crops

ROOT = Path(__file__).resolve().parents[1]


def row(cduid, crop, value, status='A', unit='Hectares', year='2021'):
    return {'REF_DATE': year, 'DGUID': '2021A0003' + cduid,
            'Field crops and hay': crop, 'Unit of measure': unit,
            'VALUE': value, 'STATUS': status}


class CropBuildTests(unittest.TestCase):
    def setUp(self):
        self.world = {'divisions': [{'cduid': '4701'}, {'cduid': '4702'}, {'cduid': '4703'}],
                      'division': [0, 0, 1, 2, -1, 0], 'owner': [0, 0, 0, 0, 0, -1],
                      'pct': {'crop': [20, 0, 30, 40, 30, 20]}}

    def test_cd_join_selection_and_missing_values(self):
        rows = [row('4701', 'Wheat, total', '100'), row('4701', 'Canola (rapeseed)', '200', 'E'),
                row('4701', 'Oats', '', 'F'), row('4702', 'Wheat, total', '0'),
                row('4702', 'Canola (rapeseed)', '', 'F'),
                row('4703', 'Wheat, total', '999', unit='Acres'),
                row('4703', 'Wheat, total', '888', year='2016')]
        data = crops.build(self.world, rows)
        self.assertEqual(data['cells'], [{'cell': 0, 'crop': 'canola'}])
        self.assertEqual(data['divisions']['4701']['canola'], {'hectares': 200, 'quality': 'E'})
        self.assertEqual(data['divisions']['4701']['oats'], {'hectares': None, 'quality': 'F'})
        self.assertEqual(data['divisions']['4702']['wheat']['hectares'], 0)
        self.assertIsNone(data['divisions']['4703']['wheat']['hectares'])
        self.assertIsNone(data['divisions']['4703']['wheat']['quality'])

    def test_duplicate_observation_fails(self):
        observation = row('4701', 'Oats', '10')
        with self.assertRaises(ValueError):
            crops.build(self.world, [observation, observation])

    def test_shipped_join_and_catalogue(self):
        world = json.loads((ROOT / 'web/data/world.json').read_text())
        resources = json.loads((ROOT / 'web/data/resources.json').read_text())
        data = resources['crops']
        sources = json.loads((ROOT / 'web/data/sources.json').read_text())
        self.assertTrue(any(s['id'] == crops.SOURCE and len(s['files'][0]['sha256']) == 64 for s in sources))
        self.assertTrue(data['cells'])
        for item in data['cells']:
            cell = item['cell']
            self.assertGreaterEqual(world['owner'][cell], 0)
            self.assertGreater(world['pct']['crop'][cell], 0)
            cduid = world['divisions'][world['division'][cell]]['cduid']
            self.assertGreater(data['divisions'][cduid][item['crop']]['hectares'], 0)
        self.assertIsNone(data['divisions']['6001']['wheat']['hectares'])
        self.assertIn('not field locations', data['rules']['en'])

    def test_merge_is_idempotent(self):
        resources = {'rules': {'en': 'Existing', 'fr': 'Existant'}, 'sources': [], 'vintage': {}}
        result = crops.merge(resources, [], {}, {'id': crops.SOURCE})
        result = crops.merge(resources, result, {}, {'id': crops.SOURCE})
        self.assertEqual(resources['sources'], [crops.SOURCE])
        self.assertEqual(len(result), 1)
        self.assertEqual(resources['rules']['en'].count('Crop symbols are schematic'), 1)


if __name__ == '__main__':
    unittest.main()
