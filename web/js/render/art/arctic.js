// FAR-zoom colour treatment for sampled Canadian Arctic land cover. This
// changes presentation only: ice remains confined to cover 11, and the
// tundra blend never samples water, foreign land, forest, cropland or ice.
const tundra = cover => cover === 4 || cover === 5 || cover === 10;
const clamp01 = value => Math.max(0, Math.min(1, value));
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

export function arcticFarColor(w, row, col, palette) {
  const {rows, cols, radius = 25} = w.grid;
  if (row < 0 || col < 0 || row >= rows || col >= cols) return null;
  const i = row * cols + col, cover = w.cover[i];
  if (w.owner[i] < 0 || w.water[i]) return null;
  if (cover === 11) return palette[11];
  if (!tundra(cover)) return null;
  const strength = clamp01((2200 - row * 1.5 * radius) / 700);
  if (!strength) return null;

  // Average only compatible sampled covers; the centre has double weight.
  // This reduces isolated class colour changes without moving boundaries.
  const sum = rgb(palette[cover]).map(v => v * 2);
  let count = 2;
  const s = row & 1;
  for (const [r, c] of [[row,col+1],[row+1,col+s],[row+1,col+s-1],
    [row,col-1],[row-1,col+s-1],[row-1,col+s]]) {
    if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
    const j = r * cols + c, neighbour = w.cover[j];
    if (w.owner[j] < 0 || w.water[j] || !tundra(neighbour)) continue;
    const color = rgb(palette[neighbour]);
    for (let k = 0; k < 3; k++) sum[k] += color[k];
    count++;
  }
  const original = rgb(palette[cover]), cool = [181, 188, 176];
  const color = original.map((value, k) => {
    const local = sum[k] / count;
    return Math.round(value * (1 - strength) + (local * .25 + cool[k] * .75) * strength);
  });
  return `rgb(${color.join(',')})`;
}
