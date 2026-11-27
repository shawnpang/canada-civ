import {paintMapTerrain} from './terrain.js';
import {createMapCache} from './render/mapcache.js';
import {paintCityTiles} from './render/citytiles.js';
import {setupMinimap} from './minimap.js';
import * as i18n from './ui/i18n.js';
import * as hash from './ui/hash.js';
import * as timeslider from './ui/timeslider.js';
import * as search from './ui/search.js';
import * as almanac from './ui/almanac.js';
import * as share from './ui/share.js';
import * as yields from './ui/yields.js';
import * as city from './ui/city.js';
import * as town from './ui/town.js';
import * as province from './ui/province.js';
import * as banners from './ui/banners.js';
import * as advisors from './ui/advisors.js';
import * as lenses from './ui/lenses.js';
import * as legend from './ui/legend.js';
import * as layers from './ui/layers.js';
import * as lensRender from './render/lenses.js';
import * as labels from './render/labels.js';
import {drawBorders} from './render/borders.js';

const modules = [i18n, hash, timeslider, search, almanac, share, yields, city, town, province, banners, advisors, lenses, legend, layers, lensRender];

const canvas = document.querySelector('#map');
canvas.tabIndex = 0;
const ctx = canvas.getContext('2d');
const mapCache = createMapCache();
let w, scale, ox, oy, drag = null, dragStart = null;
const initialLang = new URLSearchParams(location.hash.slice(1)).get('lang');
let lang = initialLang === 'en' || initialLang === 'fr' ? initialLang : (navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en');
let viewportWidth = innerWidth, viewportHeight = innerHeight, saveTimer;
const data = {world: null, nation: null, provinces: null, cities: null, towns: null, lenses: null, sources: null, divisions: null, wonders: null};

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
  en: ['A living atlas of the land', 'DRAG TO EXPLORE  ·  SCROLL TO ZOOM', 'Surveying the land…', 'Explore the map', 'Drag, use WASD or the arrow keys to pan; scroll or use + and − to zoom. Press L or Shift+L to cycle lenses, R to toggle resources, / or Ctrl/⌘K to search, ? for help, and Esc to close the topmost surface. Click, drag, or use the arrow keys on the overview map to navigate. This is a schematic atlas, not a legal boundary map. Terrain uses 2020 land cover and MRDEM elevation. Data: Statistics Canada Open Licence; Open Government Licence – Canada; NOAA; Natural Earth.'],
  fr: ['Un atlas vivant du territoire', 'GLISSEZ POUR EXPLORER  ·  DÉFILEZ POUR ZOOMER', 'Arpentage du territoire…', 'Explorer la carte', 'Glissez ou utilisez WASD ou les flèches pour déplacer la carte; utilisez la molette ou + et − pour zoomer. Appuyez sur L ou Maj+L pour parcourir les couches de données, sur R pour afficher ou masquer les ressources, sur / ou Ctrl/⌘K pour rechercher, sur ? pour l’aide et sur Échap pour fermer le panneau au premier plan. Cliquez, glissez ou utilisez les flèches sur la carte générale pour naviguer. Cette carte schématique ne représente pas les limites légales. Relief MRDEM et couverture terrestre 2020. Données : Licence ouverte de Statistique Canada; Licence du gouvernement ouvert – Canada; NOAA; Natural Earth.']
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

function fitScale(width, height) {
  return Math.min(width / (w.width + 200), (height - 95) / (w.height + 200));
}

function resize() {
  if (w && scale > 0) {
    const x = (viewportWidth / 2 - ox) / scale;
    const y = (viewportHeight / 2 - oy) / scale;
    scale *= fitScale(innerWidth, innerHeight) / fitScale(viewportWidth, viewportHeight);
    ox = innerWidth / 2 - x * scale;
    oy = innerHeight / 2 - y * scale;
  }
  viewportWidth = innerWidth;
  viewportHeight = innerHeight;
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  if (w) { draw(); scheduleSave(); }
}
window.addEventListener('resize', resize);

function reset() {
  scale = fitScale(innerWidth, innerHeight);
  ox = (innerWidth - w.width * scale) / 2;
  oy = 75 + (innerHeight - 75 - w.height * scale) / 2;
  draw();
}

function draw() {
  if (!w) return;
  const W = innerWidth, H = innerHeight;
  ctx.clearRect(0, 0, W, H);
  const view = hash.getHash();
  const key = JSON.stringify([view.lens, view.layers, view.city, view.province, timeslider.getYear(), lang]);
  mapCache.draw(ctx, {world: w, width: W, height: H, scale, ox, oy, pixelRatio: devicePixelRatio, key},
    (target, camera) => paintMapTerrain(target, w, camera));
  const cityMap = city.getCityMapState?.() || {visible: false, tab: null, districts: null};
  const cityTileView = {width: W, height: H, scale, ox, oy};
  const cityTileOpts = {
    cities: data.cities,
    towns: data.towns,
    selectedCityId: cityMap.visible ? new URLSearchParams(location.hash.slice(1)).get('city') : null,
    districts: cityMap.districts,
    showDistricts: false,
    lang
  };
  paintCityTiles(ctx, w, cityTileView, cityTileOpts);
  const ctxObj = api();
  if (lensRender.onRedraw) lensRender.onRedraw(ctxObj);
  drawBorders(ctx, w, {width: W, height: H, scale, ox, oy});
  labels.onRedraw(ctxObj);
  if (layers.onRedraw) layers.onRedraw(ctxObj);
  if (banners.onRedraw) banners.onRedraw(ctxObj);
  if (cityMap.visible && cityMap.tab === 'districts') {
    paintCityTiles(ctx, w, cityTileView, {...cityTileOpts, showDistricts: true, plaquesOnly: true});
  }
  for (const m of modules) {
    if (m !== lensRender && m !== layers && m !== banners && m.onRedraw) m.onRedraw(ctxObj);
  }
  if (drawMinimap) drawMinimap();
}

function zoom(f, x = innerWidth / 2, y = innerHeight / 2) {
  const s = Math.max(0.05, Math.min(3, scale * f));
  ox = x - (x - ox) * s / scale;
  oy = y - (y - oy) * s / scale;
  scale = s;
  draw();
  scheduleSave();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 350);
}

