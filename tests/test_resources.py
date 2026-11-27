import json
from pathlib import Path
import unittest

from pipeline import resources

ROOT = Path(__file__).resolve().parents[1]


def generation(capacity, lon=-91.5, lat=49):
    return {'geometry':{'x':lon,'y':lat}, 'attributes':{'MEGAWATTS':capacity, 'STATION':'Example', 'STATION_OW':None, 'COM_DATE2':None, 'PROVTERR':'ON'}}


def mine():
    return {'geometry':{'x':-91.5,'y':49}, 'attributes':{'operation_name_en':'Example mine', 'province_en':'Ontario', 'product_en_spelt':None, 'operator_owners_en':None, 'facilities_code_en_spelt':None}}


class ResourceBuildTests(unittest.TestCase):
    def setUp(self):
        self.world=json.loads((ROOT/'web/data/world.json').read_text())
        self.inputs={name:[] for name,_ in resources.paths()}

    def test_cutoff_is_inclusive_and_missing_capacity_is_not_zero(self):
        self.inputs['resources-generation-1.json']=[generation(99.9), generation(100), generation(None)]
        self.inputs['resources-mines-3.json']=[mine()]
        result=resources.build(self.world,self.inputs)
        self.assertEqual([item['value'] for item in result['items']], [100,None])
        self.assertEqual(result['summary']['mapped_generating_capacity_mw'],100)
        self.assertIsNone(resources.clean('not available / non disponible'))
        self.assertEqual(result['summary']['mapped_sites'],2)
        self.assertIn('100 MW',result['rules']['en'])
        self.assertIn('100 MW',result['rules']['fr'])
        self.assertTrue(all(t['description']['en'] and t['description']['fr'] for t in result['types']))
        self.assertTrue(all(item['city'] is None for item in result['items']))

    def test_invalid_coordinates_are_not_mapped(self):
        self.inputs['resources-generation-2.json']=[generation(100,0,0),generation(100,None,49)]
        self.assertEqual(resources.build(self.world,self.inputs)['items'],[])

    def test_arcgis_errors_and_truncated_results_fail(self):
        for response in ({'error':{'code':500}}, {'features':[], 'exceededTransferLimit':True}, {}):
            with self.subTest(response=response), self.assertRaises(ValueError):
                resources.validate_response(response,'input')

    def test_shipped_payload_has_consistent_cells_and_counts(self):
        data=json.loads((ROOT/'web/data/resources.json').read_text())
        self.assertEqual(data['summary']['mapped_sites'],len(data['items']))
        self.assertEqual(sum(data['summary']['mapped_by_type'].values()),len(data['items']))
        limit=self.world['grid']['cols']*self.world['grid']['rows']
        self.assertTrue(all(0 <= i['cell'] < limit for i in data['items']))
        self.assertTrue(any(i['type']=='oil_sands' for i in data['items']))
        self.assertTrue(any(i['type']=='hydro' for i in data['items']))


if __name__ == '__main__': unittest.main()
