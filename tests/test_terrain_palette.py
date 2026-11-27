import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


@unittest.skipUnless(shutil.which('node'), 'Node.js is needed to exercise the browser modules')
class TerrainPaletteTests(unittest.TestCase):
    def test_palette_and_far_relief(self):
        root = Path(__file__).resolve().parents[1]
        script = r'''
import assert from 'node:assert/strict';
import {FAR, MID, NEAR, CLOSE} from './web/js/render/art/lod.js';
import {LAND_FILLS, landFill, FAR_MOUNTAIN} from './web/js/render/art/palette.js';
import {paintMapTerrain} from './web/js/terrain.js';
for (const lod of [FAR, MID, NEAR, CLOSE]) {
  assert.equal(LAND_FILLS[lod].length, 12);
  for (let cover=0; cover<12; cover++) assert.match(landFill(cover,lod), /^#[0-9a-f]{6}$/i);
  assert.equal(landFill(99,lod), landFill(0,lod));
}
assert.deepEqual(LAND_FILLS[NEAR], LAND_FILLS[CLOSE]);
assert.equal(landFill(2,NEAR), '#526f4d');
assert.equal(landFill(7,CLOSE), '#bea96b');
assert.notEqual(landFill(2,FAR), landFill(2,NEAR));

class Path { moveTo() {} lineTo() {} closePath() {} quadraticCurveTo() {} rect() {} addPath() {} }
globalThis.Path2D = Path;
const gradient = {addColorStop() {}};
function context() {
  const fills = [];
  const ctx = {fills, globalAlpha: 1, fill() { fills.push(this.fillStyle); },
    createLinearGradient() {return gradient;}, createRadialGradient() {return gradient;}};
  ctx.getTransform = () => ({a:1,b:0,c:0,d:1,e:0,f:0});
  for (const method of ['beginPath','moveTo','lineTo','closePath','quadraticCurveTo','rect',
    'fillRect','save','restore','translate','scale','clip','stroke','ellipse','drawImage']) ctx[method] = () => {};
  return ctx;
}
globalThis.document = {createElement() {return {getContext: () => context()};}};
function render({owner=0, water=0, relief=2, cover=2, max=null, row=70}={}) {
  const n=row+1, at=row;
  const w={grid:{radius:25,cols:1,rows:n}, owner:Array(n).fill(-1), water:Array(n).fill(1),
    cover:Array(n).fill(0), relief:Array(n).fill(0), elev:Array(n).fill(null), elev_max:Array(n).fill(null)};
  w.owner[at]=owner; w.water[at]=water; w.relief[at]=relief; w.cover[at]=cover; w.elev_max[at]=max;
  const ctx=context();
  paintMapTerrain(ctx,w,{width:40,height:40,scale:.16,ox:20,oy:20-row*37.5*.16});
  return ctx.fills;
}
const marked = fills => fills.includes(FAR_MOUNTAIN.light) && fills.includes(FAR_MOUNTAIN.dark);
assert(marked(render()));
assert(!marked(render({relief:1})));
assert(!marked(render({water:1})));
assert(!marked(render({owner:-2})));
assert(!render().includes(FAR_MOUNTAIN.snow));
assert(render({max:1801}).includes(FAR_MOUNTAIN.snow));
assert(!render({max:1800}).includes(FAR_MOUNTAIN.snow));
assert(render({cover:11}).includes(FAR_MOUNTAIN.snow));
assert(render({row:30}).includes(FAR_MOUNTAIN.snow));
'''
        with tempfile.TemporaryDirectory() as temp:
            temp_root = Path(temp)
            shutil.copytree(root / 'web/js', temp_root / 'web/js')
            (temp_root / 'package.json').write_text('{"type":"module"}', encoding='utf-8')
            result = subprocess.run(
                ['node', '--input-type=module', '-e', script],
                cwd=temp_root, capture_output=True, text=True,
            )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
