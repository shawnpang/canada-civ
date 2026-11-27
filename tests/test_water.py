import base64
import shutil
import subprocess
import unittest
from pathlib import Path


@unittest.skipUnless(shutil.which('node'), 'Node.js is needed to exercise the browser module')
class WaterRendererTests(unittest.TestCase):
    def test_water_masks_and_shore_detail_at_each_zoom(self):
        root = Path(__file__).resolve().parents[1] / 'web/js/render'
        lod = 'data:text/javascript;base64,' + base64.b64encode(
            (root / 'art/lod.js').read_bytes()).decode('ascii')
        source = (root / 'water.js').read_text().replace("'./art/lod.js'", repr(lod))
        module = 'data:text/javascript;base64,' + base64.b64encode(
            source.encode()).decode('ascii')
        script = r'''
import assert from 'node:assert/strict';

// Record the same paths and clipping stack a Canvas uses. For the all-water
// fixture below, every contour is a hexagon, so point-in-polygon checks can
// verify which data classes actually receive each paint pass.
class Path {
  constructor() { this.contours = []; this.current = null; this.curves = 0; }
  moveTo(x, y) { this.current = [[x, y]]; this.contours.push(this.current); }
  lineTo(x, y) { this.current.push([x, y]); }
  closePath() {}
  quadraticCurveTo(_x, _y, x, y) { this.curves++; this.lineTo(x, y); }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x+w, y); this.lineTo(x+w, y+h); this.lineTo(x, y+h); }
  addPath(other) { this.contours.push(...other.contours.map(points => points.map(p => [...p]))); this.curves += other.curves; }
  contains(x, y) {
    return this.contours.some(points => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i], [xj, yj] = points[j];
        if ((yi > y) !== (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) inside = !inside;
      }
      return inside;
    });
  }
}
globalThis.Path2D = Path;
const {paintWater} = await import(MODULE);

class Canvas {
  constructor() { this.clips = []; this.stack = []; this.fills = []; this.strokes = []; }
  save() { this.stack.push([...this.clips]); }
  restore() { this.clips = this.stack.pop(); }
  translate() {} scale() {}
  clip(path) { this.clips.push(path); }
  fill() {}
  fillRect() { this.fills.push({style: this.fillStyle, clips: [...this.clips]}); }
  stroke(path) { this.strokes.push({path, style: this.strokeStyle}); }
  createLinearGradient() {
    return {stops: [], addColorStop(position, color) { this.stops.push([position, color]); }};
  }
}
const makeWorld = (water, cols) => ({grid: {cols, rows: water.length / cols}, water,
  owner: water.map(v => v ? -1 : 0), cover: water.map(() => 0)});
const paint = (world, scale) => {
  const ctx = new Canvas();
  paintWater(ctx, world, {width: 900, height: 600, scale, ox: 0, oy: 0});
  return ctx;
};
const covers = (fill, x, y) => fill.clips.every(path => path.contains(x, y));
const DX = Math.sqrt(3) * 25;
const centre = (row, col) => [(col + 0.5 * (row & 1)) * DX, row * 37.5];

// No land means the mask has no smoothing cutouts, allowing exact checks at
// cell centres independently of the renderer's palette choices.
const world = makeWorld([1,2,3, 3,1,2, 2,3,1], 3);
for (const scale of [0.15, 0.5, 1, 2]) {
  const ctx = paint(world, scale);
  assert.equal(ctx.fills.length, 7); // marine, shelf, four edge fades, lake
  const [ocean, shelf] = ctx.fills, lake = ctx.fills.at(-1);
  assert.notDeepEqual(ocean.style.stops, shelf.style.stops);
  assert.notDeepEqual(ocean.style.stops, lake.style.stops);
  assert.notDeepEqual(shelf.style.stops, lake.style.stops);
  for (let i = 0; i < world.water.length; i++) {
    const [x, y] = centre(Math.floor(i / 3), i % 3), flag = world.water[i];
    assert.equal(covers(ocean, x, y), flag === 1 || flag === 2, `marine mask ${i}`);
    assert.equal(covers(shelf, x, y), flag === 2, `shelf mask ${i}`);
    assert.equal(covers(lake, x, y), flag === 3, `lake mask ${i}`);
  }
}

const oceanOnly = paint(makeWorld(Array(9).fill(1), 3), 0.15);
for (let i = 0; i < 9; i++) {
  const [x, y] = centre(Math.floor(i / 3), i % 3);
  assert.equal(covers(oceanOnly.fills[1], x, y), false, 'ocean must not acquire a shelf');
}

// Surround isolated water with land to exercise actual curved shore paths.
const coast = makeWorld([0,0,0,0,0, 0,1,0,3,0, 0,2,0,3,0, 0,0,0,0,0], 5);
for (const [scale, perType] of [[0.15, 1], [0.5, 3], [1, 4], [2, 4]]) {
  const strokes = paint(coast, scale).strokes;
  assert.equal(strokes.length, perType * 2);
  for (const group of [strokes.slice(0, perType), strokes.slice(perType)]) {
    assert.ok(group[0].path.curves > 0, 'the shoreline keeps its curved midpoint geometry');
    assert.ok(group.every(stroke => stroke.path === group[0].path), 'detail follows the same shoreline');
  }
  if (perType >= 3) assert.match(strokes[0].style, /^rgba\(/); // shallows
  if (perType === 4) assert.equal(strokes[2].style, 'rgba(235,247,224,.90)'); // surf
}
'''.replace('MODULE', repr(module))
        result = subprocess.run(['node', '--input-type=module', '-e', script],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
