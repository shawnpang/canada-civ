import {setHashKeys, writeHash} from './hash.js';

let input, resultsBox, context, matches = [], active = 0, animation;

const copy = {
  en: {placeholder: 'Search cities & provinces', label: 'Search cities and provinces', city: 'City', province: 'Province or territory', empty: 'No matching cities, provinces or territories'},
  fr: {placeholder: 'Chercher une ville ou province', label: 'Chercher une ville, une province ou un territoire', city: 'Ville', province: 'Province ou territoire', empty: 'Aucune ville, province ou territoire correspondant'}
};
const text = () => copy[context?.getLang() === 'fr' ? 'fr' : 'en'];
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const displayName = item => item.name?.[context.getLang()] || item.name?.en || item.name?.fr || '';

function items() {
  const cities = Array.isArray(context.cities) ? context.cities : context.cities?.cities || [];
  const provinces = Array.isArray(context.provinces) ? context.provinces : context.provinces?.provinces || context.world?.provinces || [];
  return [
    ...cities.map(place => ({kind: 'city', place})),
    ...provinces.map(place => ({kind: 'province', place}))
  ];
}

function lookup(query) {
  const term = normalize(query);
  if (!term) return [];
  return items().map(entry => {
    const p = entry.place;
    const names = [p.name?.en, p.name?.fr, p.full?.en, p.full?.fr, p.abbr].filter(Boolean).map(normalize);
    let rank = Infinity;
    for (const name of names) {
      if (name === term) rank = Math.min(rank, 0);
      else if (name.startsWith(term)) rank = Math.min(rank, 1);
      else if (name.split(' ').some(word => word.startsWith(term))) rank = Math.min(rank, 2);
      else if (name.includes(term)) rank = Math.min(rank, 3);
    }
    return {...entry, rank};
  }).filter(entry => Number.isFinite(entry.rank))
    .sort((a, b) => a.rank - b.rank || (b.place.population ?? -1) - (a.place.population ?? -1))
    .slice(0, 10);
}

function render() {
  if (!input || !resultsBox) return;
  input.placeholder = text().placeholder;
  input.setAttribute('aria-label', text().label);
  resultsBox.replaceChildren();
  const query = input.value.trim();
  if (!query || document.activeElement !== input) {
    resultsBox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    return;
  }
  matches = lookup(query);
  active = Math.min(active, Math.max(0, matches.length - 1));
  if (!matches.length) {
    const empty = document.createElement('div');
    empty.className = 'search-empty';
    empty.textContent = text().empty;
    resultsBox.append(empty);
    input.removeAttribute('aria-activedescendant');
  } else {
    matches.forEach((entry, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-result';
      button.id = `search-option-${index}`;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === active));
      const name = document.createElement('span');
      name.className = 'search-result-name';
      name.textContent = displayName(entry.place);
      const type = document.createElement('span');
      type.className = 'search-result-type';
      type.textContent = text()[entry.kind];
      button.append(name, type);
      button.addEventListener('pointerdown', event => event.preventDefault());
      button.addEventListener('click', () => choose(entry));
      resultsBox.append(button);
    });
    input.setAttribute('aria-activedescendant', `search-option-${active}`);
  }
  resultsBox.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function cellPosition(index) {
  const grid = context.world?.grid;
  if (!Number.isInteger(index) || !grid || index < 0 || index >= grid.cols * grid.rows) return null;
  const row = Math.floor(index / grid.cols), col = index % grid.cols;
  return {x: Math.sqrt(3) * grid.radius * (col + 0.5 * (row & 1)), y: 1.5 * grid.radius * row};
}

