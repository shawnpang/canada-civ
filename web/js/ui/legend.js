import {clearLens, getActiveLens, getBrush, setBrush, subscribe} from './lenses.js';
import {lensPosition, lensColor, lensValue} from '../render/lenses.js';
import {renderCategoricalLegend} from '../render/categorical-lens.js';

const BIN_COUNT = 32;
let context;
let root;
let currentLens;
let histogram;
let selection;
let lowInput;
let highInput;
let lowLabel;
let highLabel;
let bounds;

function text(value, lang) {
  return typeof value === 'string' ? value : (value?.[lang] ?? value?.en ?? '');
}

function label(en, fr) {
  return context?.getLang?.() === 'fr' ? fr : en;
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function format(value, lens) {
  const locale = context?.getLang?.() === 'fr' ? 'fr-CA' : 'en-CA';
  if (!Number.isFinite(value)) return '—';
  if (lens.format === 'pct') return new Intl.NumberFormat(locale, {style: 'percent', maximumFractionDigits: 1}).format(value);
  if (lens.format === 'cad') return new Intl.NumberFormat(locale, {style: 'currency', currency: 'CAD', maximumFractionDigits: 0}).format(value);
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: lens.format === 'float' || lens.format === 'years' ? 1 : 0
  }).format(value);
}

function position(value) {
  return Math.max(0, Math.min(1, lensPosition(currentLens, value)));
}

function updateSelection() {
  if (!histogram || !bounds) return;
  const brush = getBrush();
  const lo = brush ? position(brush[0]) : 0;
  const hi = brush ? position(brush[1]) : 1;
  selection.style.setProperty('--brush-left', `${lo * 100}%`);
  selection.style.setProperty('--brush-width', `${Math.max(0, hi - lo) * 100}%`);
  lowInput.value = String(Math.round(lo * 1000));
  highInput.value = String(Math.round(hi * 1000));
  // The ramp clamps observations outside the published domain into its edge
  // bins. Label those bins by the domain rather than the observed extremes.
  lowLabel.textContent = lo === 0 ? `≤ ${format(currentLens.domain[0], currentLens)}` : format(brush[0], currentLens);
  highLabel.textContent = hi === 1 ? `≥ ${format(currentLens.domain[1], currentLens)}` : format(brush[1], currentLens);
  lowInput.setAttribute('aria-valuetext', lowLabel.textContent);
  highInput.setAttribute('aria-valuetext', highLabel.textContent);
}

function setPositions(a, b) {
  const lo = Math.max(0, Math.min(1, Math.min(a, b)));
  const hi = Math.max(0, Math.min(1, Math.max(a, b)));
  // Edge bins contain values clamped beyond the published display domain.
  // Include those values when the selection reaches an edge.
  if (lo === 0 && hi === 1) {
    setBrush(null);
  } else {
    const min = lo === 0 ? bounds[0] : lensValue(currentLens, lo);
    const max = hi === 1 ? bounds[1] : lensValue(currentLens, hi);
    setBrush([min, max]);
  }
}

