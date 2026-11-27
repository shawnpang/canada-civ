/* National yields and the corresponding province/territory and CMA reports. */
const metrics = [
  {key: 'population', icon: '♟', en: 'Population', fr: 'Population', color: '#e2d7b8'},
  {key: 'food', icon: '❧', en: 'Food', fr: 'Nourriture', color: '#9dbf5b'},
  {key: 'production', icon: '⚒', en: 'Production', fr: 'Production', color: '#c7aa6a'},
  {key: 'gold', icon: '◆', en: 'Gold', fr: 'Or', color: '#e7c764'},
  {key: 'science', icon: '✦', en: 'Science', fr: 'Science', color: '#8ebbdc'},
  {key: 'culture', icon: '❖', en: 'Culture', fr: 'Culture', color: '#c89bc6'},
  {key: 'unemployment', icon: '◔', en: 'Unemployment', fr: 'Chômage', color: '#d8a78b'}
];

let context = null;
let selected = null;
let report = null;

function lang() { return context?.getLang?.() === 'fr' ? 'fr' : 'en'; }
function tr(en, fr) { return lang() === 'fr' ? fr : en; }
function localized(value) {
  if (value && typeof value === 'object') return value[lang()] || value.en || value.fr || '';
  return value == null ? '' : String(value);
}
function valueFor(area, key) {
  if (!area) return null;
  const value = key === 'population' || key === 'unemployment'
    ? area[key]
    : area.yields?.[key];
  // A real zero remains a real zero; absent or suppressed values remain missing.
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function format(value, key) {
  if (value === null) return tr('No data', 'Aucune donnée');
  const locale = lang() === 'fr' ? 'fr-CA' : 'en-CA';
  if (key === 'unemployment') {
    return new Intl.NumberFormat(locale, {style: 'percent', maximumFractionDigits: 1}).format(value);
  }
  const number = new Intl.NumberFormat(locale, {maximumFractionDigits: 0}).format(value);
  return key === 'gold' ? `${number} CAD` : number;
}
function compact(value, key) {
  if (value === null || key === 'unemployment') return format(value, key);
  const locale = lang() === 'fr' ? 'fr-CA' : 'en-CA';
  const number = new Intl.NumberFormat(locale, {notation: 'compact', maximumFractionDigits: 1}).format(value);
  return key === 'gold' ? `${number} CAD` : number;
}
function vintage() {
  if (context.nation?.fixture) return tr('Fixture — official vintage pending', 'Données de démonstration — millésime officiel à venir');
  const value = localized(context.nation?.vintage);
  if (lang() === 'fr' && value === 'Population estimates July 2025; Census 2021 characteristics') {
    return 'Estimations de population de juillet 2025; caractéristiques du Recensement de 2021';
  }
  return value || tr('Vintage unavailable', 'Millésime indisponible');
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function renderBar() {
  const bar = document.querySelector('#yield-bar');
  if (!bar || !context) return;
  bar.replaceChildren();
  bar.setAttribute('aria-label', tr('National yields', 'Rendements nationaux'));
  const national = context.nation?.nation;
  const strip = element('div', 'yield-strip');
  for (const metric of metrics) {
    const button = element('button', 'yield-chip');
    button.type = 'button';
    button.style.setProperty('--yield-color', metric.color);
    button.setAttribute('aria-label', `${metric[lang()]}: ${format(valueFor(national, metric.key), metric.key)}`);
    button.setAttribute('aria-pressed', String(selected === metric.key));
    const icon = element('span', 'yield-icon', metric.icon);
    icon.setAttribute('aria-hidden', 'true');
    const label = element('span', 'yield-label', metric[lang()]);
    const value = element('span', 'yield-value', compact(valueFor(national, metric.key), metric.key));
    button.append(icon, label, value);
    button.addEventListener('click', () => openReport(metric.key));
    strip.append(button);
  }
  bar.append(strip);
  const year = context.nation?.year;
  const turn = element('span', 'yield-turn', `${tr('Turn', 'Tour')} ${year == null ? '—' : year} · ${vintage()}`);
  bar.append(turn);
}
function leaderboard(title, items, key) {
  const section = element('section', 'yield-report-section');
  section.append(element('h3', '', title));
  const list = element('ol', 'yield-report-list');
  const available = (Array.isArray(items) ? items : [])
    .map(item => ({item, value: valueFor(item, key)}))
    .filter(entry => entry.value !== null)
    .sort((a, b) => b.value - a.value || localized(a.item.name).localeCompare(localized(b.item.name), lang()));
  if (!available.length) {
    section.append(element('p', 'yield-report-empty', tr('No data available.', 'Aucune donnée disponible.')));
    return section;
  }
  for (const {item, value} of available) {
    const row = element('li', 'yield-report-row');
    row.append(element('span', 'yield-report-place', localized(item.name) || localized(item.full)));
    row.append(element('span', 'yield-report-number', format(value, key)));
    list.append(row);
  }
  section.append(list);
  return section;
}
function renderReport() {
  if (!report || !selected || !context) return;
  const metric = metrics.find(entry => entry.key === selected);
  if (!metric) return;
  report.replaceChildren();
  report.hidden = false;
  report.setAttribute('aria-label', `${metric[lang()]} — ${tr('National report', 'Rapport national')}`);
  const header = element('div', 'yield-report-header');
  const title = element('div', 'yield-report-title');
  title.append(element('small', '', tr('NATIONAL REPORT', 'RAPPORT NATIONAL')));
  title.append(element('h2', '', metric[lang()]));
  header.append(title);
  const close = element('button', 'yield-report-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', tr('Close report', 'Fermer le rapport'));
  close.addEventListener('click', closeReport);
  header.append(close);
  report.append(header);
  report.append(element('p', 'yield-report-total', `${tr('Canada', 'Canada')} · ${format(valueFor(context.nation?.nation, selected), selected)}`));
  const definition = context.nation?.yields?.find(entry => entry.key === selected);
  const description = localized(definition?.description);
  if (description) report.append(element('p', 'yield-report-note', description));
  report.append(element('p', 'yield-report-note', `${tr('Vintage', 'Millésime')} : ${vintage()}`));
  if (selected === 'population') {
    const note = localized(context.nation?.population_note);
    if (note) report.append(element('p', 'yield-report-note', note));
  }
  if (selected === 'gold') {
    let gdpVintage = localized(context.nation?.gdp_vintage);
    if (lang() === 'fr' && gdpVintage === '2022, 36-10-0468-01 (CMA geography varies: see gdp_geography_vintage); provinces 2021, 36-10-0711-01') {
      gdpVintage = '2022, 36-10-0468-01 (le millésime géographique des RMR varie); provinces : 2021, 36-10-0711-01';
    }
    report.append(element('p', 'yield-report-note', tr(
      'GDP is in current Canadian dollars at basic prices, where work takes place.',
      'Le PIB est exprimé en dollars canadiens courants aux prix de base, selon le lieu de travail.'
    ) + (gdpVintage ? ` ${gdpVintage}` : '')));
  }
  const columns = element('div', 'yield-report-columns');
  columns.append(leaderboard(tr('Provinces & territories', 'Provinces et territoires'),
    Array.isArray(context.provinces) ? context.provinces : context.provinces?.provinces, selected));
  columns.append(leaderboard(tr('Census metropolitan areas', 'Régions métropolitaines de recensement'),
    (Array.isArray(context.cities) ? context.cities : []).filter(city => city.kind === 'cma'), selected));
  report.append(columns);
  report.append(element('p', 'yield-report-note', tr('Areas without data are omitted.', 'Les régions sans données sont exclues.')));
}
function openReport(key) {
  // A national report replaces any selected city or province in the URL.
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('city') || params.has('province')) {
    params.delete('city');
    params.delete('province');
    history.pushState(null, '', `${location.pathname}${location.search}#${params}`);
    window.dispatchEvent(new Event('hashchange'));
  }
  selected = key;
  document.dispatchEvent(new CustomEvent('canadaciv:panel-open', {detail: {source: 'yields'}}));
  renderBar();
  renderReport();
}
function closeReport() {
  selected = null;
  if (report) report.hidden = true;
  renderBar();
}
export async function init(ctx) {
  context = ctx;
  report = document.createElement('aside');
  report.id = 'yield-report';
  report.className = 'yield-report';
  report.hidden = true;
  document.body.append(report);
  document.addEventListener('canadaciv:panel-open', event => {
    if (event.detail?.source !== 'yields' && selected) closeReport();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && selected) {
      closeReport();
      event.stopImmediatePropagation();
    }
  });
  renderBar();
}
export function onLang(ctx) {
  context = ctx;
  renderBar();
  renderReport();
}
export function onRedraw() {}
export function onHash() {}
export function onClick() {}
