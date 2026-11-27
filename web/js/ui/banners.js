import {center} from '../hex.js';

// Banner coordinates are always derived from the payload. In particular,
// a missing coordinate must not turn into a marker at the origin.
let hitBoxes = [];
let roster;
let rosterOpen = false;

function cities(ctx) {
  return Array.isArray(ctx.cities) ? ctx.cities : (ctx.cities?.cities || []);
}

function position(city, world) {
  if (Number.isFinite(city.x) && Number.isFinite(city.y)) return [city.x, city.y];
  const grid = world?.grid;
  if (!grid || !Number.isInteger(city.cell) || city.cell < 0 || city.cell >= grid.cols * grid.rows) return null;
  if (world.owner && !(world.owner[city.cell] >= 0)) return null;
  return center(city.cell % grid.cols, Math.floor(city.cell / grid.cols), grid.radius || 25);
}

function label(city, lang) {
  return typeof city.name === 'string' ? city.name : (city.name?.[lang] || city.name?.en || city.id);
}

function select(city) {
  window.dispatchEvent(new CustomEvent('canadaciv:select-city', {detail: {id: city.id}}));
}

function renderRoster(ctx) {
  if (!roster) return;
  const missing = cities(ctx).filter(city => !position(city, ctx.world));
  roster.replaceChildren();
  roster.hidden = missing.length === 0;
  if (!missing.length) return;
  const fr = ctx.getLang() === 'fr';
  const toggle = document.createElement('button');
  toggle.className = 'city-roster-toggle';
  toggle.type = 'button';
  toggle.textContent = fr ? `Villes sans position (${missing.length})` : `Cities without map positions (${missing.length})`;
  toggle.setAttribute('aria-expanded', String(rosterOpen));
  toggle.onclick = () => { rosterOpen = !rosterOpen; renderRoster(ctx); };
  roster.append(toggle);
  if (!rosterOpen) return;
  const note = document.createElement('p');
  note.className = 'city-roster-note';
  note.textContent = fr ? 'Les positions ne sont pas disponibles. Ouvrez une ville dans la liste.' : 'Map positions are unavailable. Open a city from the list.';
  roster.append(note);
  const list = document.createElement('div');
  list.className = 'city-roster-list';
  for (const city of missing) {
    const button = document.createElement('button');
    button.className = 'city-roster-item';
    button.type = 'button';
    button.textContent = label(city, ctx.getLang());
    button.onclick = () => { select(city); rosterOpen = false; renderRoster(ctx); };
    list.append(button);
  }
  roster.append(list);
}

export async function init(ctx) {
  roster = document.createElement('aside');
  roster.className = 'city-roster';
  document.querySelector('#panel-root')?.after(roster);
  renderRoster(ctx);
}

function traceHex(g, x, y, radius) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * 60 - 30) * Math.PI / 180;
    const px = x + Math.cos(a) * radius, py = y + Math.sin(a) * radius;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
}

function highlightFootprint(ctx, city, camera) {
  const world = ctx.world, grid = world?.grid;
  if (!grid || !Array.isArray(city?.footprint)) return;
  const g = ctx.ctx;
  g.save();
  g.fillStyle = 'rgba(247, 211, 121, .22)';
  g.strokeStyle = 'rgba(255, 231, 155, .8)';
  g.lineWidth = 1.3;
  for (const cell of city.footprint) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= grid.cols * grid.rows || (world.owner && !(world.owner[cell] >= 0))) continue;
    const [x, y] = center(cell % grid.cols, Math.floor(cell / grid.cols), grid.radius || 25);
    traceHex(g, camera.ox + x * camera.scale, camera.oy + y * camera.scale, (grid.radius || 25) * camera.scale);
    g.fill();
    g.stroke();
  }
  g.restore();
}

