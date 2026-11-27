import base64
import shutil
import subprocess
import unittest
from pathlib import Path


@unittest.skipUnless(shutil.which('node'), 'Node.js is needed to exercise the browser module')
class BorderTests(unittest.TestCase):
    def test_shared_edges_and_owner_classification(self):
        path = Path(__file__).resolve().parents[1] / 'web/js/render/borders.js'
        module = 'data:text/javascript;base64,' + base64.b64encode(path.read_bytes()).decode('ascii')
        script = r'''
import assert from 'node:assert/strict';
import {drawBorders} from MODULE;

// Collect the actual segments sent to Canvas, including cached Path2D paths.
class MockPath {
  constructor() { this.segments = []; this.point = null; }
  moveTo(x, y) { this.point = [x, y]; }
  lineTo(x, y) { this.segments.push([this.point, [x, y]]); this.point = [x, y]; }
}
globalThis.Path2D = MockPath;
class MockContext {
  constructor() { this.segments = []; this.path = new MockPath(); }
  save() {}
  restore() {}
  translate() {}
  scale() {}
  beginPath() { this.path = new MockPath(); }
  moveTo(...args) { this.path.moveTo(...args); }
  lineTo(...args) { this.path.lineTo(...args); }
  stroke(path = this.path) { this.segments.push(...path.segments); }
}
const R = 25, DX = Math.sqrt(3) * R;
const centre = (row, col) => [(col + .5 * (row & 1)) * DX, 1.5 * R * row];
const neighbours = (row, col) => {
  const shift = row & 1;
  return [[row,col+1], [row+1,col+shift], [row+1,col+shift-1],
    [row,col-1], [row-1,col+shift-1], [row-1,col+shift]];
};
const close = (a, b) => Math.abs(a - b) < 1e-7;
const pointClose = (a, b) => close(a[0], b[0]) && close(a[1], b[1]);
function checkPair(row, col, nr, nc, first, second, expected) {
  const world = {grid: {rows: 5, cols: 5, radius: R}, owner: Array(25).fill(-1)};
  world.owner[row * 5 + col] = first;
  world.owner[nr * 5 + nc] = second;
  const ctx = new MockContext();
  drawBorders(ctx, world, {width: 1000, height: 1000, scale: 1, ox: 0, oy: 0});
  if (!expected) {
    assert.equal(ctx.segments.length, 0, `unexpected edge for ${first}/${second}`);
    return;
  }
  // The shared edge bisects the segment between centres, is perpendicular to
  // it, and has the same length as a hex side. Either stroke direction and
  // duplicate strokes are acceptable.
  assert.ok(ctx.segments.length > 0, `missing edge for ${first}/${second}`);
  const a = centre(row, col), b = centre(nr, nc);
  const middle = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const vx = b[0] - a[0], vy = b[1] - a[1], distance = Math.hypot(vx, vy);
  const offset = [-vy * R / (2 * distance), vx * R / (2 * distance)];
  const ends = [middle.map((v, i) => v + offset[i]), middle.map((v, i) => v - offset[i])];
  for (const segment of ctx.segments) {
    assert.ok((pointClose(segment[0], ends[0]) && pointClose(segment[1], ends[1])) ||
      (pointClose(segment[0], ends[1]) && pointClose(segment[1], ends[0])),
      `incorrect shared edge: ${JSON.stringify(segment)} expected ${JSON.stringify(ends)}`);
  }
}
for (const row of [2, 3]) for (const [nr, nc] of neighbours(row, 2)) {
  for (const [a, b, expected] of [[0,1,true], [1,0,true], [0,-2,true], [-2,0,true],
    [0,0,false], [0,-1,false], [-1,0,false], [-2,-1,false], [-2,-2,false]]) {
    checkPair(row, 2, nr, nc, a, b, expected);
  }
}
'''.replace('MODULE', repr(module))
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
