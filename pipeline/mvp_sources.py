"""Download and document the official sources used by the MVP builder.

Downloads are cached together with their exact requests, retrieval time and hash.
A file without a matching manifest is re-fetched: filesystem timestamps are not
reliable evidence of when or from where a file was obtained.
"""
import hashlib
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data' / 'raw'
LICENCE = 'Statistics Canada Open Licence; https://www.statcan.gc.ca/en/reference/licence'
BOUNDARIES = 'https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index2021-eng.cfm?year=21'
PROFILE = 'https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/index.cfm?Lang=E'
WDS = 'https://www150.statcan.gc.ca/t1/wds/rest/'


def _digest(data):
    return hashlib.sha256(data).hexdigest()


def _request(url, body=None, accept="*/*"):
    data = None if body is None else json.dumps(body, separators=(',', ':')).encode()
    headers = {'User-Agent': 'CanadaCiv/1.0 (open data atlas)', 'Accept': accept}
    if data is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=headers)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as response:
                return response.read()
        except OSError:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def _valid(path, entry, url, body):
    return (path.exists() and entry and entry.get('url') == url
            and entry.get('request_body') == body
            and entry.get('sha256') == _digest(path.read_bytes()))


def _get(path, url, previous, offline=False, body=None):
    if _valid(path, previous, url, body):
        return previous
    if offline:
        raise RuntimeError(f'offline cache missing or unverified: {path.relative_to(ROOT)}')
    accept = "text/csv" if path.suffix == ".csv" else "*/*"
    data = _request(url, body, accept)
    if len(data) < 100:
        raise ValueError(f'invalid source response for {url}')
    if path.suffix == '.csv':
        import csv
        import io
        headers = next(csv.reader(io.StringIO(data.decode('utf-8-sig'))), [])
        if not {'REF_AREA', 'CHARACTERISTIC', 'OBS_VALUE'}.issubset(headers):
            raise ValueError(f'invalid Census profile CSV response for {url}')
    if path.suffix == '.json':
        obj = json.loads(data)
        if isinstance(obj, dict) and 'error' in obj:
            raise ValueError(f'source service error: {obj["error"]}')
        if isinstance(obj, list) and any(x.get('status') != 'SUCCESS' for x in obj):
            raise ValueError(f'source returned unsuccessful results: {url}')
    if path.suffix == '.zip':
        import zipfile
        import io
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if archive.testzip() is not None:
                raise ValueError(f'corrupt ZIP response: {url}')
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.part')
    tmp.write_bytes(data)
    tmp.replace(path)
    result = {'file': str(path.relative_to(ROOT)), 'url': url,
              'retrieved': datetime.now(timezone.utc).isoformat(),
              'sha256': _digest(data), 'bytes': len(data)}
    if path.suffix == '.csv':
        result['request_headers'] = {'Accept': accept}
    if body is not None:
        result['request_body'] = body
    return result


def _read_manifest(path):
    return json.loads(path.read_text()) if path.exists() else {}


def _previous(manifest, path):
    # Older labor cache manifests use names relative to the source directory.
    return next((entry for entry in manifest.get('files', [])
                 if Path(entry['file']).name == path.name), None)


def _save(path, manifest):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')


def _page_url(url, offset):
    return url.replace('&f=json', f'&resultOffset={offset}&resultRecordCount=25&orderByFields=CDUID&f=json')


def _combine_pages(entries):
    pages = [json.loads((ROOT / entry['file']).read_text()) for entry in entries]
    features = [feature for page in pages for feature in page['features']]
    ids = [feature['attributes']['CDUID'] for feature in features]
    if len(features) != 293 or len(set(ids)) != 293:
        raise ValueError('Census division boundary pages must contain 293 distinct CDs')
    result = dict(pages[0], features=features)
    result.pop('exceededTransferLimit', None)
    return result


def _fetch_cd_pages(url, old, offline):
    from concurrent.futures import ThreadPoolExecutor
    offsets = list(range(0, 293, 25))
    def get_page(offset):
        dest = RAW / 'census2021' / f'geo4-page-{offset:03d}.json'
        return _get(dest, _page_url(url, offset), _previous(old, dest), offline)
    with ThreadPoolExecutor(max_workers=6) as executor:
        entries = list(executor.map(get_page, offsets))
    combined = _combine_pages(entries)
    (RAW / 'census2021' / 'geo4.json').write_text(json.dumps(combined, separators=(',', ':')))
    return entries


