import {drawLayers, hitLayer} from '../render/layers.js';

// All overlays start off. The hash lists the enabled (non-default) overlays.
const ids = ['resources', 'roads', 'rail', 'airports', 'ports', 'military'];
const data = {resources: null, infrastructure: null};
let app = null;
let enabled = new Set();
let root, menu, tooltip;
const copy = {
  en: {
    map: 'Map', resources: 'Resources', title: 'Map layers', shortcut: 'Toggle resources: R',
    roads: 'Roads', rail: 'Rail', airports: 'Airports', ports: 'Fishing harbours', military: 'Military',
    resourceRules: 'Resource selection and coverage', infrastructureRules: 'Infrastructure coverage',
    vintage: 'Vintage', typeRules: 'Resource type cutoffs', missing: 'Data unavailable',
    omitted: 'Pipelines are not included in the available payload. Trade routes are omitted because no freight payload is available.',
    directory: 'Source: public Department of National Defence bases and support units directory; locations matched to the Canadian Geographical Names Database.',
    resourceSource: 'Source', close: 'Close map layers', unit: 'MW',
    roadsNote: 'NRCan Atlas network, 2017; generalized and incomplete.', railNote: 'NRCan Atlas network, 2017; generalized and incomplete.',
    airportsNote: 'Transport Canada inventory, 2021: airports with air navigation services.', portsNote: 'DFO core fishing harbour, 2026; not a commercial port ranking.'
  },
  fr: {
    map: 'Carte', resources: 'Ressources', title: 'Couches de la carte', shortcut: 'Afficher ou masquer les ressources : R',
    roads: 'Routes', rail: 'Voies ferrées', airports: 'Aéroports', ports: 'Ports de pêche', military: 'Défense',
    resourceRules: 'Sélection et couverture des ressources', infrastructureRules: 'Couverture des infrastructures',
    vintage: 'Millésime', typeRules: 'Seuils par type de ressource', missing: 'Données indisponibles',
    omitted: 'Les pipelines ne figurent pas dans les données disponibles. Les routes commerciales sont omises en l’absence de données sur le fret.',
    directory: 'Source : répertoire public des bases et unités de soutien du ministère de la Défense nationale; emplacements associés à la Base de données toponymiques du Canada.',
    resourceSource: 'Source', close: 'Fermer les couches de la carte', unit: 'MW',
    roadsNote: 'Réseau de l’Atlas de RNCan, 2017; généralisé et incomplet.', railNote: 'Réseau de l’Atlas de RNCan, 2017; généralisé et incomplet.',
    airportsNote: 'Inventaire de Transports Canada, 2021 : aéroports avec services de navigation aérienne.', portsNote: 'Port de pêche essentiel du MPO, 2026; il ne s’agit pas d’un classement des ports commerciaux.'
  }
};
const lang = () => app?.getLang?.() === 'fr' ? 'fr' : 'en';
const localized = (value) => typeof value === 'string' ? value : value?.[lang()] || value?.en || '';
const available = id => id === 'resources' ? !!data.resources : !!data.infrastructure && Array.isArray(data.infrastructure[id]);

