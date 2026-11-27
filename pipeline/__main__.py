"""Milestone 0 pipeline entry point."""
import argparse
import hashlib
import http.server
import json
import os
from pathlib import Path
import sys
import urllib.request
from datetime import datetime, timezone
from pipeline.core.geo import MapProjection
from pipeline.core.hexgrid import HexGrid

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'data/raw/statcan_boundaries_2021'
INTERIM = ROOT / 'data/interim'
WEB = ROOT / 'web'
URL = ('https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/'
       'MapServer/0/query?where=1%3D1&outFields=*&outSR=3347&geometryPrecision=0&maxAllowableOffset=1000&f=json')
INFO = {'id': 'statcan_boundaries_2021', 'title': '2021 Census cartographic boundary files: provinces and territories',
        'publisher': 'Statistics Canada', 'product_id': 'lpr_000b21s_e / 92-160-X', 'vintage': '2021',
        'license': 'Statistics Canada Open Licence', 'homepage': 'https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index2021-eng.cfm?year=21',
        'description': 'Official cartographic boundaries generalized to a 1000 metre tolerance by the service.',
        'used_for': 'Province and territory boundaries'}

def fetch(offline=False):
    RAW.mkdir(parents=True, exist_ok=True)
    target = RAW / 'provinces.json'
    manifest = RAW / 'manifest.json'
    if target.exists() and manifest.exists():
        print('Using cached', target.relative_to(ROOT)); return
    if offline:
        raise RuntimeError('offline cache missing boundary data or provenance manifest')
    request = urllib.request.Request(URL, headers={'User-Agent': 'CanadaCiv/0.0 (open data research)'})
    with urllib.request.urlopen(request, timeout=120) as response:
        content = response.read()
    data = json.loads(content)
    if len(data.get('features', [])) != 13 or any('rings' not in f.get('geometry', {}) for f in data.get('features', [])):
        raise ValueError('boundary service did not return 13 polygon features')
    tmp = target.with_suffix('.part')
    tmp.write_bytes(content); tmp.replace(target)
    meta = dict(INFO, files=[{'file': str(target.relative_to(ROOT)), 'url': URL,
               'retrieved': datetime.now(timezone.utc).isoformat(),
               'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)}])
    manifest.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
    print('Fetched', target.relative_to(ROOT), len(content), 'bytes')

def process():
    path = RAW / 'provinces.json'
    if not path.exists() or not (RAW / 'manifest.json').exists():
        raise RuntimeError('boundary source or manifest missing; run fetch first')
    data = json.loads(path.read_text())
    points = (p for f in data['features'] for r in f['geometry']['rings'] for p in r)
    minx = miny = float('inf'); maxx = maxy = float('-inf')
    for x, y in points:
        minx, miny, maxx, maxy = min(minx,x), min(miny,y), max(maxx,x), max(maxy,y)
    margin = 200000
    projection = MapProjection(minx - margin, maxy + margin)
    width = (maxx - minx + 2 * margin) / 1000
    height = (maxy - miny + 2 * margin) / 1000
    grid = HexGrid.covering(width, height)
    info = {'bounds_m': [minx,miny,maxx,maxy], 'projection': {'min_x': projection.min_x, 'max_y': projection.max_y},
            'width': width, 'height': height, 'margin': 200,
            'grid': {'cols': grid.cols, 'rows': grid.rows, 'radius': grid.radius}}
    INTERIM.mkdir(parents=True, exist_ok=True)
    (INTERIM / 'boundary_extent.json').write_text(json.dumps(info, indent=2) + '\n')
    print('Processed official boundaries:', grid.cols, 'x', grid.rows, '=', grid.cols * grid.rows, 'hexes')

def check():
    path = WEB / 'data/world.json'
    if not path.exists():
        print('FAIL: web/data/world.json is missing; Milestone 0 world has not been built')
        return 1
    print('FAIL: world validation is not implemented yet')
    return 1

def main():
    parser = argparse.ArgumentParser(description='Canada Civ data pipeline (Milestone 0, in progress)')
    parser.add_argument('command', choices=['fetch','process','build','check','serve','list','all','package'])
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    try:
        if args.command == 'fetch':
            from pipeline.mvp import fetch as fetch_atlas
            fetch(args.offline); fetch_atlas(args.offline)
        elif args.command == 'process': process()
        elif args.command == 'list': print(INFO['id'], '-', INFO['title'])
        elif args.command == 'check':
            from pipeline.world import check as validate
            from pipeline.mvp_check import check as validate_atlas
            world_status = validate()
            atlas_status = validate_atlas(WEB / 'data')
            return int(bool(world_status or atlas_status))
        elif args.command == 'build':
            from pipeline.world import build
            from pipeline.mvp import build as build_atlas
            build(); build_atlas()
        elif args.command == 'all':
            from pipeline.mvp import fetch as fetch_atlas, build as build_atlas
            fetch(args.offline); fetch_atlas(args.offline); process()
            from pipeline.world import build, check as validate
            from pipeline.mvp_check import check as validate_atlas
            build(); build_atlas()
            world_status = validate()
            atlas_status = validate_atlas(WEB / 'data')
            return int(bool(world_status or atlas_status))
        elif args.command == 'serve':
            os.chdir(WEB)
            http.server.ThreadingHTTPServer(('127.0.0.1', args.port), http.server.SimpleHTTPRequestHandler).serve_forever()
        else: raise RuntimeError('package is not implemented')
    except (OSError, ValueError, RuntimeError) as exc:
        print('FAIL:', exc, file=sys.stderr); return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
