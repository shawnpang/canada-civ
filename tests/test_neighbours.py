import shutil
import subprocess
import unittest
from pathlib import Path


@unittest.skipUnless(shutil.which('node'), 'Node.js is needed to exercise the browser module')
class NeighboursTests(unittest.TestCase):
    def test_only_foreign_land_is_painted_and_fade_is_confined_to_layer(self):
        module = (Path(__file__).resolve().parents[1] / 'web/js/render/neighbours.js').as_uri()
        script = r'''
import assert from 'node:assert/strict';
import {paintNeighbours, NEIGHBOUR_COLOR} from MODULE;
let layer, paint;
function makeLayer() {
  const calls = [];
  paint = {calls, scale(...args) { calls.push(['scale', ...args]); },
    beginPath() { calls.push(['begin']); }, moveTo(...p) { calls.push(['move', ...p]); },
    lineTo() {}, closePath() {}, fill() { calls.push(['fill', this.fillStyle]); },
    createLinearGradient(...p) { const stops = []; calls.push(['gradient', p, stops]);
      return {addColorStop(...s) { stops.push(s); }}; },
    fillRect(...p) { calls.push(['mask', this.globalCompositeOperation, ...p]); }};
  return layer = {getContext: () => paint};
}
globalThis.document = {createElement: makeLayer};
const output = {draws: [], getTransform: () => ({a: 2, d: 2}),
  drawImage(...args) { this.draws.push(args); }};
const owner = Array(25).fill(0), water = Array(25).fill(0);
owner[12] = -2; owner[13] = -2; water[13] = 3; owner[11] = -1;
const world = {grid: {rows: 5, cols: 5, radius: 25}, owner, water};
paintNeighbours(output, world, {width: 500, height: 400, scale: 1, ox: 50, oy: 50});
assert.equal(NEIGHBOUR_COLOR, '#89847c');
assert.equal(layer.width, 1000); assert.equal(layer.height, 800);
assert.deepEqual(paint.calls.filter(c => c[0] === 'fill'), [['fill', NEIGHBOUR_COLOR]]);
assert.equal(paint.calls.filter(c => c[0] === 'mask').length, 4);
assert.ok(paint.calls.filter(c => c[0] === 'mask').every(c => c[1] === 'destination-in'));
assert.ok(paint.calls.filter(c => c[0] === 'gradient').every(c =>
  c[2][0][1] === 'rgba(0,0,0,0)' && c[2][1][1] === 'rgba(0,0,0,1)'));
assert.equal(output.draws.length, 1);
// A view with no visible foreign land and a zero scale never composites a layer.
paintNeighbours(output, world, {width: 10, height: 10, scale: 1, ox: 10000, oy: 10000});
paintNeighbours(output, world, {width: 500, height: 400, scale: 0, ox: 0, oy: 0});
assert.equal(output.draws.length, 1);
'''.replace('MODULE', repr(module))
        result = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
