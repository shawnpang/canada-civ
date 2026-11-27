import {center} from '../hex.js';
import {drawCityTypeBadge} from '../render/districts.js';

// Banner coordinates are always derived from the payload. In particular,
// a missing coordinate must not turn into a marker at the origin.
let hitBoxes = [];
let townHitBoxes = [];
let roster;
let rosterOpen = false;
let districts = null;
let reservedWorld, smallProvinceCenters = [];

// A province represented by only a few hexes has no alternative anchor when
// a town banner covers it. Reserve space near its owned cells at national zoom.
function smallProvinceReservations(world, camera) {
  if (world !== reservedWorld) {
    reservedWorld = world;
    const groups = world.provinces.map(() => []);
    world.owner.forEach((owner, i) => {
      if (groups[owner]) groups[owner].push(center(i % world.grid.cols, Math.floor(i / world.grid.cols), world.grid.radius || 25));
    });
    smallProvinceCenters = groups.filter(points => points.length > 0 && points.length <= 2).map(points => [
      points.reduce((sum, p) => sum + p[0], 0) / points.length,
      points.reduce((sum, p) => sum + p[1], 0) / points.length
    ]);
  }
  return smallProvinceCenters.map(([x, y]) => ({
    left: camera.ox + x * camera.scale - 35, right: camera.ox + x * camera.scale + 35,
    top: camera.oy + y * camera.scale - 21, bottom: camera.oy + y * camera.scale + 21
  }));
}

function cities(ctx) {
  return Array.isArray(ctx.cities) ? ctx.cities : (ctx.cities?.cities || []);
}

function towns(ctx) {
  return Array.isArray(ctx.towns) ? ctx.towns : (ctx.towns?.towns || []);
}

