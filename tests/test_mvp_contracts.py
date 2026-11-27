"""Exercise meaningful failures in the published atlas contract checker."""
import contextlib
import copy
import io
import tempfile
import unittest

from pipeline.mvp_check import CMA_IDS, LENSES, YIELDS, check, validate


def fixture():
    name = {'en': 'Example', 'fr': 'Exemple'}
    economics = {'population': 100, 'unemployment': None,
                 'gdp': None, 'jobs': {}, 'yields': {key: None for key in YIELDS}}
    owner = [0] * 44 + [-1, -2] + [-1] * (134 * 134 - 46)
    provinces = [dict(copy.deepcopy(economics), pruid=f'{i:02}', abbr=f'P{i}', name=name) for i in range(13)]
    city_ids = sorted(CMA_IDS) + ['990', '995', 'csd-6204003']
    cities = []
    for i, uid in enumerate(city_ids):
        capital = uid in ('990', '995', 'csd-6204003')
        cities.append(dict(copy.deepcopy(economics), id=uid, kind=('capital' if uid.startswith('csd-') else 'ca' if capital else 'cma'),
                           name=name, full=name, provinces=['ON', 'QC'] if uid == '505' else ['ON'],
                           capital=capital or uid == '505', metro=not capital, gdp=None, cell=i, footprint=[i]))
    definitions = [{'key': key, 'label': name, 'description': name,
                    'unit': 'cad' if key == 'gold' else 'workers'} for key in YIELDS]
    lenses = [{'id': key, 'name': name, 'unit': name, 'description': name, 'note': name,
               'source': 'official', 'format': 'pct', 'values': [None] * len(owner)}
              for key in sorted(LENSES | {'poverty'})]
    source = {'id': 'official', 'title': 'title', 'publisher': 'publisher', 'product_id': '1',
              'vintage': '2021', 'license': 'licence', 'homepage': 'https://example.test/',
              'used_for': 'data', 'files': [{'file': 'file', 'url': 'https://example.test/file',
                                           'retrieved': '2021', 'sha256': 'a' * 64, 'bytes': 1}]}
    return {'world': {'grid': {'cols': 134, 'rows': 134, 'radius': 25}, 'crs': 'EPSG:3347',
                      'owner': owner, 'provinces': provinces},
            'provinces': {'provinces': provinces}, 'cities': cities,
            'nation': {'year': 2021, 'vintage': 'Census 2021', 'nation': economics, 'yields': definitions},
            'lenses': {'lenses': lenses}, 'sources': [source]}


class AtlasContracts(unittest.TestCase):
    def setUp(self):
        self.data = fixture()
        self.assertEqual(validate(self.data), [])

    def assert_contract_fails(self, phrase):
        self.assertTrue(any(phrase in error for error in validate(self.data)), validate(self.data))

    def test_cma_membership_is_exact(self):
        self.data['cities'][0]['id'] = '999'
        self.assert_contract_fails('41 official 2021 CMAs')

    def test_iqaluit_is_not_a_fake_cma_or_gdp(self):
        iq = self.data['cities'][-1]
        iq['id'] = '999'
        self.assert_contract_fails('missing territorial capital csd-6204003')
        iq['id'] = 'csd-6204003'
        iq['gdp'] = 0
        self.assert_contract_fails('Iqaluit must be non-metro and have null GDP')

    def test_cad_and_lens_geography(self):
        next(y for y in self.data['nation']['yields'] if y['key'] == 'gold')['unit'] = 'usd'
        self.assert_contract_fails('gold must use CAD')
        self.data['lenses']['lenses'][0]['values'][-1] = 0.2
        self.assert_contract_fails('non-Canadian cells must be null')

    def test_missing_is_not_coerced_or_suppressed_in_source_metadata(self):
        self.data['sources'][0]['files'][0].pop('url')
        self.assert_contract_fails('missing file URL')
        self.data['cities'][0]['unemployment'] = 8.0
        self.assert_contract_fails('unemployment must be null or a fraction')

    def test_industry_suppression_and_real_zero(self):
        city = self.data['cities'][0]
        city['jobs'] = {'21': 4, '23': None, '31-33': 6, '11': 0}
        city['yields']['production'] = 10
        self.assert_contract_fails('production must match its industry inputs')
        city['yields']['production'] = None
        city['yields']['food'] = 0
        self.assertEqual(validate(self.data), [])

    def test_non_cma_gdp_cannot_be_fabricated(self):
        ca = next(c for c in self.data['cities'] if c['id'] == '990')
        ca['gdp'] = ca['yields']['gold'] = 0
        self.assert_contract_fails('non-CMA GDP and gold must be null')

    def test_missing_city_population_is_allowed(self):
        self.data['cities'][0]['population'] = None
        self.assertEqual(validate(self.data), [])

    def test_division_gdp_is_rejected(self):
        self.data['divisions'] = {'fields': ['cduid', 'gdp'], 'columns': {}}
        self.assert_contract_fails('GDP and gold columns')

    def test_sha256_must_be_valid(self):
        self.data['sources'][0]['files'][0]['sha256'] = 'invalid'
        self.assert_contract_fails('invalid SHA-256')

    def test_footprints_must_be_land_nonoverlapping(self):
        self.data['cities'][1]['footprint'].append(self.data['cities'][0]['cell'])
        self.assert_contract_fails('footprint overlaps another city')
        self.data['cities'][1]['footprint'].append(45)
        self.assert_contract_fails('invalid footprint cell')

    def test_missing_files_produce_failure_status(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(check(directory), 1)


if __name__ == '__main__':
    unittest.main()
