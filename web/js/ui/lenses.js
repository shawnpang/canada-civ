// Lens selection is shared by the picker, legend and canvas renderer.
let app = null;
let selectedId = null;
let brush = null;
const listeners = new Set();

const copy = {
  en: {terrain: 'Terrain', lenses: 'Lenses', all: 'Lenses', choose: 'Choose a lens', close: 'Close lens picker', shortcut: 'Cycle lenses: L / Shift+L'},
  fr: {terrain: 'Relief', lenses: 'Couches', all: 'Couches', choose: 'Choisir une couche', close: 'Fermer le choix des couches', shortcut: 'Parcourir les couches : L / Maj+L'}
};
const language = () => app?.getLang?.() === 'fr' ? 'fr' : 'en';
const label = (value, lang) => typeof value === 'string' ? value : value?.[lang] || value?.en || '';
const available = () => Array.isArray(app?.lenses?.lenses) ? app.lenses.lenses : [];

export function getActiveLens() {
  return available().find(item => item.id === selectedId) || null;
}
export function getBrush() { return brush && [...brush]; }
export function clearLens() { select(null); }
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function notify() {
  for (const listener of listeners) listener();
}
export function setBrush(range) {
  brush = Array.isArray(range) && range.length === 2 && range.every(Number.isFinite)
    ? [Math.min(...range), Math.max(...range)] : null;
  notify();
  app?.redraw?.();
}
function writeSelection(id) {
  // Preserve unrelated view state. main.js currently does not expose the
  // contract's hash helpers, so push the same key directly until integrated.
  if (typeof app?.setHashKeys === 'function') {
    app.setHashKeys({lens: id || null});
  } else {
    const params = new URLSearchParams(location.hash.slice(1));
    if (id) params.set('lens', id); else params.delete('lens');
    const next = params.toString();
    history.pushState(null, '', location.pathname + location.search + (next ? '#' + next : ''));
  }
}
function select(id, write = true) {
  const next = available().some(item => item.id === id) ? id : null;
  if (next === selectedId) return;
  selectedId = next;
  brush = null;
  if (write) writeSelection(next);
  renderPicker();
  notify();
  app?.redraw?.();
}
function makeButton(text, active, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.setAttribute('aria-pressed', String(active));
  button.className = 'lens-choice' + (active ? ' is-active' : '');
  button.addEventListener('click', action);
  return button;
}
function renderPicker() {
  const root = document.querySelector('#lens-bar');
  if (!root || !app) return;
  const lang = language(), words = copy[lang], lenses = available();
  const wasOpen = root.querySelector('details')?.open || false;
  root.replaceChildren();
  if (!lenses.length) return;
  const dock = document.createElement('nav');
  dock.className = 'lens-dock';
  dock.setAttribute('aria-label', words.lenses);
  dock.title = words.shortcut;
  dock.append(makeButton(words.terrain, !selectedId, () => select(null)));
  // Keep quick choices stable while allowing either poverty measure in data.
  const quickIds = ['density', 'income', 'home', 'forest'];
  for (const id of quickIds) {
    const lens = lenses.find(item => item.id === id);
    if (lens) dock.append(makeButton(label(lens.name, lang), selectedId === id, () => select(id)));
  }
  const details = document.createElement('details');
  details.className = 'lens-picker';
  details.open = wasOpen;
  const summary = document.createElement('summary');
  summary.textContent = words.all;
  details.append(summary);
  const menu = document.createElement('div');
  menu.className = 'lens-picker-menu';
  const title = document.createElement('h2');
  title.className = 'lens-picker-title';
  title.textContent = words.choose;
  menu.append(title);
  const groups = Array.isArray(app.lenses.groups) ? app.lenses.groups : [];
  const grouped = new Set();
  for (const group of groups) {
    const members = lenses.filter(lens => lens.group === group.id);
    if (!members.length) continue;
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = label(group.name, lang);
    section.append(heading);
    for (const lens of members) {
      grouped.add(lens);
      section.append(makeButton(label(lens.name, lang), selectedId === lens.id, () => {
        details.open = false;
        select(lens.id);
      }));
    }
    menu.append(section);
  }
  for (const lens of lenses.filter(item => !grouped.has(item))) {
    menu.append(makeButton(label(lens.name, lang), selectedId === lens.id, () => {
      details.open = false;
      select(lens.id);
    }));
  }
  details.append(menu);
  dock.append(details);
  root.append(dock);
}
function keydown(event) {
  if (event.key.toLowerCase() !== 'l' || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  const target = event.target;
  if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '')) return;
  const ids = [null, ...available().map(lens => lens.id)];
  if (ids.length < 2) return;
  event.preventDefault();
  const index = Math.max(0, ids.indexOf(selectedId));
  select(ids[(index + (event.shiftKey ? -1 : 1) + ids.length) % ids.length]);
}
export async function init(ctx) {
  app = ctx;
  selectedId = available().some(lens => lens.id === selectedId) ? selectedId : null;
  onHash(ctx);
  renderPicker();
  document.addEventListener('keydown', keydown);
}
export function onLang(ctx) { if (app) { app = ctx; renderPicker(); } }
export function onHash(ctx) {
  if (!app) return;
  app = ctx;
  const params = typeof ctx.getHash === 'function' ? ctx.getHash() : new URLSearchParams(location.hash.slice(1));
  const id = typeof params?.get === 'function' ? params.get('lens') : params?.lens;
  select(id, false);
}
