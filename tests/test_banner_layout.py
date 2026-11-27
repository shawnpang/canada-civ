import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(shutil.which('node'), 'Node.js is needed to exercise the browser module')
class BannerLayoutTests(unittest.TestCase):
    def test_landing_priority_and_zoom(self):
        # Copy the browser modules into an ES-module package for Node versions
        # that do not automatically detect ES modules in .js files.
        with tempfile.TemporaryDirectory() as temp:
            package = Path(temp)
            shutil.copytree(ROOT / 'web/js', package / 'js')
            (package / 'package.json').write_text('{"type":"module"}', encoding='utf-8')
            script = r'''
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {init, layoutBanners} from './js/ui/banners.js';
const data = name => JSON.parse(fs.readFileSync(`${process.argv[1]}/web/data/${name}.json`, 'utf8'));
const world = data('world'), cities = data('cities'), towns = data('towns');
globalThis.innerWidth = 1440; globalThis.innerHeight = 900; globalThis.location = {hash: ''};
const scale = Math.min(1440 / (world.width + 200), 805 / (world.height + 200));
const camera = {scale, ox: (1440 - world.width * scale) / 2, oy: 75 + (825 - world.height * scale) / 2};
const g = {font: '', save() {}, restore() {}, measureText(text) {
  return {width: Array.from(text).length * (this.font.includes('10px') ? 6 : 6.6)};
}};
const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const makeContext = (lang, view = camera) => ({world, cities, towns, ctx: g, getLang: () => lang, getCamera: () => view});
// Exercise the loaded badge widths used by the real landing view.
globalThis.document = {createElement: () => ({replaceChildren() {}}), querySelector: () => null};
globalThis.fetch = async () => ({ok: true, json: async () => data('districts')});
await init(makeContext('en'));
for (const lang of ['en', 'fr']) {
  const boxes = layoutBanners(makeContext(lang));
  const ids = boxes.map(box => String(box.city?.id));
  for (const id of ['535', '462', '933', '825', '505', '835', '602', '421', '205']) assert(ids.includes(id), `${lang}: missing ${id}`);
  assert(boxes.every(box => box.city), 'town labels must be hidden at home');
  for (const box of boxes) {
    const city = box.city;
    assert.equal(box.name, city.name[lang]);
    assert.equal(box.x, camera.ox + city.x * camera.scale);
    assert.equal(box.y, camera.oy + city.y * camera.scale);
    assert.equal(box.font, 'bold 10px Georgia, serif');
    for (const other of boxes) if (box !== other) assert(!overlap(box.collision, other.collision));
  }
  const populations = boxes.map(box => box.city.population ?? -1);
  assert(populations.every((population, index) => index === 0 || population <= populations[index - 1]));
}
location.hash = '#city=421';
assert.equal(layoutBanners(makeContext('en'))[0].city.id, '421');
location.hash = '';
const closer = {...camera, scale: camera.scale * 1.5};
assert(layoutBanners(makeContext('en', closer)).some(box => box.town), 'town labels return on zoom');
// A tiny province remains reserved for labels when towns are visible.
const tinyWorld = {width: 1000, height: 1000, grid: {cols: 1, rows: 1, radius: 25}, owner: [0], provinces: [{}]};
const tinyScale = Math.min(1440 / 1200, 805 / 1200) * 1.5;
const tinyCamera = {scale: tinyScale, ox: 300, oy: 300};
const tinyTown = {id: 'town', x: 0, y: 0, name: {en: 'Town'}, population: 10000};
const tiny = layoutBanners({world: tinyWorld, cities: [], towns: [tinyTown], ctx: g, getLang: () => 'en', getCamera: () => tinyCamera});
const reserved = {left: tinyCamera.ox - 35, right: tinyCamera.ox + 35, top: tinyCamera.oy - 21, bottom: tinyCamera.oy + 21};
assert.equal(tiny.length, 1);
assert(tiny.every(box => !overlap(box.collision, reserved)));
'''
            result = subprocess.run(
                ['node', '--input-type=module', '-e', script, '--', str(ROOT)],
                cwd=package, capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
