import base64
import json
import shutil
import subprocess
import unittest
from pathlib import Path


@unittest.skipUnless(shutil.which('node'), 'Node.js is needed to exercise the browser module')
class CityTypeLegendTests(unittest.TestCase):
    def test_present_types_translation_and_lens_coexistence(self):
        root = Path(__file__).resolve().parents[1]
        source = (root / 'web/js/ui/legend.js').read_text()
        source = source.replace("import {clearLens, getActiveLens, getBrush, setBrush, subscribe} from './lenses.js';", "const clearLens = () => {}, getActiveLens = () => ({name: {en: 'Population', fr: 'Population'}, type: 'categorical'}), getBrush = () => null, setBrush = () => {}, subscribe = () => {};")
        source = source.replace("import {lensPosition, lensColor, lensValue} from '../render/lenses.js';", "const lensPosition = () => 0, lensColor = () => '', lensValue = () => 0;")
        source = source.replace("import {renderCategoricalLegend} from '../render/categorical-lens.js';", "const renderCategoricalLegend = () => true;")
        source = source.replace("import {typeStyle} from './banners.js';", "const typeStyle = id => ({color: id ? '#aabbcc' : '#334455', icon: id ? 'MI' : '?' });")
        module = 'data:text/javascript;base64,' + base64.b64encode(source.encode()).decode('ascii')
        payload = json.loads((root / 'web/data/districts.json').read_text())
        script = r'''
import assert from 'node:assert/strict';
import {cityTypeEntries, init, onLang} from MODULE;
const payload = PAYLOAD;
const badges = new Set(Object.values(payload.cities).map(city => city.badge).filter(Boolean));
const en = cityTypeEntries(payload, 'en');
assert.deepEqual(new Set(en.filter(entry => entry.id).map(entry => entry.id)), badges);
assert.equal(en.filter(entry => entry.id === null).length, 1);
assert.equal(cityTypeEntries({types: payload.types, cities: {a: {badge: 'mining'}}}, 'fr')[0].name, 'Mines et extraction');
assert.equal(cityTypeEntries({types: payload.types, cities: {a: {badge: 'mining'}}}, 'en').length, 1);
class Node {
  constructor() { this.children = []; this.style = {setProperty() {}}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  addEventListener() {}
  get firstElementChild() { return this.children[0]; }
}
const root = new Node();
globalThis.document = {querySelector: () => root, createElement: () => new Node(), createTextNode: text => text};
globalThis.fetch = async () => ({ok: true, json: async () => payload});
await init({getLang: () => 'en'});
assert.equal(root.children[0].children[0].className, 'lens-legend');
let details = root.children[1].children[0];
assert.equal(details.children[0].textContent, 'City types');
assert.equal(details.children[1].children.length, en.length);
details.open = true;
onLang({getLang: () => 'fr'});
details = root.children[1].children[0];
assert.equal(details.open, true);
assert.equal(details.children[0].textContent, 'Types de ville');
assert.equal(root.children[0].children[0].className, 'lens-legend');
'''.replace('MODULE', repr(module)).replace('PAYLOAD', json.dumps(payload))
        result = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