function position(entry) {
  const p = entry.place;
  if (Number.isFinite(p.x) && Number.isFinite(p.y)) return {x: p.x, y: p.y};
  if (Number.isFinite(p.label?.x) && Number.isFinite(p.label?.y)) return p.label;
  const cell = cellPosition(p.cell);
  if (cell) return cell;
  if (entry.kind !== 'province') return null;
  const world = context.world;
  const provinceIndex = world?.provinces?.findIndex(candidate => candidate.pruid === p.pruid);
  if (provinceIndex == null || provinceIndex < 0 || !world.owner) return null;
  let x = 0, y = 0, count = 0;
  world.owner.forEach((owner, index) => {
    if (owner !== provinceIndex) return;
    const point = cellPosition(index);
    if (point) { x += point.x; y += point.y; count++; }
  });
  return count ? {x: x / count, y: y / count} : null;
}

function flyTo(point, kind) {
  if (!point) return;
  cancelAnimationFrame(animation);
  const start = context.getCamera();
  const targetScale = Math.min(3, Math.max(start.scale, kind === 'city' ? 0.65 : 0.25));
  // The selection opens a side panel or mobile bottom sheet synchronously.
  // Centre the place in the remaining map area so its banner is not hidden.
  const panel = document.querySelector('.cc-panel:not([hidden])');
  const bounds = panel?.getBoundingClientRect();
  let right = innerWidth, bottom = innerHeight;
  if (bounds && bounds.width > innerWidth * 0.75) bottom = Math.max(0, bounds.top);
  else if (bounds) right = Math.max(0, bounds.left);
  const chromeBottom = Math.max(0, document.querySelector('#search-root')?.getBoundingClientRect().bottom || 0,
    document.querySelector('#yield-bar')?.getBoundingClientRect().bottom || 0);
  const targetX = right / 2;
  const targetY = bottom > chromeBottom ? (chromeBottom + bottom) / 2 : innerHeight / 2;
  const target = {scale: targetScale, ox: targetX - point.x * targetScale, oy: targetY - point.y * targetScale};
  const duration = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 350;
  const started = performance.now();
  const frame = now => {
    const fraction = duration ? Math.min(1, (now - started) / duration) : 1;
    const t = fraction * fraction * (3 - 2 * fraction);
    context.setCamera({scale: start.scale + (target.scale - start.scale) * t, ox: start.ox + (target.ox - start.ox) * t, oy: start.oy + (target.oy - start.oy) * t});
    if (fraction < 1) animation = requestAnimationFrame(frame);
    else writeHash(context);
  };
  animation = requestAnimationFrame(frame);
}

function choose(entry) {
  cancelAnimationFrame(animation);
  const point = position(entry);
  input.value = '';
  resultsBox.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
  input.blur();
  if (entry.kind === 'city') setHashKeys({city: String(entry.place.id), province: null});
  else setHashKeys({province: String(entry.place.abbr), city: null});
  flyTo(point, entry.kind);
}

export function init(ctx) {
  context = ctx;
  const root = document.querySelector('#search-root');
  if (!root) return;
  input = document.createElement('input');
  input.className = 'search-input';
  input.type = 'search';
  input.autocomplete = 'off';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', 'search-results');
  input.setAttribute('aria-expanded', 'false');
  resultsBox = document.createElement('div');
  resultsBox.className = 'search-results';
  resultsBox.id = 'search-results';
  resultsBox.setAttribute('role', 'listbox');
  resultsBox.hidden = true;
  root.replaceChildren(input, resultsBox);
  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('focus', render);
  input.addEventListener('blur', () => { resultsBox.hidden = true; input.setAttribute('aria-expanded', 'false'); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      input.value = ''; input.blur();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!matches.length || resultsBox.hidden) return;
      event.preventDefault();
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      render();
    } else if (event.key === 'Enter' && !resultsBox.hidden && matches.length) {
      event.preventDefault(); choose(matches[active]);
    }
  });
  document.addEventListener('keydown', event => {
    const target = event.target;
    const editing = target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '');
    if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') || (event.key === '/' && !editing && !event.altKey && !event.ctrlKey && !event.metaKey)) {
      event.preventDefault(); input.focus(); input.select();
    }
  });
  render();
}

export function onLang(ctx) { context = ctx; render(); }
