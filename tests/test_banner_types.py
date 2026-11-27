import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(shutil.which('node'), 'Node.js is needed to exercise the browser module')
class BannerTypeTests(unittest.TestCase):
    def test_published_types_and_national_banner_rendering(self):
        script = r'''
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {init, layoutBanners, onRedraw, typeStyle} from './web/js/ui/banners.js';

const published = JSON.parse(readFileSync('web/data/districts.json', 'utf8'));
const known = new Set(published.types.map(type => type.id));
const used = new Set(Object.values(published.cities).map(city => city.badge).filter(Boolean));
for (const id of used) {
  assert.ok(known.has(id), `unknown published badge ${id}`);
  const first = typeStyle(id);
  assert.deepEqual(first, typeStyle(id), `unstable style for ${id}`);
  assert.match(first.color, /^#[0-9a-f]{6}$/i);
  assert.ok(first.icon, `missing icon for ${id}`);
}
assert.notEqual(typeStyle('agriculture').color, typeStyle('mining').color);
assert.deepEqual(typeStyle(null), typeStyle(undefined));
assert.deepEqual(typeStyle('not-a-published-type'), typeStyle(null));

const payload = {
  types: published.types,
  cities: {a: {badge: 'agriculture'}, b: {badge: 'mining'}, c: {badge: null}, d: {badge: null}}
};
globalThis.innerWidth = 1600;
globalThis.innerHeight = 1000;
globalThis.location = {hash: ''};
globalThis.document = {
  createElement: () => ({replaceChildren() {}, setAttribute() {}, append() {}}),
  querySelector: () => ({after() {}}),
};
globalThis.fetch = async () => ({ok: true, json: async () => payload});
const fills = [], strokes = [], texts = [];
const g = {
  path: [],
  save() {}, restore() {},
  measureText(text) { return {width: String(text).length * 6}; },
  beginPath() { this.path = []; },
  moveTo(x, y) { this.path.push(['M', x, y]); },
  lineTo(x, y) { this.path.push(['L', x, y]); },
  quadraticCurveTo(x1, y1, x2, y2) { this.path.push(['Q', x1, y1, x2, y2]); },
  closePath() { this.path.push(['Z']); },
  arc(x, y, radius) { this.path.push(['A', x, y, radius]); },
  fill() { fills.push({path: this.path.slice(), color: this.fillStyle}); },
  stroke() { strokes.push({path: this.path.slice()}); },
  fillText(text, x, y) { texts.push({text, x, y}); },
};
const cities = [
  {id: 'a', name: 'Alpha', x: 150, y: 500, population: 500000},
  {id: 'b', name: 'Bravo', x: 450, y: 500, population: 400000},
  {id: 'c', name: 'Charlie', x: 750, y: 500, population: 300000},
  {id: 'd', name: 'Delta', x: 1050, y: 500, population: 200000},
  // This smaller city shares Alpha's anchor; the larger one retains priority.
  {id: 'overlap', name: 'Overlap', x: 150, y: 500, population: 1000},
];
const camera = {ox: 20, oy: 30, scale: 1};
const ctx = {
  ctx: g, cities, towns: [], getLang: () => 'en', getCamera: () => camera,
  world: {width: 1400, height: 800, grid: {cols: 1, rows: 1, radius: 25}, owner: [], provinces: []},
};
await init(ctx);
const boxes = layoutBanners(ctx);
assert.deepEqual(boxes.map(box => box.city?.id), ['a', 'b', 'c', 'd']);
onRedraw(ctx);

for (const box of boxes) {
  const id = box.city.id;
  const badge = payload.cities[id].badge;
  const body = fills.find(fill => {
    if (!fill.path.some(part => part[0] === 'Q')) return false;
    const points = fill.path.filter(part => part[0] === 'M' || part[0] === 'L' || part[0] === 'Q');
    const xs = points.flatMap(part => part[0] === 'Q' ? [part[1], part[3]] : [part[1]]);
    const ys = points.flatMap(part => part[0] === 'Q' ? [part[2], part[4]] : [part[2]]);
    return Math.abs(Math.min(...xs) - box.left) < 0.1 && Math.abs(Math.max(...xs) - box.right) < 0.1 &&
      Math.abs(Math.min(...ys) - box.top) < 0.1;
  });
  assert.ok(body, `missing pill for ${id}`);
  assert.equal(body.color, typeStyle(badge).color, `wrong pill colour for ${id}`);
  if (badge) assert.ok(texts.some(item => item.text === typeStyle(badge).icon && item.x >= box.left && item.x <= box.right && item.y >= box.top && item.y <= box.bottom), `missing type icon for ${id}`);
  assert.ok(strokes.some(stroke => stroke.path.some(part => part[0] === 'L' && Math.abs(part[1] - box.x) < 0.01 && Math.abs(part[2] - box.y) <= 3)), `missing leader to official coordinate for ${id}`);
}
'''
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            cwd=ROOT, capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
