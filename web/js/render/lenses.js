import {getActiveLens, getBrush} from '../ui/lenses.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const SQRT3 = Math.sqrt(3);

// Use the same transform for the map, histogram and brush. A zero-based log
// domain uses log1p so that a real zero is still distinguishable from null.
function scaleFor(lens) {
  const domain = lens?.domain;
  if (!Array.isArray(domain) || domain.length < 2 ||
      !Number.isFinite(domain[0]) || !Number.isFinite(domain[1]) || domain[1] < domain[0]) return null;
  const [low, high] = domain;
  if (lens.scale === 'log' && low > 0) {
    return {low: Math.log(low), high: Math.log(high), forward: Math.log, inverse: Math.exp};
  }
  if (lens.scale === 'log' && low === 0) {
    return {low: 0, high: Math.log1p(high), forward: Math.log1p, inverse: Math.expm1};
  }
  return {low, high, forward: value => value, inverse: value => value};
}

export function lensPosition(lens, value) {
  const scale = scaleFor(lens);
  if (!scale || !Number.isFinite(value)) return null;
  if (scale.high === scale.low) return 0.5;
  // Clamp in the source domain first, which also avoids log of a nonpositive
  // value for positive log domains.
  const bounded = clamp(value, lens.domain[0], lens.domain[1]);
  return clamp((scale.forward(bounded) - scale.low) / (scale.high - scale.low), 0, 1);
}

export function lensValue(lens, position) {
  const scale = scaleFor(lens);
  if (!scale || !Number.isFinite(position)) return null;
  return scale.inverse(scale.low + clamp(position, 0, 1) * (scale.high - scale.low));
}

function rgb(hex) {
  if (typeof hex !== 'string') return null;
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(hex);
  if (!match) return null;
  const code = match[1].length === 3 ? [...match[1]].map(c => c + c).join('') : match[1];
  return [0, 2, 4].map(i => parseInt(code.slice(i, i + 2), 16));
}

// A ramp can have two or more stops; interpolate in RGB between adjacent stops.
export function lensColor(lens, value) {
  const position = lensPosition(lens, value);
  if (position === null) return null;
  const stops = Array.isArray(lens.ramp) ? lens.ramp.map(rgb) : [];
  if (stops.length < 2 || stops.some(stop => !stop)) return null;
  const offset = position * (stops.length - 1);
  const index = Math.min(Math.floor(offset), stops.length - 2);
  const fraction = offset - index;
  const channels = stops[index].map((channel, i) => Math.round(channel + (stops[index + 1][i] - channel) * fraction));
  return `rgb(${channels.join(', ')})`;
}

function hexPath(context, x, y, radius) {
  context.beginPath();
  for (let corner = 0; corner < 6; corner++) {
    const angle = (corner * 60 - 30) * Math.PI / 180;
    const px = x + radius * Math.cos(angle), py = y + radius * Math.sin(angle);
    if (corner === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

export async function init() {}

export function onRedraw(app) {
  const lens = getActiveLens();
  const world = app.world, context = app.ctx;
  if (!lens || !world?.grid || !context || !Array.isArray(lens.values)) return;
  const {cols, rows, radius = 25} = world.grid;
  if (lens.values.length !== cols * rows || !Array.isArray(world.owner)) return;
  const {scale, ox, oy} = app.getCamera();
  if (!(scale > 0)) return;
  const width = app.canvas.clientWidth, height = app.canvas.clientHeight;
  const r = radius * scale, dx = SQRT3 * r, dy = 1.5 * r;
  const firstRow = Math.max(0, Math.floor((-r - oy) / dy));
  const lastRow = Math.min(rows - 1, Math.ceil((height + r - oy) / dy));
  const brush = getBrush();

  context.save();
  for (let row = firstRow; row <= lastRow; row++) {
    const y = oy + row * dy, shift = 0.5 * (row & 1);
    const firstCol = Math.max(0, Math.floor((-r - ox) / dx - shift));
    const lastCol = Math.min(cols - 1, Math.ceil((width + r - ox) / dx - shift));
    for (let col = firstCol; col <= lastCol; col++) {
      const index = row * cols + col, value = lens.values[index];
      if (!(world.owner[index] >= 0) || world.water?.[index] || !Number.isFinite(value)) continue;
      const colour = lensColor(lens, value);
      if (!colour) continue;
      const x = ox + (col + shift) * dx;
      hexPath(context, x, y, r + 0.2);
      // A translucent overlay retains terrain features; the brush dims cells
      // outside the chosen range without changing the underlying data.
      if (brush && (value < brush[0] || value > brush[1])) {
        context.fillStyle = 'rgba(10, 19, 24, 0.72)';
      } else {
        context.fillStyle = colour;
      }
      context.globalAlpha = brush && (value < brush[0] || value > brush[1]) ? 1 : 0.67;
      context.fill();
    }
  }
  context.restore();
}
