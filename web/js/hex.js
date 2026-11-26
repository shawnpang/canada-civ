// Pointy-top odd-r coordinates; keep in sync with pipeline/core/hexgrid.py.
export function center(col, row, radius = 25) {
  return [Math.sqrt(3) * radius * (col + 0.5 * (row & 1)), 1.5 * radius * row];
}
export function cell(x, y, radius = 25) {
  const q = (Math.sqrt(3) / 3 * x - y / 3) / radius;
  const r = 2 * y / (3 * radius), s = -q - r;
  let rq = Math.floor(q + 0.5), rr = Math.floor(r + 0.5), rs = Math.floor(s + 0.5);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return [rq + (rr - (rr & 1)) / 2, rr];
}
