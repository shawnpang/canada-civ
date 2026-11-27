import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pipeline import mvp_sources


class SourceProvenanceTests(unittest.TestCase):
    def test_unverified_cache_is_not_accepted_offline(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'data.csv'
            path.write_bytes(b'not official evidence')
            with patch.object(mvp_sources, 'ROOT', Path(temp)):
                with self.assertRaisesRegex(RuntimeError, 'unverified'):
                    mvp_sources._get(path, 'https://example.test/data', None, True)

    def test_valid_manifest_requires_same_request_and_hash(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'data.json'
            content = b'official cached bytes'
            path.write_bytes(content)
            body = [{'productId': 1}]
            entry = {'url': 'https://example.test', 'request_body': body,
                     'sha256': hashlib.sha256(content).hexdigest()}
            self.assertTrue(mvp_sources._valid(path, entry, entry['url'], body))
            self.assertFalse(mvp_sources._valid(path, entry, entry['url'], []))
            path.write_bytes(b'changed')
            self.assertFalse(mvp_sources._valid(path, entry, entry['url'], body))

    def test_cd_pages_require_all_distinct_official_ids(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            pages = []
            for offset in range(0, 293, 25):
                path = root / f'page-{offset}.json'
                features = [{'attributes': {'CDUID': str(i)}}
                            for i in range(offset, min(offset + 25, 293))]
                path.write_text(json.dumps({'features': features}))
                pages.append({'file': path.name})
            with patch.object(mvp_sources, 'ROOT', root):
                combined = mvp_sources._combine_pages(pages)
                self.assertEqual(len(combined['features']), 293)
                last = root / pages[-1]['file']
                data = json.loads(last.read_text())
                data['features'][0]['attributes']['CDUID'] = '0'
                last.write_text(json.dumps(data))
                with self.assertRaisesRegex(ValueError, '293 distinct CDs'):
                    mvp_sources._combine_pages(pages)

    def test_catalogue_includes_only_consumed_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'census'
            source.mkdir()
            path = source / 'used.csv'
            path.write_bytes(b'used')
            manifest = {'id': 'census', 'files': [
                {'file': 'used.csv', 'url': 'https://example.test/used',
                 'sha256': hashlib.sha256(b'used').hexdigest()},
                {'file': 'unused.csv', 'url': 'https://example.test/unused'}]}
            (source / 'manifest.json').write_text(json.dumps(manifest))
            with patch.object(mvp_sources, 'RAW', root):
                result = mvp_sources.catalogue({'census': ['used.csv']})
            self.assertEqual(len(result[0]['files']), 1)
            self.assertEqual(result[0]['files'][0]['file'], 'data/raw/census/used.csv')


if __name__ == '__main__':
    unittest.main()
