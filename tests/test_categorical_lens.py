import base64
import shutil
import subprocess
import unittest
from pathlib import Path


@unittest.skipUnless(shutil.which('node'), 'Node.js is needed to exercise the browser module')
class CategoricalLensTests(unittest.TestCase):
    def test_colours_legend_and_missing_values(self):
        path = Path(__file__).resolve().parents[1] / 'web/js/render/categorical-lens.js'
        module = 'data:text/javascript;base64,' + base64.b64encode(path.read_bytes()).decode('ascii')
        script = r'''
import assert from 'node:assert/strict';
import {categoricalColor, renderCategoricalLegend} from MODULE;
const lens = {type: 'categorical', categories: [
  {value: 'a', name: {en: 'Party A', fr: 'Parti A'}, color: '#aabbcc'},
  {value: 'b', name: {en: 'Party B', fr: 'Parti B'}, color: '#123456'}
]};
assert.equal(categoricalColor(lens, 'a'), '#aabbcc');
assert.equal(categoricalColor(lens, 'b'), '#123456');
for (const value of [null, undefined, 'unknown', 0]) assert.equal(categoricalColor(lens, value), null);
assert.equal(categoricalColor({...lens, type: 'linear'}, 'a'), null);
assert.equal(categoricalColor({...lens, categories: [{value: 'a', color: 'red'}]}, 'a'), null);
globalThis.document = {
  createElement: () => ({style: {}, children: [], setAttribute() {}, append(...children) { this.children.push(...children); }}),
  createTextNode: text => text,
};
const panel = {children: [], append(row) { this.children.push(row); }};
assert.equal(renderCategoricalLegend(panel, lens, 'fr'), true);
assert.deepEqual(panel.children.map(row => row.children[1]), ['Parti A', 'Parti B']);
assert.equal(panel.children[0].children[0].style.background, '#aabbcc');
assert.equal(renderCategoricalLegend(panel, {type: 'linear'}, 'en'), false);
'''.replace('MODULE', repr(module))
        result = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