function flushSave() { if (saveTimer) save(); }

function save() {
  clearTimeout(saveTimer);
  saveTimer = null;
  hash.writeHash(api());
}

function applyHash() {
  clearTimeout(saveTimer);
  saveTimer = null;
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
    towns: data.towns,
    lenses: data.lenses,
    sources: data.sources,
    divisions: data.divisions,
    wonders: data.wonders,
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
    getHash: hash.getHash,
    setHashKeys: hash.setHashKeys,
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
    // Banners own hits over the land beneath them.
    if (banners.hitCity(ctxObj, mapEvent)) {
      banners.onClick(ctxObj, mapEvent);
    } else if (banners.hitTown(ctxObj, mapEvent)) {
      banners.selectTown(ctxObj, mapEvent);
    } else {
      for (const m of modules) {
        if (m !== banners && m.onClick && m.onClick(ctxObj, mapEvent)) break;
      }
    }
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
document.querySelector('#lang').onclick = () => { flushSave(); api().setLang(lang === 'en' ? 'fr' : 'en'); };
const helpDialog = document.querySelector('#dialog');
function openHelp() { helpDialog.hidden = false; document.querySelector('#close').focus(); }
function closeHelp() { helpDialog.hidden = true; document.querySelector('#help').focus(); }
document.querySelector('#help').onclick = openHelp;
document.querySelector('#close').onclick = closeHelp;

// Search owns city selection (setHashKeys with the result id) and camera flight.
window.addEventListener('click', event => {
  flushSave();
}, true);
window.addEventListener('keydown', event => {
  if (!event.ctrlKey && !event.metaKey && !event.altKey) flushSave();
  const editing = event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName || '');
  if (event.key === '?' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    openHelp();
    return;
  }
  if (w && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const directions = {w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0], ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0]};
    const direction = directions[event.key] || directions[event.key.toLowerCase()];
    // The overview map has its own arrow navigation and camera step.
    if (direction && !(event.target.id === 'minimap' && event.key.startsWith('Arrow'))) {
      event.preventDefault();
      ox -= direction[0] * 60;
      oy -= direction[1] * 60;
      draw();
      scheduleSave();
      return;
    }
  }
  if (event.key !== 'Escape') return;
  const searchInput = document.querySelector('#search-root .search-input');
  const visible = selector => document.querySelector(selector + ':not([hidden])');
  let close;
  if (!helpDialog.hidden) close = closeHelp;
  else if (visible('.share-overlay')) close = () => document.querySelector('.share-overlay .share-close')?.click();
  else if (visible('.almanac-overlay')) close = () => document.querySelector('.almanac-overlay .almanac-close')?.click();
  else if (visible('.adv-panel')) close = () => document.querySelector('.adv-close')?.click();
  else if (document.activeElement === searchInput) close = () => { searchInput.value = ''; searchInput.blur(); };
  else if (document.querySelector('.lens-picker[open]')) close = () => { const picker = document.querySelector('.lens-picker'); picker.open = false; picker.querySelector('summary')?.focus(); };
  else if (document.querySelector('.map-layer-menu[open]')) close = () => { const menu = document.querySelector('.map-layer-menu'); menu.open = false; menu.querySelector('summary')?.focus(); };
  else if (visible('.yield-report')) close = () => document.querySelector('.yield-report .yield-report-close')?.click();
  else if (visible('.cc-panel')) close = () => document.querySelector('.cc-panel:not([hidden]) .cc-panel-close')?.click();
  if (close) { event.preventDefault(); event.stopImmediatePropagation(); close(); }
}, true);

