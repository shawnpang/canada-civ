/* Population estimate years are shared through the existing area objects.
   The shell must call onHash before population-consuming modules; see HOOK-REQUEST. */
import * as yields from './yields.js';
import * as almanac from './almanac.js';

let context = null;
let root = null;
let years = [];
let selectedYear = null;

const copy = {
  en: {
    title: 'Population', label: 'Population estimate year',
    note: 'July 1 estimates, not Census counts. Only population estimates follow this slider; GDP and other source measures keep their own vintages.',
    preliminary: 'City estimates for 2025 are preliminary.', unavailable: 'Population estimates unavailable'
  },
  fr: {
    title: 'Population', label: 'Année de l’estimation de la population',
    note: 'Estimations au 1er juillet, et non chiffres du recensement. Seules les estimations de population suivent ce curseur; le PIB et les autres mesures de source conservent leurs propres millésimes.',
    preliminary: 'Les estimations des villes pour 2025 sont provisoires.', unavailable: 'Estimations de population indisponibles'
  }
};

function language() { return context?.getLang?.() === 'fr' ? 'fr' : 'en'; }
function areas(ctx) {
  const provinces = Array.isArray(ctx?.provinces) ? ctx.provinces : ctx?.provinces?.provinces;
  const cities = Array.isArray(ctx?.cities) ? ctx.cities : ctx?.cities?.cities;
  return [ctx?.nation?.nation, ...(provinces || []), ...(cities || [])].filter(Boolean);
}
function availableYears(ctx) {
  const found = new Set();
  for (const area of areas(ctx)) {
    for (const key of Object.keys(area.pop_series || {})) {
      if (/^\d{4}$/.test(key)) found.add(Number(key));
    }
  }
  return [...found].sort((a, b) => a - b);
}
function requestedYear() {
  const value = new URLSearchParams(location.hash.slice(1)).get('year');
  return /^\d{4}$/.test(value || '') && years.includes(Number(value)) ? Number(value) : years.at(-1) ?? null;
}

/** The active population year, or null if no estimate series is available. */
export function getYear() { return selectedYear; }

/** Return an estimate for the selected year, preserving missing observations. */
export function populationFor(area, year = selectedYear) {
  const value = area?.pop_series?.[year];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function applyYear(ctx) {
  years = availableYears(ctx);
  selectedYear = requestedYear();
  if (selectedYear == null) return;
  for (const area of areas(ctx)) area.population = populationFor(area);
  if (ctx.nation) {
    ctx.nation.year = selectedYear;
    ctx.nation.vintage = {
      en: `Population estimates July ${selectedYear}; Census 2021 characteristics`,
      fr: `Estimations de population de juillet ${selectedYear}; caractéristiques du Recensement de 2021`
    };
    ctx.nation.population_note = {
      en: `July 1, ${selectedYear} population estimates use 2021 boundaries and are not Census counts. City estimates for 2025 are preliminary. National and provincial estimates were revised after the January 2026 subprovincial release and may not reconcile with city estimates. Industry yields and census-based lenses use Census 2021.`,
      fr: `Les estimations de population au 1er juillet ${selectedYear} utilisent les limites de 2021 et ne sont pas des chiffres du recensement. Les estimations des villes pour 2025 sont provisoires. Les estimations nationales et provinciales ont été révisées après la diffusion infraprovinciale de janvier 2026 et peuvent différer des estimations des villes. Les rendements par industrie et les couches fondées sur le recensement utilisent le Recensement de 2021.`
    };
  }
}
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}
function render() {
  if (!root) return;
  const open = root.open;
  const focused = root.contains(document.activeElement) ? document.activeElement : null;
  const focusInput = focused?.classList.contains('time-slider-input');
  const focusTrigger = focused?.classList.contains('time-slider-trigger');
  const t = copy[language()];
  root.replaceChildren();
  const summary = node('summary', 'time-slider-trigger', selectedYear == null ? t.unavailable : `${t.title} · ${selectedYear}`);
  root.append(summary);
  if (!years.length) return;
  const panel = node('div', 'time-slider-panel');
  const label = node('label', 'time-slider-label', t.label);
  label.htmlFor = 'population-year-slider';
  const output = node('output', 'time-slider-year', String(selectedYear));
  output.htmlFor = 'population-year-slider';
  const input = node('input', 'time-slider-input');
  input.id = 'population-year-slider'; input.type = 'range';
  input.min = '0'; input.max = String(years.length - 1); input.step = '1';
  input.value = String(years.indexOf(selectedYear));
  input.setAttribute('aria-valuetext', String(selectedYear));
  input.addEventListener('input', () => {
    const year = years[Number(input.value)];
    output.textContent = String(year);
    input.setAttribute('aria-valuetext', String(year));
  });
  input.addEventListener('change', () => {
    const year = years[Number(input.value)];
    if (context?.setHashKeys) context.setHashKeys({year});
    else {
      const params = new URLSearchParams(location.hash.slice(1));
      params.set('year', String(year));
      history.pushState(null, '', `${location.pathname}${location.search}#${params}`);
      window.dispatchEvent(new Event('hashchange'));
    }
  });
  const endpoints = node('div', 'time-slider-endpoints');
  endpoints.append(node('span', '', String(years[0])), node('span', '', String(years.at(-1))));
  panel.append(label, output, input, endpoints, node('p', 'time-slider-note', `${t.note} ${t.preliminary}`));
  root.append(panel);
  root.open = open;
  if (focusInput && open) input.focus();
  else if (focusTrigger) summary.focus();
}
export function init(ctx) {
  context = ctx;
  const dock = document.querySelector('#bottom-toolbar');
  if (!dock || root) return;
  root = node('details', 'time-slider');
  dock.append(root);
  applyYear(ctx);
  render();
}
export function onHash(ctx) {
  context = ctx;
  applyYear(ctx);
  render();
  // yields.onHash is currently empty; refresh both the bar and an open report.
  yields.onLang(ctx);
  almanac.onLang(ctx);
}
export function onLang(ctx) { context = ctx; render(); }
