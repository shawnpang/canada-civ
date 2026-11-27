import base64
import shutil
import subprocess
import unittest
from pathlib import Path


@unittest.skipUnless(shutil.which('node'), 'Node.js is needed to exercise the browser module')
class ArcticArtTests(unittest.TestCase):
    def test_cover_boundaries_and_odd_row_neighbours(self):
        path = Path(__file__).resolve().parents[1] / 'web/js/render/art/arctic.js'
        module = 'data:text/javascript;base64,' + base64.b64encode(path.read_bytes()).decode('ascii')
        script = r'''
import assert from 'node:assert/strict';
import {arcticFarColor as color} from MODULE;
const palette = ['#81936d','#839b63','#526f4d','#718c60','#a1a47b','#b4a979',
  '#a4a575','#bea96b','#849b79','#aaa487','#aaa998','#e0e7df'];
const world = () => ({grid:{rows:65,cols:5,radius:25},
  owner:Array(325).fill(0), water:Array(325).fill(0), cover:Array(325).fill(4)});
const w = world(), at = (r,c) => r*5+c;
assert.equal(color(w, -1, 0, palette), null);
assert.equal(color(w, 64, 2, palette), null); // south of the cool band
for (const cover of [0,1,2,3,6,7,8,9]) {
  w.cover[at(1,2)] = cover;
  assert.equal(color(w, 1, 2, palette), null);
}
w.cover[at(1,2)] = 11;
assert.equal(color(w, 1, 2, palette), palette[11]);
w.water[at(1,2)] = 2;
assert.equal(color(w, 1, 2, palette), null);
w.water[at(1,2)] = 0; w.owner[at(1,2)] = -2;
assert.equal(color(w, 1, 2, palette), null);
w.owner[at(1,2)] = 0; w.cover[at(1,2)] = 4;
const base = color(w, 1, 2, palette);
assert.equal(color(w, 1, 2, palette), base);
// Odd row 1 has lower-right neighbour (2,3); row 2 has (3,2).
for (const [row, col, nr, nc] of [[1,2,2,3],[2,2,3,2]]) {
  const a = world(), j = at(nr,nc), before = color(a,row,col,palette);
  a.cover[j] = 10;
  assert.notEqual(color(a,row,col,palette), before);
  a.water[j] = 1;
  const water = color(a,row,col,palette);
  a.cover[j] = 11;
  assert.equal(color(a,row,col,palette), water);
  a.water[j] = 0; a.owner[j] = -2; a.cover[j] = 10;
  const foreign = color(a,row,col,palette);
  a.cover[j] = 11;
  assert.equal(color(a,row,col,palette), foreign);
  a.owner[j] = 0;
  for (const excluded of [1,7,11]) {
    a.cover[j] = excluded;
    assert.equal(color(a,row,col,palette), foreign);
  }
}
'''.replace('MODULE', repr(module))
        result = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