function townPosition(town) {
  return Number.isFinite(town.x) && Number.isFinite(town.y) ? [town.x, town.y] : null;
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
  // District metadata is optional and shared by the city panel. A failed load
  // leaves the city banner intact without fabricating a classification.
  try {
    const response = await fetch('data/districts.json');
    if (response.ok) districts = await response.json();
  } catch { /* unavailable */ }
  ctx.redraw?.();
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

function tracePill(g, left, top, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  g.beginPath();
  g.moveTo(left + r, top); g.lineTo(left + width - r, top);
  g.quadraticCurveTo(left + width, top, left + width, top + r);
  g.lineTo(left + width, top + height - r);
  g.quadraticCurveTo(left + width, top + height, left + width - r, top + height);
  g.lineTo(left + r, top + height);
  g.quadraticCurveTo(left, top + height, left, top + height - r);
  g.lineTo(left, top + r);
  g.quadraticCurveTo(left, top, left + r, top);
  g.closePath();
}

// The colour is decorative; the initial and the close-zoom plaque both come
// from the published city classification, not an inferred yield.
function typeColour(id) {
  const colours = ['#617e61', '#a96f4f', '#697d96', '#92719a', '#ad8a43', '#668a86'];
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return colours[hash % colours.length];
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

export function layoutBanners(ctx) {
  if (!ctx.world || !ctx.ctx) return [];
  const camera = ctx.getCamera();
  if (!camera || !Number.isFinite(camera.scale) || camera.scale <= 0) return [];
  const selected = new URLSearchParams(location.hash.slice(1)).get('city');
  const all = cities(ctx);
  const focused = all.find(city => String(city.id) === selected);
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
  const fit = Math.min(innerWidth / (ctx.world.width + 200), (innerHeight - 95) / (ctx.world.height + 200));
  const zoom = camera.scale / fit;
  const reservations = zoom <= 1.15 && ctx.world.grid && Array.isArray(ctx.world.owner) && Array.isArray(ctx.world.provinces)
    ? smallProvinceReservations(ctx.world, camera) : [];
  for (const city of ordered) {
    const pos = position(city, ctx.world);
    if (!pos) continue;
    const x = camera.ox + pos[0] * camera.scale, y = camera.oy + pos[1] * camera.scale;
    const name = label(city, ctx.getLang());
    const population = Number.isFinite(city.population) ? compact.format(city.population) : null;
    const chipWidth = population ? Math.max(36, Math.ceil(g.measureText(population).width) + 12) : 0;
    const nameWidth = Math.max(56, Math.ceil(g.measureText(name).width) + 20);
    const badgeId = districts?.cities?.[String(city.id)]?.badge;
    const badgeType = districts?.types?.find(type => type.id === badgeId);
    const badgeName = typeof badgeType?.name === 'string' ? badgeType.name :
      (badgeType?.name?.[ctx.getLang()] || badgeType?.name?.en);
    const emblemWidth = badgeName ? 20 : 0;
    const width = chipWidth + nameWidth + emblemWidth, height = 23;
    const left = x >= 0 && x <= innerWidth && width <= innerWidth
      ? Math.max(0, Math.min(innerWidth - width, x - width / 2))
      : x - width / 2;
    const showBadge = !!badgeName && (city === focused || zoom >= 2.5);
    g.font = 'bold 10px Georgia, serif';
    const badgeWidth = showBadge ? Math.ceil(g.measureText(badgeName).width) + 18 : 0;
    g.font = 'bold 11px Georgia, serif';
    // At intermediate zoom, alternate vertical offsets make room for nearby
    // city labels while keeping a leader line to each official map coordinate.
    const offsets = zoom >= 1.4 ? [30, 55, 80] : [30];
    let box = null;
    for (const offset of offsets) {
      const top = y - offset;
      const candidate = {city, left, top, right: left + width, bottom: top + height + 5, x, y, name, nameWidth, chipWidth, population, badgeId, badgeName, emblemWidth};
      if (candidate.left > innerWidth || candidate.right < 0 || candidate.top > innerHeight || candidate.bottom < 0) continue;
      candidate.collision = {left: Math.min(left, x - badgeWidth / 2), right: Math.max(left + width, x + badgeWidth / 2), top: top - (showBadge ? 22 : 0), bottom: candidate.bottom};
      if (placed.some(other => candidate.collision.left < other.collision.right + 4 && candidate.collision.right + 4 > other.collision.left &&
          candidate.collision.top < other.collision.bottom + 3 && candidate.collision.bottom + 3 > other.collision.top)) continue;
      box = candidate;
      break;
    }
    if (box) placed.push(box);
  }
  // Place towns after cities so city banners always keep priority. Only the
  // official representative point may anchor a town, never its nearby hex.
  const orderedTowns = [...towns(ctx)].sort((a, b) => {
    if (String(a.id) === selected) return -1;
    if (String(b.id) === selected) return 1;
    return (b.population ?? -1) - (a.population ?? -1) || String(a.id).localeCompare(String(b.id));
  });
  g.font = '10px Georgia, serif';
  for (const town of orderedTowns) {
    const pos = townPosition(town);
    if (!pos) continue;
    const x = camera.ox + pos[0] * camera.scale, y = camera.oy + pos[1] * camera.scale;
    const name = label(town, ctx.getLang());
    const width = Math.max(42, Math.ceil(g.measureText(name).width) + 16);
    const left = x - width / 2;
    for (const offset of zoom >= 1.4 ? [25, 45, 65] : [25]) {
      const top = y - offset;
      const candidate = {town, left, right: left + width, top, bottom: top + 18, x, y, name};
      candidate.collision = {left, right: left + width, top, bottom: candidate.bottom};
      if (candidate.left > innerWidth || candidate.right < 0 || candidate.top > innerHeight || candidate.bottom < 0) continue;
      if (String(town.id) !== selected && reservations.some(other => candidate.collision.left < other.right && candidate.collision.right > other.left &&
          candidate.collision.top < other.bottom && candidate.collision.bottom > other.top)) continue;
      if (placed.some(other => candidate.collision.left < other.collision.right + 4 && candidate.collision.right + 4 > other.collision.left &&
          candidate.collision.top < other.collision.bottom + 3 && candidate.collision.bottom + 3 > other.collision.top)) continue;
      placed.push(candidate);
      break;
    }
  }
  g.restore();
  return placed;
}

export function onRedraw(ctx) {
  hitBoxes = [];
  townHitBoxes = [];
  if (!ctx.world || !ctx.ctx) return;
  const camera = ctx.getCamera();
  if (!camera || !Number.isFinite(camera.scale) || camera.scale <= 0) return;
  const selected = new URLSearchParams(location.hash.slice(1)).get('city');
  const focused = cities(ctx).find(city => String(city.id) === selected);
  const placed = layoutBanners(ctx);
  const g = ctx.ctx;
  const fit = Math.min(innerWidth / (ctx.world.width + 200), (innerHeight - 95) / (ctx.world.height + 200));
  const zoom = camera.scale / fit;
  g.save();
  g.font = 'bold 11px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Small light markers remain visible even when a town's label collides.
  for (const town of towns(ctx)) {
    const pos = townPosition(town);
    if (!pos) continue;
    const x = camera.ox + pos[0] * camera.scale, y = camera.oy + pos[1] * camera.scale;
    g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2);
    g.fillStyle = '#eee1b7'; g.fill();
    g.strokeStyle = '#82704e'; g.lineWidth = 1; g.stroke();
  }
  // Paint the selected banner last and use the same rectangles for hit tests.
  for (const box of placed.reverse()) {
    if (box.town) {
      const {town, x, y, left, right, top, bottom, name} = box;
      const active = String(town.id) === selected;
      g.beginPath(); g.moveTo(x, bottom); g.lineTo(x, y - 3);
      g.strokeStyle = 'rgba(239, 225, 185, .8)'; g.lineWidth = 1; g.stroke();
      tracePill(g, left, top, right - left, bottom - top, 4);
      g.fillStyle = active ? '#b49b69' : '#c8bb9b';
      g.fill();
      g.strokeStyle = active ? '#fff3c9' : '#867754'; g.lineWidth = active ? 2 : 1;
      g.stroke();
      g.font = '10px Georgia, serif'; g.fillStyle = '#302c22';
      g.fillText(name, x, (top + bottom) / 2);
      g.font = 'bold 11px Georgia, serif';
      townHitBoxes.push(box);
      continue;
    }
    const {city, x, y, left, top, right, bottom, name, nameWidth, chipWidth, population, badgeId, badgeName, emblemWidth} = box;
    const active = city === focused;
    g.globalAlpha = focused && !active ? .72 : 1;
    if (y - bottom > 9) {
      g.beginPath(); g.moveTo(x, bottom); g.lineTo(x, y - 2);
      g.strokeStyle = 'rgba(230, 201, 143, .85)'; g.lineWidth = 1; g.stroke();
    }
    g.shadowColor = 'rgba(0,0,0,.65)';
    g.shadowBlur = 4;
    g.shadowOffsetY = 2;
    g.beginPath(); g.moveTo(x - 5, bottom - 7); g.lineTo(x, bottom);
    g.lineTo(x + 5, bottom - 7); g.closePath();
    g.fillStyle = active ? '#76572d' : '#202a2b'; g.fill();
    g.strokeStyle = active ? '#ffe3a0' : '#c5a15d'; g.lineWidth = active ? 2 : 1; g.stroke();
    tracePill(g, left, top, right - left, bottom - top - 5, 9);
    g.fill(); g.stroke();
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
    if (population) {
      tracePill(g, left + 2, top + 2, chipWidth - 2, 19, 7);
      g.fillStyle = active ? '#8b9b54' : '#627b4b'; g.fill();
      g.fillStyle = '#fff2c8';
      g.fillText(population, left + chipWidth / 2 + 1, top + 12);
    }
    g.fillStyle = '#fff0c9';
    g.fillText(name, left + chipWidth + nameWidth / 2, top + 12);
    if (emblemWidth) {
      const bx = right - emblemWidth / 2 - 2, by = top + 11.5;
      g.beginPath(); g.arc(bx, by, 7, 0, Math.PI * 2);
      g.fillStyle = typeColour(badgeId); g.fill();
      g.strokeStyle = '#d9c18a'; g.lineWidth = .8; g.stroke();
      g.fillStyle = '#fff4d5'; g.font = 'bold 9px Georgia, serif';
      g.fillText(Array.from(badgeName)[0].toLocaleUpperCase(ctx.getLang() === 'fr' ? 'fr-CA' : 'en-CA'), bx, by + .5);
      g.font = 'bold 11px Georgia, serif';
    }
    // At city scale there is room for the published type plaque; its own
    // bounds participate in hit testing, just like the banner itself.
    if (districts && (active || zoom >= 2.5)) {
      const badge = drawCityTypeBadge(g, districts, city.id, {x, y: top - 12, lang: ctx.getLang()});
      if (badge) hitBoxes.push({city, left: badge.left, right: badge.left + badge.width, top: badge.top, bottom: badge.top + badge.height});
    }
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

export function hitTown(ctx, event) {
  for (let i = townHitBoxes.length - 1; i >= 0; i--) {
    const b = townHitBoxes[i];
    if (event.clientX >= b.left && event.clientX <= b.right && event.clientY >= b.top && event.clientY <= b.bottom) return b.town;
  }
  const camera = ctx.getCamera();
  let closest = null, distance = 7;
  for (const town of towns(ctx)) {
    const pos = townPosition(town);
    if (!pos) continue;
    const d = Math.hypot(event.clientX - (camera.ox + pos[0] * camera.scale), event.clientY - (camera.oy + pos[1] * camera.scale));
    if (d < distance) { closest = town; distance = d; }
  }
  return closest;
}

export function selectTown(ctx, event) {
  const town = hitTown(ctx, event);
  if (town) window.dispatchEvent(new CustomEvent('canadaciv:select-town', {detail: {id: town.id}}));
}

export function onLang(ctx) { renderRoster(ctx); }
export function onHash() {}
