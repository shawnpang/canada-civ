import unittest
from pipeline.core.relief import classify_relief


class ReliefTest(unittest.TestCase):
    def test_thresholds_and_peak_mean(self):
        self.assertEqual(classify_relief([]), 0)
        self.assertEqual(classify_relief([1000, 1168]), 0)
        self.assertEqual(classify_relief([1000, 1170]), 1)
        self.assertEqual(classify_relief([1000, 1520]), 2)
        self.assertEqual(classify_relief([2300]), 2)
        self.assertEqual(classify_relief([2700]), 3)

    def test_low_flat_majority_eases_one_level(self):
        self.assertEqual(classify_relief([100, 110, 120, 1000, 1100]), 1)
        self.assertEqual(classify_relief([400, 410, 420, 1300, 1400]), 2)
        self.assertEqual(classify_relief([100, 110, 170, 1000, 1100]), 2)


if __name__ == '__main__':
    unittest.main()