function canonicalizeProvince() {
  const params = new URLSearchParams(location.hash.slice(1));
  const value = params.get('province');
  if (!value || !w) return;
  const entry = w.provinces.find(place => place.abbr === value || place.pruid === value);
  const codes = {'10':'NL', '11':'PE', '12':'NS', '13':'NB', '24':'QC', '35':'ON', '46':'MB', '47':'SK', '48':'AB', '59':'BC', '60':'YT', '61':'NT', '62':'NU'};
  const code = codes[entry?.pruid];
  if (code && code !== value) {
    params.set('province', code);
    history.replaceState(null, '', `${location.pathname}${location.search}#${params}`);
  }
}
window.addEventListener('hashchange', () => { if (w) { canonicalizeProvince(); applyHash(); } });

resize();
translate();

Promise.all([
  fetch('data/world.json').then(r => { if (!r.ok) throw Error(r.status); return r.json(); }),
  loadPayload('nation'),
  loadPayload('provinces'),
  loadPayload('cities'),
  loadPayload('towns'),
  loadPayload('lenses'),
  loadPayload('sources'),
  loadPayload('divisions'),
  loadPayload('wonders')
]).then(async ([world, nation, provinces, cities, towns, lensesp, sources, divisions, wonders]) => {
  w = world;
  data.world = world;
  data.nation = nation.data;
  data.provinces = provinces.data;
  data.cities = cities.data;
  data.towns = towns.data;
  data.lenses = lensesp.data;
  data.sources = sources.data;
  data.divisions = divisions.data;
  data.wonders = wonders.data;
  data.payloadSources = {nation: nation, provinces, cities, towns, lenses: lensesp, sources, divisions};
  document.querySelector('#loading').hidden = true;
  reset();
  canonicalizeProvince();
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
