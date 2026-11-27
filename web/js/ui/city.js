// City View is driven by the city id in the URL, including non-CMA capitals.
let root;
let activeTab = 'economy';
let lastId = null;

const copy = {
  en: {city: 'CITY VIEW', cma: 'Census metropolitan area', ca: 'Census agglomeration', capital: 'Territorial capital', economy: 'Economy', workforce: 'Workforce', population: 'Population', employed: 'Employed', unemployment: 'Unemployment', food: 'Food', production: 'Production', gold: 'Gold · GDP', science: 'Science', culture: 'Culture', income: 'Median income', rent: 'Median rent', home: 'Median home value', jobs: 'Jobs by industry', noData: 'No data', close: 'Close city view', rank: 'Rank', capitalBadge: 'Capital', gdpNote: 'Gold is GDP in current Canadian dollars at basic prices, where published. Other yields represent jobs by industry.', jobNote: 'Jobs are counted by industry, where people live.', noJobs: 'No industry employment data available.'},
  fr: {city: 'VUE DE LA VILLE', cma: 'Région métropolitaine de recensement', ca: 'Agglomération de recensement', capital: 'Capitale territoriale', economy: 'Économie', workforce: 'Main-d’œuvre', population: 'Population', employed: 'Personnes occupées', unemployment: 'Chômage', food: 'Nourriture', production: 'Production', gold: 'Or · PIB', science: 'Science', culture: 'Culture', income: 'Revenu médian', rent: 'Loyer médian', home: 'Valeur médiane des logements', jobs: 'Emplois par secteur', noData: 'Aucune donnée', close: 'Fermer la vue de la ville', rank: 'Rang', capitalBadge: 'Capitale', gdpNote: 'L’or représente le PIB en dollars canadiens courants aux prix de base, lorsqu’il est publié. Les autres rendements représentent les emplois par secteur.', jobNote: 'Les emplois sont comptés par secteur, selon le lieu de résidence.', noJobs: 'Aucune donnée sur les emplois par secteur.'}
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list = payload => Array.isArray(payload) ? payload : (payload?.cities || []);
const selected = () => new URLSearchParams(location.hash.slice(1)).get('city');
const langOf = ctx => ctx.getLang() === 'fr' ? 'fr' : 'en';
// Official fixture abbreviations and postal abbreviations both map to PRUID.
const provinceCodes = {nl:'10', nlfld:'10', pe:'11', pei:'11', ns:'12', nb:'13', qc:'24', que:'24', on:'35', ont:'35', mb:'46', man:'46', sk:'47', sask:'47', ab:'48', alta:'48', bc:'59', yt:'60', nt:'61', nwt:'61', nu:'62', nvt:'62'};
function provinceNames(city, ctx, lang) {
  return (city.provinces || []).map(abbr => {
    const normalized = String(abbr).toLowerCase().replace(/[^a-z]/g, '');
    const code = provinceCodes[normalized];
    const entry = (ctx.world?.provinces || []).find(item => item.pruid === code || item.abbr === abbr);
    return local(entry?.name, lang) || abbr;
  }).join(' · ');
}
const local = (value, lang) => typeof value === 'string' ? value : value?.[lang] || value?.en || '';
function format(value, lang, type = 'number') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return copy[lang].noData;
  const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
  if (type === 'percent') return new Intl.NumberFormat(locale, {style: 'percent', maximumFractionDigits: 1}).format(value);
  const n = new Intl.NumberFormat(locale, {maximumFractionDigits: 0}).format(value);
  return type === 'cad' ? `${n} CAD` : n;
}
function changeSelection(id) {
  const p = new URLSearchParams(location.hash.slice(1));
  if (id) { p.set('city', id); p.delete('province'); }
  else p.delete('city');
  history.pushState(null, '', '#' + p.toString());
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
function stat(label, value, rank, lang) {
  const rankText = typeof rank === 'number' && Number.isFinite(rank) ? `<span class="cc-stat-rank">${esc(copy[lang].rank)} ${esc(rank)}</span>` : '';
  return `<div class="cc-stat"><span class="cc-stat-label">${esc(label)}</span><strong class="cc-stat-value">${esc(value)}</strong>${rankText}</div>`;
}
function render(ctx) {
  if (!root) return;
  const id = selected();
  const city = list(ctx.cities).find(item => String(item.id) === id);
  if (!city) { root.hidden = true; root.replaceChildren(); lastId = null; return; }
  if (id !== lastId) {
    activeTab = 'economy';
    lastId = id;
    document.dispatchEvent(new CustomEvent('canadaciv:panel-open', {detail: {source: 'city'}}));
  }
  const lang = langOf(ctx), t = copy[lang], ranks = city.ranks || {}, yields = city.yields || {};
  const gold = Object.hasOwn(yields, 'gold') ? yields.gold : city.gdp;
  const kind = city.kind === 'capital' ? t.capital : city.kind === 'ca' ? t.ca : t.cma;
  const provinces = Array.isArray(city.provinces) ? provinceNames(city, ctx, lang) : '';
  const economic = [
    stat(t.population, format(city.population, lang), ranks.population, lang),
    stat(t.gold, format(gold, lang, 'cad'), ranks.gold ?? ranks.gdp, lang),
    stat(t.food, format(yields.food, lang), ranks.food, lang),
    stat(t.production, format(yields.production, lang), ranks.production, lang),
    stat(t.science, format(yields.science, lang), ranks.science, lang),
    stat(t.culture, format(yields.culture, lang), ranks.culture, lang),
    stat(t.income, format(city.median_income, lang, 'cad'), null, lang),
    stat(t.home, format(city.home_value, lang, 'cad'), null, lang),
    stat(t.rent, format(city.median_rent, lang, 'cad'), null, lang)
  ].join('');
  const industries = ctx.nation?.industries || {};
  const jobs = Object.entries(city.jobs || {}).filter(([, value]) => typeof value === 'number' && Number.isFinite(value));
  const workforce = [stat(t.employed, format(city.employed, lang), ranks.employed, lang), stat(t.unemployment, format(city.unemployment, lang, 'percent'), ranks.unemployment, lang)].join('');
  const jobRows = jobs.map(([key, value]) => `<li><span>${esc(local(industries[key], lang) || key.replaceAll('_', ' '))}</span><strong>${esc(format(value, lang))}</strong></li>`).join('');
  root.innerHTML = `<div class="cc-panel-header"><div><span class="cc-panel-kicker">${esc(t.city)} · ${esc(kind)}</span><h2>${esc(local(city.name, lang))}</h2><p>${esc(provinces)}${city.capital ? ` · ${esc(t.capitalBadge)}` : ''}</p></div><button type="button" class="cc-panel-close" aria-label="${esc(t.close)}">×</button></div><div class="cc-panel-tabs" role="tablist"><button type="button" class="cc-panel-tab" role="tab" data-tab="economy" aria-selected="${activeTab === 'economy'}">${esc(t.economy)}</button><button type="button" class="cc-panel-tab" role="tab" data-tab="workforce" aria-selected="${activeTab === 'workforce'}">${esc(t.workforce)}</button></div><div class="cc-panel-body">${activeTab === 'economy' ? `<div class="cc-stat-grid">${economic}</div><p class="cc-panel-note">${esc(t.gdpNote)}</p>` : `<div class="cc-stat-grid">${workforce}</div><section class="cc-panel-section"><h3>${esc(t.jobs)}</h3>${jobs.length ? `<ul class="cc-jobs-list">${jobRows}</ul>` : `<p class="cc-panel-note">${esc(t.noJobs)}</p>`}</section><p class="cc-panel-note">${esc(t.jobNote)}</p>`}</div>`;
  root.hidden = false;
  root.querySelector('.cc-panel-close').onclick = () => changeSelection(null);
  root.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { activeTab = button.dataset.tab; render(ctx); }));
}
export async function init(ctx) {
  root = document.createElement('section');
  root.className = 'cc-panel cc-city-panel';
  root.hidden = true;
  document.querySelector('#panel-root').append(root);
  window.addEventListener('canadaciv:select-city', event => {
    const id = event.detail?.id;
    if (id != null && list(ctx.cities).some(city => String(city.id) === String(id))) changeSelection(String(id));
  });
  document.addEventListener('canadaciv:panel-open', event => {
    if (event.detail?.source !== 'city' && root) root.hidden = true;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && root && !root.hidden && selected()) { event.preventDefault(); changeSelection(null); }
  });
  render(ctx);
}
export function onLang(ctx) { render(ctx); }
export function onHash(ctx) { render(ctx); }
export function onRedraw() {}
export function onClick() {}
