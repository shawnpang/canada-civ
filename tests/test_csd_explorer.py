import csv
import hashlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

from pipeline import csd_explorer


def archive(path, language, rows):
    text = io.StringIO(newline='')
    writer = csv.writer(text, delimiter=',' if language == 'eng' else ';')
    writer.writerow(['header'] * 30)
    writer.writerows(rows)
    with ZipFile(path, 'w') as output:
        output.writestr('98100002.csv', text.getvalue())
    return hashlib.sha256(path.read_bytes()).hexdigest()


def row(uid, name, population, symbol='', growth='5.2'):
    values = [''] * 30
    values[1], values[2] = name, uid
    values[4], values[5] = population, symbol
    values[8], values[10], values[16], values[22], values[24] = growth, '10', '8', '12.34', '2.5'
    return values


class CensusSubdivisionExplorerTests(unittest.TestCase):
    def test_join_language_by_uid_and_preserve_suppression(self):
        with tempfile.TemporaryDirectory() as directory:
            en, fr = Path(directory) / 'en.zip', Path(directory) / 'fr.zip'
            one = row('2021A00051001186', 'Admirals Beach', '97')
            two = row('2021A00056204003', 'Iqaluit', '', '..')
            hashes = {'eng': archive(en, 'eng', [one, two]),
                      'fra': archive(fr, 'fra', [row('2021A00056204003', 'Iqaluit FR', '', '..'), row('2021A00051001186', 'Admirals FR', '97')])}
            with patch.dict(csd_explorer.HASHES, hashes):
                columns = csd_explorer.build(en, fr)['columns']
            self.assertEqual(columns['csduid'], ['1001186', '6204003'])
            self.assertEqual(columns['name'][0], {'en': 'Admirals Beach', 'fr': 'Admirals FR'})
            self.assertEqual(columns['population'], [97, None])
            self.assertAlmostEqual(columns['growth_census'][0], .052)
            self.assertEqual(columns['land_area'][0], 12.34)

    def test_flagged_values_are_not_mistaken_for_zero(self):
        data = row('2021A00051001186', 'Test', '0', 'E')
        self.assertIsNone(csd_explorer.numeric(data, 4))
        data[5] = ''
        self.assertEqual(csd_explorer.numeric(data, 4), 0)

    def test_rejects_unverified_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'bad.zip'
            path.write_bytes(b'not a verified source')
            with self.assertRaisesRegex(ValueError, 'SHA-256'):
                csd_explorer.read_rows(path, 'eng')


if __name__ == '__main__':
    unittest.main()
