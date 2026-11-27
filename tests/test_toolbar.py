import base64
import shutil
import subprocess
import unittest
from pathlib import Path


@unittest.skipUnless(shutil.which('node'), 'Node.js is needed to exercise the browser module')
class ToolbarTests(unittest.TestCase):
    def test_lens_shortcuts_keep_names_and_selection_in_both_languages(self):
        path = Path(__file__).resolve().parents[1] / 'web/js/ui/lenses.js'
        module = 'data:text/javascript;base64,' + base64.b64encode(path.read_bytes()).decode('ascii')
        script = r'''
import assert from 'node:assert/strict';
import * as lenses from MODULE;
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.listeners = {}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, action) { this.listeners[name] = action; }
  querySelector() { return null; }
}
const root = new Element('div');
globalThis.document = {
  createElement: tag => new Element(tag),
  querySelector: selector => selector === '#lens-bar' ? root : null,
  addEventListener() {}
};
let lang = 'en', selected = null;
const ctx = {
  getLang: () => lang,
  getHash: () => new URLSearchParams(),
  setHashKeys: value => { selected = value.lens; },
  lenses: {lenses: [{id: 'density', name: {en: 'Population density', fr: 'Densité de population'}}]}
};
await lenses.init(ctx);
let dock = root.children[0];
let terrain = dock.children[0], density = dock.children[1], picker = dock.children[2].children[0];
assert.equal(terrain.attributes['aria-label'], 'Terrain');
assert.equal(density.attributes['aria-label'], 'Population density');
assert.equal(density.children[0].attributes['aria-hidden'], 'true');
assert.equal(picker.attributes['aria-label'], 'Lenses');
density.listeners.click();
assert.equal(selected, 'density');
assert.equal(lenses.getActiveLens().id, 'density');
assert.equal(root.children[0].children[1].attributes['aria-pressed'], 'true');
lang = 'fr';
lenses.onLang(ctx);
dock = root.children[0];
assert.equal(dock.children[0].attributes['aria-label'], 'Relief');
assert.equal(dock.children[1].attributes['aria-label'], 'Densité de population');
assert.equal(dock.children[2].children[0].attributes['aria-label'], 'Couches');
dock.children[0].listeners.click();
assert.equal(selected, null);
assert.equal(lenses.getActiveLens(), null);
'''.replace('MODULE', repr(module))
        result = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
