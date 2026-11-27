import {paintMapTerrain} from './terrain.js';
import {setupMinimap} from './minimap.js';
import * as i18n from './ui/i18n.js';
import * as hash from './ui/hash.js';
import * as search from './ui/search.js';
import * as almanac from './ui/almanac.js';
import * as share from './ui/share.js';
import * as yields from './ui/yields.js';
import * as city from './ui/city.js';
import * as province from './ui/province.js';
import * as banners from './ui/banners.js';
import * as advisors from './ui/advisors.js';
import * as lenses from './ui/lenses.js';
import * as legend from './ui/legend.js';
import * as layers from './ui/layers.js';
import * as lensRender from './render/lenses.js';

const modules = [i18n, hash, search, almanac, share, yields, city, province, banners, advisors, lenses, legend, layers, lensRender];

const canvas = document.querySelector('#map');
const ctx = canvas.getContext('2d');
let w, scale, ox, oy, drag = null, dragStart = null;
let lang = new URLSearchParams(location.hash.slice(1)).get('lang') || 'en';
const data = {world: null, nation: null, provinces: null, cities: null, lenses: null, sources: null, divisions: null};

const drawMinimap = setupMinimap({
  getWorld: () => w,
  getCamera: () => ({scale, ox, oy}),
  moveTo: (x, y) => {
    ox = innerWidth / 2 - x * scale;
    oy = innerHeight / 2 - y * scale;
    draw();
    save();
  }
});

const words = {
  en: ['A living atlas of the land', 'DRAG TO EXPLORE  ·  SCROLL TO ZOOM', 'Surveying the land…', 'Explore the map', 'Drag to pan, scroll or use + and − to zoom. Click, drag, or use the arrow keys on the overview map to navigate. This is a schematic atlas, not a legal boundary map. Terrain uses 2020 land cover and MRDEM elevation. Data: Statistics Canada Open Licence; Open Government Licence – Canada; NOAA; Natural Earth.'],
  fr: ['Un atlas vivant du territoire', 'GLISSEZ POUR EXPLORER  ·  DÉFILEZ POUR ZOOMER', 'Arpentage du territoire…', 'Explorer la carte', 'Glissez pour déplacer la carte; utilisez la molette ou + et − pour zoomer. Cliquez, glissez ou utilisez les flèches sur la carte générale pour naviguer. Cette carte schématique ne représente pas les limites légales. Relief MRDEM et couverture terrestre 2020. Données : Licence ouverte de Statistique Canada; Licence du gouvernement ouvert – Canada; NOAA; Natural Earth.']
};

function translate() {
  const t = words[lang];
  ['subtitle', 'hint', 'loading', 'helpTitle', 'helpText'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t[i];
  });
  document.querySelector('#lang').textContent = lang === 'en' ? 'FR' : 'EN';
  document.documentElement.lang = lang;
  document.querySelector('#vintage').textContent = lang === 'en' ? 'THE LAND · 2021 / 2020' : 'LE TERRITOIRE · 2021 / 2020';
  document.querySelector('#lang').setAttribute('aria-label', lang === 'en' ? 'Français' : 'English');
  document.querySelector('#help').setAttribute('aria-label', lang === 'en' ? 'Help' : 'Aide');
  canvas.setAttribute('aria-label', lang === 'en' ? 'Map of Canada' : 'Carte du Canada');
  for (const [id, en, fr] of [['plus', 'Zoom in', 'Zoom avant'], ['minus', 'Zoom out', 'Zoom arrière'], ['home', 'Reset view', 'Réinitialiser la vue'], ['close', 'Close', 'Fermer']]) {
    document.querySelector('#' + id).setAttribute('aria-label', lang === 'en' ? en : fr);
  }
  const ctxObj = api();
  for (const m of modules) if (m.onLang) m.onLang(ctxObj);
}

function resize() {
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  if (w) draw();
}
window.addEventListener('resize', resize);

function reset() {
  scale = Math.min(innerWidth / (w.width + 200), (innerHeight - 95) / (w.height + 200));
  ox = (innerWidth - w.width * scale) / 2;
  oy = 75 + (innerHeight - 75 - w.height * scale) / 2;
  draw();
}

function draw() {
  if (!w) return;
  const W = innerWidth, H = innerHeight;
  ctx.clearRect(0, 0, W, H);
  paintMapTerrain(ctx, w, {width: W, height: H, scale, ox, oy});
  const ctxObj = api();
  if (lensRender.onRedraw) lensRender.onRedraw(ctxObj);
  if (banners.onRedraw) banners.onRedraw(ctxObj);
  for (const m of modules) {
    if (m !== lensRender && m !== banners && m.onRedraw) m.onRedraw(ctxObj);
  }
  if (drawMinimap) drawMinimap();
}

function zoom(f, x = innerWidth / 2, y = innerHeight / 2) {
  const s = Math.max(0.05, Math.min(3, scale * f));
  ox = x - (x - ox) * s / scale;
  oy = y - (y - oy) * s / scale;
  scale = s;
  draw();
  save();
}