function applyHash(ctx) {
  const hash = ctx.getHash?.() || Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
  const value = typeof hash.get === 'function' ? hash.get('layers') : hash.layers;
  enabled = new Set((value && value !== 'none' ? value.split(',') : []).filter(id => ids.includes(id) && available(id)));
}
function toggle(id) {
  if (!available(id)) return;
  const next = new Set(enabled);
  if (next.has(id)) next.delete(id); else next.add(id);
  const value = ids.filter(key => next.has(key)).join(',') || null;
  if (app.setHashKeys) app.setHashKeys({layers: value});
  else {
    const hash = new URLSearchParams(location.hash.slice(1));
    if (value) hash.set('layers', value); else hash.delete('layers');
    history.pushState(null, '', location.pathname + location.search + (hash.toString() ? '#' + hash : ''));
    window.dispatchEvent(new Event('hashchange'));
  }
  // The shared helper dispatches hashchange synchronously, but also work in isolation.
  enabled = next;
  render();
  hideTooltip();
  app.redraw?.();
}
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}
function choice(id) {
  const button = element('button', 'map-layer-row');
  button.type = 'button';
  button.disabled = !available(id);
  button.setAttribute('aria-pressed', String(enabled.has(id)));
  const icon = element('span', 'map-layer-icon map-layer-icon--' + id, {roads:'━', rail:'┄', airports:'✈', ports:'⚓', military:'◆'}[id]);
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon, element('span', 'map-layer-label', copy[lang()][id]));
  const state = element('span', 'map-layer-switch');
  state.setAttribute('aria-hidden', 'true');
  button.append(state);
  if (!available(id)) button.title = copy[lang()].missing;
  button.addEventListener('click', () => toggle(id));
  return button;
}
function disclosure(title, content) {
  const details = element('details', 'map-layer-notes');
  details.append(element('summary', '', title), content);
  return details;
}
function render() {
  if (!root || !app) return;
  const words = copy[lang()];
  const open = menu?.open || false;
  const notesOpen = [...root.querySelectorAll('.map-layer-notes')].map(el => el.open);
  root.replaceChildren();
  const resource = element('button', 'map-layer-resource', '◇  ' + words.resources);
  resource.type = 'button';
  resource.disabled = !available('resources');
  resource.title = available('resources') ? words.shortcut : words.missing;
  resource.setAttribute('aria-pressed', String(enabled.has('resources')));
  resource.addEventListener('click', () => toggle('resources'));
  menu = element('details', 'map-layer-menu');
  menu.open = open;
  const summary = element('summary', 'map-layer-trigger', '▦  ' + words.map);
  menu.append(summary);
  const panel = element('div', 'map-layer-panel');
  panel.append(element('h2', 'map-layer-heading', words.title));
  for (const id of ids.slice(1)) panel.append(choice(id));
  if (data.infrastructure) {
    const content = element('div', 'map-layer-note-content');
    content.append(element('p', '', localized(data.infrastructure.rules)));
    panel.append(disclosure(words.infrastructureRules, content));
  }
  if (data.resources) {
    const content = element('div', 'map-layer-note-content');
    content.append(element('p', '', localized(data.resources.rules)));
    content.append(element('p', '', words.vintage + ': NRCan 900A ' + (data.resources.vintage?.nrcan_900a || '—') + ' · NRCan ' + (lang() === 'fr' ? 'production propre' : 'clean generation') + ' ' + (data.resources.vintage?.nrcan_clean_generation || '—')));
    content.append(element('strong', '', words.typeRules));
    const list = element('ul');
    for (const type of data.resources.types || []) {
      list.append(element('li', '', localized(type.name) + ': ' + localized(type.description)));
    }
    content.append(list);
    panel.append(disclosure(words.resourceRules, content));
  }
  panel.append(element('p', 'map-layer-omitted', words.omitted));
  menu.append(panel);
  root.append(resource, menu);
  root.querySelectorAll('.map-layer-notes').forEach((el, i) => { el.open = !!notesOpen[i]; });
}
function hideTooltip() { if (tooltip) tooltip.hidden = true; }
function showFeature(event) {
  if (!app || !tooltip) return;
  const feature = hitLayer(app, data, enabled, event.clientX, event.clientY);
  if (!feature) { hideTooltip(); return; }
  // Renderer returns the underlying payload feature and its group and resource type.
  const item = feature.item, group = feature.group, type = feature.type;
  const words = copy[lang()];
  tooltip.replaceChildren();
  tooltip.append(element('strong', '', localized(item.name) || words[group]));
  if (group === 'resources') {
    const parts = [localized(type?.name)];
    if (Number.isFinite(item.value) && type?.unit) parts.push(`${item.value.toLocaleString(lang() === 'fr' ? 'fr-CA' : 'en-CA')} ${type.unit}`);
    tooltip.append(element('div', '', parts.filter(Boolean).join(' · ')));
    tooltip.append(element('div', '', localized(type?.description)));
    if (type?.source && data.resources.vintage?.[type.source]) {
      const source = type.source === 'nrcan_900a' ? 'NRCan 900A' : (lang() === 'fr' ? 'RNCan, production propre' : 'NRCan clean generation');
      tooltip.append(element('div', '', `${source} · ${data.resources.vintage[type.source]}`));
    }
  } else {
    tooltip.append(element('div', '', words[group]));
    if (group === 'military') tooltip.append(element('div', '', words.directory));
    else if (words[group + 'Note']) tooltip.append(element('div', '', words[group + 'Note']));
  }
  tooltip.hidden = false;
  const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
  tooltip.style.left = Math.max(8, Math.min(innerWidth - width - 8, event.clientX + 14)) + 'px';
  tooltip.style.top = Math.max(8, Math.min(innerHeight - height - 8, event.clientY + 14)) + 'px';
}
function keydown(event) {
  const target = event.target;
  const editing = target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '');
  if (event.key.toLowerCase() === 'r' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat && available('resources')) {
    event.preventDefault(); toggle('resources');
  } else if (event.key === 'Escape' && menu?.open) {
    event.preventDefault(); menu.open = false; menu.querySelector('summary')?.focus();
  }
}
async function load(name) {
  try {
    const response = await fetch(`data/${name}.json`);
    return response.ok ? await response.json() : null;
  } catch { return null; }
}
export async function init(ctx) {
  app = ctx;
  [data.resources, data.infrastructure] = await Promise.all([load('resources'), load('infrastructure')]);
  root = element('nav', 'map-layers');
  root.setAttribute('aria-label', copy[lang()].title);
  document.body.append(root);
  tooltip = element('div', 'map-layer-tooltip');
  tooltip.hidden = true;
  tooltip.setAttribute('role', 'tooltip');
  document.body.append(tooltip);
  applyHash(ctx);
  render();
  document.addEventListener('keydown', keydown);
  ctx.canvas.addEventListener('pointermove', event => { if (event.pointerType !== 'touch') showFeature(event); });
  let touchStart = null;
  ctx.canvas.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') touchStart = [event.clientX, event.clientY]; });
  ctx.canvas.addEventListener('pointerup', event => {
    if (event.pointerType === 'touch' && touchStart && Math.hypot(event.clientX - touchStart[0], event.clientY - touchStart[1]) < 4) showFeature(event);
    touchStart = null;
  });
  ctx.canvas.addEventListener('pointerleave', hideTooltip);
  document.addEventListener('pointerdown', event => { if (menu?.open && !root.contains(event.target)) menu.open = false; });
}
export function onLang(ctx) { if (app && root) { app = ctx; root.setAttribute('aria-label', copy[lang()].title); render(); hideTooltip(); } }
export function onHash(ctx) { if (app && root) { app = ctx; applyHash(ctx); render(); hideTooltip(); } }
export function onRedraw(ctx) { if (app && root) drawLayers(ctx, data, enabled); }