def fetch(offline=False, groups=None):
    """Fetch and validate MVP inputs; optional groups support resuming downloads."""
    from pipeline.mvp import urls
    definitions = {
        'census2021': ('statcan_census_2021_profile',
            '2021 Census profile and cartographic boundaries', '98-401-X; 92-160-X',
            PROFILE, '2021 Census', 'Census characteristics and 2021 geography'),
        'population': ('statcan_census_population', '2021 Census population and dwelling counts',
            '98-10-0001-01, 98-10-0002-01, 98-10-0005-01, 98-10-0007-01',
            'https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/hlt-fst/pd-pl/index-eng.cfm',
            '2021 Census', 'Population of census geographies'),
        'gdp': ('statcan_gdp', 'Gross domestic product at basic prices',
            '36-10-0468-01; 36-10-0711-01',
            'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610071101',
            'See output GDP year', 'National and provincial GDP in current Canadian dollars'),
    }
    for group, (sid, title, product, homepage, vintage, used) in definitions.items():
        if groups is not None and group not in groups:
            continue
        manifest_path = RAW / group / 'manifest.json'
        old = _read_manifest(manifest_path)
        entries = []
        manifest = {'id': sid, 'title': title, 'publisher': 'Statistics Canada',
                    'product_id': product, 'vintage': vintage, 'license': LICENCE,
                    'homepage': homepage, 'description': used, 'used_for': used,
                    'files': entries}
        for name, url in urls().items():
            if not name.startswith(group + '/'):
                continue
            path = RAW / name
            if name == 'census2021/geo4.json':
                entries.extend(_fetch_cd_pages(url, old, offline))
            else:
                entries.append(_get(path, url, _previous(old, path), offline))
            _save(manifest_path, manifest)
            print(f'  Verified {name}', flush=True)
        print(f'Fetched or verified {sid}: {len(entries)} files')
    if groups is None or "labour2021" in groups:
        fetch_labour(offline)


def fetch_labour(offline=False):
    directory = RAW / 'labour2021'
    path = directory / 'manifest.json'
    old = _read_manifest(path)
    meta_path = directory / 'metadata.json'
    meta_req = [{'productId': 98100594}]
    meta_entry = _get(meta_path, WDS + 'getCubeMetadata', _previous(old, meta_path), offline, meta_req)
    metadata = json.loads(meta_path.read_text())[0]['object']
    members = metadata['dimension'][0]['member']
    requests = [{'productId': 98100594,
                 'coordinate': f"{member['memberId']}.{industry}.1.1.1.1.2.0.0.0", 'latestN': 1}
                for member in members for industry in (4, 5, 7, 8, 12, 15, 20)]
    files = [meta_entry]
    for number, start in enumerate(range(0, len(requests), 200)):
        dest = directory / f'data-{number:02d}.json'
        files.append(_get(dest, WDS + 'getDataFromCubePidCoordAndLatestNPeriods',
                          _previous(old, dest), offline, requests[start:start+200]))
    manifest = {'id': 'statcan_labour_98100594',
                'title': 'Labour force status by occupation, industry, age and gender',
                'publisher': 'Statistics Canada', 'product_id': '98-10-0594-01',
                'vintage': '2021 Census', 'license': LICENCE,
                'homepage': 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810059401',
                'description': 'Employed labour force by industry of employment, place of residence',
                'used_for': 'Food, Production, Science and Culture yields', 'files': files}
    _save(path, manifest)
    print(f'Fetched or verified {manifest["id"]}: {len(files)} files')


def catalogue(used):
    """Return verified entries only for inputs consumed by the builder."""
    from pipeline.mvp import urls
    expected_urls = urls()
    output = []
    for group, names in used.items():
        manifest = _read_manifest(RAW / group / 'manifest.json')
        if not manifest:
            raise RuntimeError(f'missing source manifest for {group}; run fetch')
        entries = []
        for name in names:
            if group == 'census2021' and name == 'geo4.json':
                pages = []
                for offset in range(0, 293, 25):
                    page = RAW / group / f'geo4-page-{offset:03d}.json'
                    entry = _previous(manifest, page)
                    expected = _page_url(expected_urls['census2021/geo4.json'], offset)
                    if not entry or not _valid(page, entry, expected, None):
                        raise RuntimeError(f'missing or invalid provenance for {page}')
                    pages.append(entry)
                combined = _combine_pages(pages)
                if json.loads((RAW / group / name).read_text()) != combined:
                    raise RuntimeError('combined census division geometry differs from verified pages')
                entries.extend(pages)
                continue
            entry = _previous(manifest, RAW / group / name)
            expected = expected_urls.get(f'{group}/{name}', entry['url'] if entry else None)
            if not entry or not _valid(RAW / group / name, entry, expected, entry.get('request_body')):
                raise RuntimeError(f'missing or invalid provenance for {group}/{name}')
            entry = dict(entry)
            entry['file'] = f'data/raw/{group}/{name}'
            entries.append(entry)
        if group == 'census2021':
            profile = [x for x in entries if Path(x['file']).suffix == '.csv']
            boundaries = [x for x in entries if Path(x['file']).suffix == '.json']
            if profile:
                item = dict(manifest, id='statcan_census_2021_profile',
                            title='2021 Census Profile', product_id='98-401-X',
                            homepage=PROFILE, used_for='Population and Census profile measures', files=profile)
                output.append(item)
            if boundaries:
                item = dict(manifest, id='statcan_census_2021_geography',
                            title='2021 Census cartographic boundaries', product_id='92-160-X',
                            homepage=BOUNDARIES, used_for='Census division and CMA/CA geography', files=boundaries)
                output.append(item)
        elif group == 'gdp':
            for entry in entries:
                code = Path(entry['file']).stem
                suffix = 'cma' if code == '36100468' else 'pt_industry'
                title = 'GDP at basic prices by census metropolitan area' if suffix == 'cma' else 'GDP at basic prices by industry, provinces and territories'
                output.append(dict(manifest, id='statcan_gdp_' + suffix, title=title,
                                   product_id=code[:2]+'-'+code[2:4]+'-'+code[4:]+'-01',
                                   vintage='2022' if suffix == 'cma' else '2021',
                                   homepage='https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid='+code+'01',
                                   files=[entry]))
        else:
            manifest['files'] = entries
            output.append(manifest)
    return output
