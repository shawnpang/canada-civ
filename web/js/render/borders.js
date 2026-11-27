// Schematic administrative boundaries follow shared hex edges, not surveyed
// lines. Cache in map kilometres so the same geometry survives pan and zoom.
const paths = new WeakMap();
const SQRT3 = Math.sqrt(3);

function isBorder(a, b) {
  return (a >= 0 && (b === -2 || (b >= 0 && a !== b))) ||
    (b >= 0 && a === -2);
}

function makePath(world) {
  const {rows, cols, radius = 25} = world.grid;
  const path = new Path2D();
  const halfWidth = SQRT3 * radius / 2;
  for (let row = 0; row < rows; row++) {
    const shift = row & 1;
    for (let col = 0; col < cols; col++) {
      const owner = world.owner[row * cols + col];
      const x = SQRT3 * radius * (col + shift / 2);
      const y = 1.5 * radius * row;
      // E, SE and SW visit each shared edge once. The vertices are ordered
      // clockwise from the upper right in the map's y-down coordinate system.
      const edges = [
        [row, col + 1, x + halfWidth, y - radius / 2, x + halfWidth, y + radius / 2],
        [row + 1, col + shift, x + halfWidth, y + radius / 2, x, y + radius],
        [row + 1, col + shift - 1, x, y + radius, x - halfWidth, y + radius / 2]
      ];
      for (const [r, c, x1, y1, x2, y2] of edges) {
        if (r >= rows || c < 0 || c >= cols || !isBorder(owner, world.owner[r * cols + c])) continue;
        path.moveTo(x1, y1);
        path.lineTo(x2, y2);
      }
    }
  }
  return path;
}

export function drawBorders(ctx, world, {width, height, scale, ox, oy}) {
  if (!ctx || !world?.grid || !world.owner || !Number.isFinite(scale) || scale <= 0 ||
      !Number.isFinite(ox) || !Number.isFinite(oy)) return;
  let path = paths.get(world);
  if (!path) {
    path = makePath(world);
    paths.set(world, path);
  }
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.strokeStyle = 'rgba(35, 40, 32, .68)';
  ctx.lineWidth = Math.min(1.5, 1 + Math.max(0, scale - .15) * .3) / scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(path);
  ctx.restore();
}