export function onRedraw(ctx) {
  hitBoxes = [];
  if (!ctx.world || !ctx.ctx) return;
  const camera = ctx.getCamera();
  if (!camera || !Number.isFinite(camera.scale) || camera.scale <= 0) return;
  const selected = new URLSearchParams(location.hash.slice(1)).get('city');
  const all = cities(ctx);
  const focused = all.find(city => String(city.id) === selected);
  if (focused) highlightFootprint(ctx, focused, camera);
  // At a national view many CMA centres are only a few pixels apart. Place the
  // selected city first, then larger cities, and reveal neighbours as one zooms.
  // The anchor remains the supplied map coordinate; no geographic positions are
  // fabricated to make labels fit.
  const ordered = [...all].sort((a, b) => {
    if (a === focused) return -1;
    if (b === focused) return 1;
    return (Number.isFinite(b.population) ? b.population : -1) -
      (Number.isFinite(a.population) ? a.population : -1) || String(a.id).localeCompare(String(b.id));
  });
  const g = ctx.ctx;
  g.save();
  g.font = 'bold 11px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const placed = [];
  const locale = ctx.getLang() === 'fr' ? 'fr-CA' : 'en-CA';
  const compact = new Intl.NumberFormat(locale, {notation: 'compact', maximumFractionDigits: 1});
  for (const city of ordered) {
    const pos = position(city, ctx.world);
    if (!pos) continue;
    const x = camera.ox + pos[0] * camera.scale, y = camera.oy + pos[1] * camera.scale;
    const name = label(city, ctx.getLang());
    const population = Number.isFinite(city.population) ? compact.format(city.population) : null;
    const chipWidth = population ? Math.max(36, Math.ceil(g.measureText(population).width) + 12) : 0;
    const nameWidth = Math.max(56, Math.ceil(g.measureText(name).width) + 20);
    const width = chipWidth + nameWidth, left = x - width / 2, top = y - 30, height = 21;
    const box = {city, left, top, right: left + width, bottom: top + height + 5, x, y, name, nameWidth, chipWidth, population};
    if (box.left > innerWidth || box.right < 0 || box.top > innerHeight || box.bottom < 0) continue;
    if (placed.some(other => box.left < other.right + 4 && box.right + 4 > other.left &&
        box.top < other.bottom + 3 && box.bottom + 3 > other.top)) continue;
    placed.push(box);
  }
  // Paint the selected banner last and use the same rectangles for hit tests.
  for (const box of placed.reverse()) {
    const {city, x, left, top, right, bottom, name, nameWidth, chipWidth, population} = box;
    const active = city === focused;
    g.globalAlpha = focused && !active ? .72 : 1;
    g.shadowColor = 'rgba(0,0,0,.65)';
    g.shadowBlur = 4;
    g.shadowOffsetY = 2;
    g.beginPath();
    g.moveTo(left + 4, top); g.lineTo(right - 4, top);
    g.lineTo(right, top + 4); g.lineTo(right, bottom - 9);
    g.lineTo(right - 4, bottom - 5); g.lineTo(x + 4, bottom - 5);
    g.lineTo(x, bottom); g.lineTo(x - 4, bottom - 5);
    g.lineTo(left + 4, bottom - 5); g.lineTo(left, bottom - 9);
    g.lineTo(left, top + 4); g.closePath();
    g.fillStyle = active ? '#76572d' : '#202a2b'; g.fill();
    g.strokeStyle = active ? '#ffe3a0' : '#c5a15d'; g.lineWidth = active ? 2 : 1; g.stroke();
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
    if (population) {
      g.fillStyle = active ? '#8b9b54' : '#627b4b';
      g.fillRect(left + 2, top + 2, chipWidth - 2, 17);
      g.fillStyle = '#fff2c8';
      g.fillText(population, left + chipWidth / 2, top + 11);
    }
    g.fillStyle = '#fff0c9';
    g.fillText(name, left + chipWidth + nameWidth / 2, top + 11);
    hitBoxes.push(box);
  }
  g.restore();
}

// Province selection calls the same hit test, since main broadcasts clicks to
// every module rather than stopping at the first one that handles the event.
export function hitCity(ctx, event) {
  for (let i = hitBoxes.length - 1; i >= 0; i--) {
    const b = hitBoxes[i];
    if (event.clientX >= b.left && event.clientX <= b.right && event.clientY >= b.top && event.clientY <= b.bottom) return b.city;
  }
  const radius = ctx.world?.grid?.radius || 25;
  let closest = null, distance = radius;
  for (const city of cities(ctx)) {
    const pos = position(city, ctx.world);
    if (!pos) continue;
    const d = Math.hypot(event.x - pos[0], event.y - pos[1]);
    if (d < distance) { closest = city; distance = d; }
  }
  return closest;
}

export function onClick(ctx, event) {
  const city = hitCity(ctx, event);
  if (city) select(city);
}

export function onLang(ctx) { renderRoster(ctx); }
export function onHash() {}