function render() {
  if (!root || !context) return;
  const lens = getActiveLens();
  currentLens = lens;
  histogram = selection = lowInput = highInput = lowLabel = highLabel = bounds = null;
  if (!lens) {
    const outgoing = root.firstElementChild;
    if (outgoing) {
      outgoing.style.pointerEvents = 'none';
      const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200;
      outgoing.animate([{opacity: 1}, {opacity: 0}], {duration, fill: 'forwards'}).finished
        .then(() => outgoing.remove(), () => outgoing.remove());
    } else {
      root.replaceChildren();
    }
    return;
  }
  root.replaceChildren();

  const lang = context.getLang?.() || 'en';
  const panel = element('section', 'lens-legend');
  panel.setAttribute('aria-label', label('Lens legend', 'Légende de la couche'));
  const header = element('div', 'lens-legend__header');
  const heading = element('h2', 'lens-legend__heading', text(lens.name, lang));
  const close = element('button', 'lens-legend__close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', label('Clear lens', 'Effacer la couche'));
  close.addEventListener('click', clearLens);
  header.append(heading, close);
  panel.append(header);
  const description = text(lens.description, lang);
  if (description) panel.append(element('p', 'lens-legend__description', description));
  const unit = text(lens.unit, lang);
  if (unit) panel.append(element('div', 'lens-legend__unit', unit));

  // Only Canadian cells can contribute to the histogram, even if a malformed
  // payload happens to contain a number for water or foreign land.
  const values = [];
  const expectedSize = context.world?.grid?.cols * context.world?.grid?.rows;
  if (Array.isArray(lens.values) && lens.values.length === expectedSize) {
    const owners = context.world?.owner || [];
    for (let i = 0; i < lens.values.length && i < owners.length; i++) {
      const value = lens.values[i];
      if (owners[i] >= 0 && !context.world?.water?.[i] && typeof value === 'number' && Number.isFinite(value)) values.push(value);
    }
  }
  if (renderCategoricalLegend(panel, lens, lang)) {
    // A categorical key has no continuous scale or brush.
  } else if (!values.length || !Array.isArray(lens.domain) || lens.domain.length < 2 ||
      !lens.domain.every(Number.isFinite) || lens.domain[1] < lens.domain[0]) {
    panel.append(element('p', 'lens-legend__empty', label('No data available for this lens.', 'Aucune donnée disponible pour cette couche.')));
  } else {
    bounds = values.reduce(([min, max], value) => [Math.min(min, value), Math.max(max, value)], [...lens.domain]);
    const bins = new Array(BIN_COUNT).fill(0);
    for (const value of values) {
      const p = position(value);
      if (Number.isFinite(p)) bins[Math.min(BIN_COUNT - 1, Math.floor(p * BIN_COUNT))]++;
    }
    const maxCount = Math.max(...bins, 1);
    histogram = element('div', 'lens-legend__histogram');
    histogram.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < bins.length; i++) {
      const bar = element('span', 'lens-legend__bar');
      bar.style.setProperty('--bar-height', `${bins[i] / maxCount * 100}%`);
      bar.style.background = lensColor(lens, lensValue(lens, (i + 0.5) / BIN_COUNT));
      histogram.append(bar);
    }
    selection = element('span', 'lens-legend__selection');
    histogram.append(selection);
    panel.append(histogram);

    const scale = element('div', 'lens-legend__scale');
    lowLabel = element('span');
    highLabel = element('span');
    scale.append(lowLabel, highLabel);
    panel.append(scale);

    const controls = element('div', 'lens-legend__brush-controls');
    const makeRange = (name) => {
      const wrapper = element('label', 'lens-legend__range');
      wrapper.append(element('span', '', name));
      const input = element('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1000';
      input.step = '1';
      wrapper.append(input);
      controls.append(wrapper);
      return input;
    };
    lowInput = makeRange(label('Minimum', 'Minimum'));
    highInput = makeRange(label('Maximum', 'Maximum'));
    lowInput.addEventListener('input', () => setPositions(Math.min(+lowInput.value, +highInput.value) / 1000, +highInput.value / 1000));
    highInput.addEventListener('input', () => setPositions(+lowInput.value / 1000, Math.max(+lowInput.value, +highInput.value) / 1000));
    const reset = element('button', 'lens-legend__reset', label('Clear range', 'Effacer la plage'));
    reset.type = 'button';
    reset.addEventListener('click', () => setBrush(null));
    controls.append(reset);
    panel.append(controls);

    let start = null;
    const pointerPosition = event => {
      const box = histogram.getBoundingClientRect();
      return Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
    };
    histogram.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      start = pointerPosition(event);
      histogram.setPointerCapture(event.pointerId);
      setPositions(start, start);
    });
    histogram.addEventListener('pointermove', event => {
      if (start !== null) setPositions(start, pointerPosition(event));
    });
    histogram.addEventListener('pointerup', event => {
      if (start !== null) setPositions(start, pointerPosition(event));
      start = null;
    });
    histogram.addEventListener('pointercancel', () => { start = null; });
  }
  const missing = element('div', 'lens-legend__missing');
  missing.append(element('span', 'lens-legend__missing-swatch'), document.createTextNode(label('No data', 'Aucune donnée')));
  panel.append(missing);
  if (lens.vintage || context.lenses?.vintage) {
    const vintage = text(lens.vintage || context.lenses.vintage, lang);
    // The catalogue vintage is a shared English string; translate its known
    // components without assuming that all lenses have the same source year.
    const localized = lang === 'fr' ? vintage.replace('Census', 'Recensement').replace('land cover', 'couverture terrestre') : vintage;
    panel.append(element('div', 'lens-legend__vintage', localized));
  }
  const note = text(lens.note, lang);
  if (note) panel.append(element('p', 'lens-legend__note', note));
  root.append(panel);
  updateSelection();
}

export async function init(ctx) {
  context = ctx;
  root = document.querySelector('#legend-root');
  subscribe(() => {
    if (getActiveLens() !== currentLens) render();
    else updateSelection();
  });
  render();
}

export function onLang(ctx) {
  context = ctx;
  render();
}