function save() {
  if (hash.writeHash) {
    hash.writeHash(api());
    return;
  }
  const p = new URLSearchParams();
  p.set('lang', lang);
  p.set('at', `${((innerWidth / 2 - ox) / scale).toFixed(1)},${((innerHeight / 2 - oy) / scale).toFixed(1)},${scale.toFixed(4)}`);
  history.replaceState(null, '', '#' + p);
}

function applyHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  lang = p.get('lang') || 'en';
  translate();
  const at = p.get('at');
  if (at) {
    const [x, y, z] = at.split(',').map(Number);
    if ([x, y, z].every(Number.isFinite) && z > 0) {
      scale = z;
      ox = innerWidth / 2 - x * z;
      oy = innerHeight / 2 - y * z;
    }
  }
  const ctxObj = api();
  for (const m of modules) if (m.onHash) m.onHash(ctxObj);
  draw();
}

async function loadPayload(name) {
  for (const path of [`data/${name}.json`, `data/fixtures/${name}.json`]) {
    try {
      const r = await fetch(path);
      if (r.ok) return {data: await r.json(), path, official: path.startsWith('data/') && !path.includes('/fixtures/')};
    } catch (err) {
      /* try next */
    }
  }
  return {data: null, path: null, official: false};
}

function api() {
  return {
    world: w,
    nation: data.nation,
    provinces: data.provinces,
    cities: data.cities,
    lenses: data.lenses,
    sources: data.sources,
    divisions: data.divisions,
    canvas,
    ctx,
    getCamera: () => ({scale, ox, oy}),
    setCamera: (c) => {
      if (c.scale) scale = c.scale;
      if (Number.isFinite(c.ox)) ox = c.ox;
      if (Number.isFinite(c.oy)) oy = c.oy;
      draw();
    },
    redraw: draw,
    getLang: () => lang,
    setLang: (next) => {
      lang = next === 'fr' ? 'fr' : 'en';
      translate();
      draw();
      save();
    },
    t: (key) => (typeof hash.t === 'function' ? hash.t(key, lang) : (i18n.t ? i18n.t(key, lang) : key)),
    payloadSources: data.payloadSources || {}
  };
}

canvas.addEventListener('pointerdown', e => {
  drag = [e.clientX, e.clientY];
  dragStart = [e.clientX, e.clientY];
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (drag) {
    ox += e.clientX - drag[0];
    oy += e.clientY - drag[1];
    drag = [e.clientX, e.clientY];
    draw();
  }
});
canvas.addEventListener('pointerup', e => {
  const start = dragStart;
  drag = null;
  dragStart = null;
  save();
  if (start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) < 4) {
    const ctxObj = api();
    const mapEvent = {clientX: e.clientX, clientY: e.clientY, x: (e.clientX - ox) / scale, y: (e.clientY - oy) / scale};
    for (const m of modules) if (m.onClick) m.onClick(ctxObj, mapEvent);
  }
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  zoom(Math.exp(-e.deltaY * 0.001), e.clientX, e.clientY);
}, {passive: false});
canvas.addEventListener('dblclick', e => zoom(1.5, e.clientX, e.clientY));
document.querySelector('#plus').onclick = () => zoom(1.3);
document.querySelector('#minus').onclick = () => zoom(1 / 1.3);
document.querySelector('#home').onclick = () => { reset(); save(); };
document.querySelector('#lang').onclick = () => { lang = lang === 'en' ? 'fr' : 'en'; translate(); draw(); save(); };
document.querySelector('#help').onclick = () => { document.querySelector('#dialog').hidden = false; };
document.querySelector('#close').onclick = () => { document.querySelector('#dialog').hidden = true; };
window.addEventListener('hashchange', () => { if (w) applyHash(); });

resize();
translate();

Promise.all([
  fetch('data/world.json').then(r => { if (!r.ok) throw Error(r.status); return r.json(); }),
  loadPayload('nation'),
  loadPayload('provinces'),
  loadPayload('cities'),
  loadPayload('lenses'),
  loadPayload('sources'),
  loadPayload('divisions')
]).then(async ([world, nation, provinces, cities, lensesp, sources, divisions]) => {
  w = world;
  data.world = world;
  data.nation = nation.data;
  data.provinces = provinces.data;
  data.cities = cities.data;
  data.lenses = lensesp.data;
  data.sources = sources.data;
  data.divisions = divisions.data;
  data.payloadSources = {nation: nation, provinces, cities, lenses: lensesp, sources, divisions};
  document.querySelector('#loading').hidden = true;
  reset();
  applyHash();
  const ctxObj = api();
  for (const m of modules) {
    if (m.init) await m.init(ctxObj);
  }
  draw();
}).catch(e => {
  document.querySelector('#loading').textContent = 'Unable to load map / Impossible de charger la carte';
  console.error(e);
});
