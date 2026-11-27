// Foreign land is a neutral backdrop, using only the existing ownership grid.
// The transparent edge is a grid-boundary vignette, not a new coastline.
import {hexPath} from './art/lod.js';

export const NEIGHBOUR_COLOR = '#89847c';
const SQRT3 = Math.sqrt(3);
const FADE_CELLS = 9;

export function paintNeighbours(ctx, w, {width, height, scale, ox, oy}) {
  if (!(scale > 0) || !w?.grid || !w.owner || !w.water || width <= 0 || height <= 0) return;
  const {rows, cols} = w.grid;
  const radius = w.grid.radius || 25, r = radius * scale;
  const dx = SQRT3 * r, dy = 1.5 * r;
  const firstRow = Math.max(0, Math.floor((-oy - 2*r) / dy));
  const lastRow = Math.min(rows - 1, Math.ceil((height - oy + 2*r) / dy));

  // Draw to a transparent layer so the vignette reveals the actual ocean
  // underneath and never fades Canadian terrain. Match the cache's pixel ratio.
  const transform = ctx.getTransform?.() || {a: 1, b: 0, c: 0, d: 1, e: 0, f: 0};
  const pixelRatio = Math.max(Math.abs(transform.a), Math.abs(transform.d)) || 1;
  const layer = document.createElement('canvas');
  layer.width = Math.ceil(width * pixelRatio);
  layer.height = Math.ceil(height * pixelRatio);
  const paint = layer.getContext('2d');
  paint.scale(pixelRatio, pixelRatio);
  paint.fillStyle = NEIGHBOUR_COLOR;
  let any = false;
  for (let row = firstRow; row <= lastRow; row++) {
    const shift = .5 * (row & 1), y = oy + row * dy;
    const firstCol = Math.max(0, Math.floor((-ox - 2*r) / dx - shift));
    const lastCol = Math.min(cols - 1, Math.ceil((width - ox + 2*r) / dx - shift));
    for (let col = firstCol; col <= lastCol; col++) {
      const i = row * cols + col;
      if (w.owner[i] !== -2 || w.water[i]) continue;
      hexPath(paint, ox + (col + shift) * dx, y, r + .35);
      paint.fill();
      any = true;
    }
  }
  if (!any) return;

  paint.globalCompositeOperation = 'destination-in';
  const left = ox - dx / 2, right = ox + (cols - .5) * dx + dx / 2;
  const top = oy - r, bottom = oy + (rows - 1) * dy + r;
  for (const [x0, y0, x1, y1] of [
    [left, 0, left + FADE_CELLS * dx, 0],
    [right, 0, right - FADE_CELLS * dx, 0],
    [0, top, 0, top + FADE_CELLS * dy],
    [0, bottom, 0, bottom - FADE_CELLS * dy],
  ]) {
    const fade = paint.createLinearGradient(x0, y0, x1, y1);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    paint.fillStyle = fade;
    paint.fillRect(0, 0, width, height);
  }
  ctx.drawImage(layer, 0, 0, width, height);
}
