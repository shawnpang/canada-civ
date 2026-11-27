"""The Civ yield names must preserve the documented NAICS definitions."""
import unittest
from pipeline.mvp import YIELD_NAICS, combine_jobs


class YieldTests(unittest.TestCase):
    def test_industry_mapping(self):
        self.assertEqual(YIELD_NAICS, {
            'food': ['11'], 'production': ['21', '23', '31-33'],
            'science': ['51', '54'], 'culture': ['71'],
        })

    def test_suppression_is_not_silently_zeroed(self):
        jobs = {'21': 4, '23': 5, '31-33': 6}
        self.assertEqual(combine_jobs(jobs, YIELD_NAICS['production']), 15)
        jobs['23'] = None
        self.assertIsNone(combine_jobs(jobs, YIELD_NAICS['production']))
        del jobs['23']
        self.assertIsNone(combine_jobs(jobs, YIELD_NAICS['production']))
        self.assertEqual(combine_jobs({'11': 0}, YIELD_NAICS['food']), 0)
