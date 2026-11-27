import {renderCitizens, clearCitizens} from './citizens.js';
import {drawDistrictPlaques} from '../render/districts.js';

// City View is driven by the city id in the URL, including non-CMA capitals.
let root;
let activeTab = 'citizens';
let districts = null, resources = null;
let districtRequest, resourceRequest;
let lastId = null;

const copy = {
  en: {city: 'CITY VIEW', cma: 'Census metropolitan area', ca: 'Census agglomeration', capital: 'Territorial capital', economy: 'Economy', workforce: 'Workforce', population: 'Population', employed: 'Employed', unemployment: 'Unemployment', food: 'Food', production: 'Production', gold: 'Gold · GDP', science: 'Science', culture: 'Culture', income: 'Median income', rent: 'Median monthly shelter costs for rented dwellings (including applicable utilities), 2021', home: 'Median home value', jobs: 'Jobs by industry', noData: 'No data', close: 'Close city view', rank: 'Rank', capitalBadge: 'Capital', gdpNote: 'Gold is GDP in current Canadian dollars at basic prices, where published. Other yields represent jobs by industry.', jobNote: 'Jobs are counted by industry, where people live.', noJobs: 'No industry employment data available.', unempNote: 'Unemployment is the 2021 Census rate, not the current Labour Force Survey rate. Employed and jobs by industry are also Census 2021 figures.'},
  fr: {city: 'VUE DE LA VILLE', cma: 'Région métropolitaine de recensement', ca: 'Agglomération de recensement', capital: 'Capitale territoriale', economy: 'Économie', workforce: 'Main-d’œuvre', population: 'Population', employed: 'Personnes occupées', unemployment: 'Chômage', food: 'Nourriture', production: 'Production', gold: 'Or · PIB', science: 'Science', culture: 'Culture', income: 'Revenu médian', rent: 'Frais de logement mensuels médians des logements loués (services publics applicables compris), 2021', home: 'Valeur médiane des logements', jobs: 'Emplois par secteur', noData: 'Aucune donnée', close: 'Fermer la vue de la ville', rank: 'Rang', capitalBadge: 'Capitale', gdpNote: 'L’or représente le PIB en dollars canadiens courants aux prix de base, lorsqu’il est publié. Les autres rendements représentent les emplois par secteur.', jobNote: 'Les emplois sont comptés par secteur, selon le lieu de résidence.', noJobs: 'Aucune donnée sur les emplois par secteur.', unempNote: 'Le taux de chômage provient du Recensement de 2021, et non de l’Enquête actuelle sur la population active. Les personnes occupées et les emplois par secteur sont aussi des chiffres du Recensement de 2021.'}
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list = payload => Array.isArray(payload) ? payload : (payload?.cities || []);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const gdpPerPerson = area => finite(area.gdp) && finite(area.population) && area.population > 0
  ? area.gdp / area.population : null;
// Rank cities and provinces separately, excluding missing values. Ties share a
// rank, with the next rank reflecting the number of areas ahead of it.
function rankMeasures(areas) {
  for (const [key, valueOf] of [['gdp_per_person', gdpPerPerson], ['growth', area => area.growth]]) {
    for (const area of areas) {
      area.ranks ||= {};
      delete area.ranks[key];
      if (key === 'gdp_per_person') delete area.ranks.gdp_per_capita;
    }
    const available = areas.map(area => ({area, value: valueOf(area)}))
      .filter(entry => finite(entry.value)).sort((a, b) => b.value - a.value);
    let rank = 0;
    available.forEach((entry, index) => {
      if (index === 0 || entry.value !== available[index - 1].value) rank = index + 1;
      entry.area.ranks[key] = rank;
    });
  }
}
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
// The official payload keys jobs by NAICS code; the catalogue may not include
// an industries dictionary, so retain readable bilingual names for those codes.
const industryNames = {
  '11': {en: 'Agriculture, forestry, fishing and hunting', fr: 'Agriculture, foresterie, pêche et chasse'},
  '21': {en: 'Mining, quarrying, and oil and gas extraction', fr: 'Extraction minière, exploitation en carrière, et extraction de pétrole et de gaz'},
  '23': {en: 'Construction', fr: 'Construction'},
  '31-33': {en: 'Manufacturing', fr: 'Fabrication'},
  '51': {en: 'Information and cultural industries', fr: 'Industrie de l’information et industrie culturelle'},
  '54': {en: 'Professional, scientific and technical services', fr: 'Services professionnels, scientifiques et techniques'},
  '71': {en: 'Arts, entertainment and recreation', fr: 'Arts, spectacles et loisirs'}
};
function format(value, lang, type = 'number') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return copy[lang].noData;
  const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
  if (type === 'percent') return new Intl.NumberFormat(locale, {style: 'percent', maximumFractionDigits: 1}).format(value);
  const n = new Intl.NumberFormat(locale, {maximumFractionDigits: 0}).format(value);
  return type === 'cad' ? `${n} CAD` : n;
}
function changeSelection(id) {
  if (id && String(id) === selected()) return;
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
const extra = {
  en: {citizens: 'Citizens', districts: 'Districts', resources: 'Resources', compare: 'Compare', perPerson: 'GDP per person', growth: 'Growth', badge: 'City type', unavailable: 'Unavailable', noDistricts: 'No sector met the published threshold.', sites: 'Mapped resource sites within 50 km of the city marker', noSites: 'No resource sites mapped within 50 km of the city marker.', series: 'Population estimates', seriesNote: 'July 1 estimates on 2021 geography; 2025 preliminary. Estimates are not Census counts.', land: 'Land cover', landProvince: 'Province / territory land mix; average cover share across mapped land hexes, not a city measure.', landCity: 'City land cover', ratioNote: 'GDP per person divides 2022 GDP at basic prices by the July 2025 population estimate. GDP often uses 2011 CMA geography; these vintages and boundaries differ.', loading: 'Loading…', failure: 'Data unavailable.', peerNote: 'Nearest cities by population; official July 2025 estimates.', rankMissing: 'No rank', forest:'Forest', crop:'Cropland', pasture:'Pasture', grass:'Grassland', shrub:'Shrubland', wetland:'Wetland', developed:'Developed', barren:'Barren', ice:'Snow and ice'},
  fr: {citizens: 'Citoyens', districts: 'Quartiers', resources: 'Ressources', compare: 'Comparer', perPerson: 'PIB par personne', growth: 'Croissance', badge: 'Type de ville', unavailable: 'Indisponible', noDistricts: 'Aucun secteur ne satisfait au seuil publié.', sites: 'Sites de ressources cartographiés à moins de 50 km du repère de la ville', noSites: 'Aucun site de ressources cartographié à moins de 50 km du repère de la ville.', series: 'Estimations de la population', seriesNote: 'Estimations au 1er juillet selon la géographie de 2021; 2025 provisoire. Les estimations ne sont pas des chiffres du recensement.', land: 'Couverture terrestre', landProvince: 'Couverture de la province ou du territoire : part moyenne des hexagones terrestres cartographiés, et non une mesure de la ville.', landCity: 'Couverture terrestre de la ville', ratioNote: 'Le PIB par personne divise le PIB de 2022 aux prix de base par l’estimation de la population de juillet 2025. Le PIB utilise souvent la géographie des RMR de 2011; les millésimes et les limites diffèrent.', loading: 'Chargement…', failure: 'Données indisponibles.', peerNote: 'Villes les plus proches selon la population; estimations officielles de juillet 2025.', rankMissing: 'Aucun rang', forest:'Forêt', crop:'Terres cultivées', pasture:'Pâturages', grass:'Prairies', shrub:'Arbustes', wetland:'Milieux humides', developed:'Terrains aménagés', barren:'Terres dénudées', ice:'Neige et glace'}
};
function lazy(ctx) {
  if (!districtRequest) districtRequest = fetch('data/districts.json').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(data => { districts = data; render(ctx); }).catch(() => { districts = false; render(ctx); });
  if (!resourceRequest) resourceRequest = fetch('data/resources.json').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(data => { resources = data; if (activeTab === 'resources') render(ctx); }).catch(() => { resources = false; if (activeTab === 'resources') render(ctx); });
}
function seriesMarkup(city, lang) {
  const t = extra[lang];
  const points = Object.entries(city.pop_series || {}).filter(([,v]) => typeof v === 'number' && Number.isFinite(v));
  if (!points.length) return `<section class="cc-panel-section"><h3>${esc(t.series)}</h3><p class="cc-panel-note">${esc(copy[lang].noData)}</p></section>`;
  const max = Math.max(...points.map(([,v]) => v), 1);
  return `<section class="cc-panel-section"><h3>${esc(t.series)}</h3><div class="city-chart">${points.map(([year,value]) => `<div class="city-chart-column" title="${esc(year)}: ${esc(format(value,lang))}"><span class="city-chart-value">${esc(format(value,lang))}</span><span class="city-chart-bar" style="height:${Math.max(2, value / max * 100)}%"></span><span>${esc(year)}</span></div>`).join('')}</div><p class="cc-panel-note">${esc(t.seriesNote)}</p></section>`;
}
function landMarkup(city, ctx, lang) {
  const t = extra[lang];
  let land = city.land || city.cover;
  let note = t.landCity;
  if (!land) {
    const provinces = ctx.provinces?.provinces || ctx.provinces || [];
    const abbr = city.provinces?.[0];
    const province = provinces.find(p => p.abbr === abbr);
    land = province?.land; note = province ? `${local(province.name, lang)} · ${t.landProvince}` : t.landProvince;
  }
  const rows = Object.entries(land || {}).filter(([,v]) => typeof v === 'number' && Number.isFinite(v));
  return `<section class="cc-panel-section"><h3>${esc(t.land)}</h3>${rows.length ? `<ul class="cc-jobs-list">${rows.map(([k,v]) => `<li><span>${esc(t[k] || k)}</span><strong>${esc(format(v,lang,'percent'))}</strong></li>`).join('')}</ul><p class="cc-panel-note">${esc(note)}</p>` : `<p class="cc-panel-note">${esc(copy[lang].noData)}</p>`}</section>`;
}
function render(ctx) {
  if (!root) return;
  const id = selected();
  const city = list(ctx.cities).find(item => String(item.id) === id);
  const previousMount = root.querySelector('[data-citizens]');
  if (previousMount) clearCitizens(previousMount);
  if (!city) { root.hidden = true; root.replaceChildren(); lastId = null; return; }
  if (id !== lastId) {
    activeTab = 'citizens'; lastId = id;
    document.dispatchEvent(new CustomEvent('canadaciv:panel-open', {detail: {source: 'city'}}));
  }
  lazy(ctx);
  const lang = langOf(ctx), t = copy[lang], x = extra[lang], ranks = city.ranks || {}, yields = city.yields || {};
  const gold = city.gdp;
  const perPerson = gdpPerPerson(city);
  const kind = city.kind === 'capital' ? t.capital : city.kind === 'ca' ? t.ca : t.cma;
  const provinces = Array.isArray(city.provinces) ? provinceNames(city, ctx, lang) : '';
  const district = districts?.cities?.[id];
  const type = districts?.types?.find(item => item.id === district?.badge);
  const badge = districts === null ? x.loading : local(type?.name, lang) || x.unavailable;
  const years = Array.isArray(city.growth_years) ? city.growth_years.join('–') : '';
  const medals = [[t.population,ranks.population],[t.gold,ranks.gdp ?? ranks.gold],[x.perPerson,ranks.gdp_per_person ?? ranks.gdp_per_capita],[x.growth,ranks.growth]].map(([label,rank]) => `<div class="city-medal"><span class="city-medal-disc">${typeof rank === 'number' && Number.isFinite(rank) ? `#${esc(rank)}` : '—'}</span><span>${esc(label)}</span></div>`).join('');
  const economic = [stat(t.food, format(yields.food,lang), ranks.food,lang),stat(t.production,format(yields.production,lang),ranks.production,lang),stat(t.science,format(yields.science,lang),ranks.science,lang),stat(t.culture,format(yields.culture,lang),ranks.culture,lang),stat(t.income,format(city.median_income,lang,'cad'),null,lang),stat(t.home,format(city.home_value,lang,'cad'),null,lang),stat(t.rent,format(city.median_rent,lang,'cad'),null,lang)].join('');
  const jobs = Object.entries(city.jobs || {}).filter(([,v]) => typeof v === 'number' && Number.isFinite(v));
  const jobRows = jobs.map(([key,value]) => `<li><span>${esc(local(ctx.nation?.industries?.[key],lang) || local(industryNames[key],lang) || key.replaceAll('_',' '))}</span><strong>${esc(format(value,lang))}</strong></li>`).join('');
  let body = '';
  if (activeTab === 'citizens') body = `<div data-citizens></div>${seriesMarkup(city,lang)}${landMarkup(city,ctx,lang)}`;
  if (activeTab === 'economy') body = `<div class="cc-stat-grid">${economic}</div><p class="cc-panel-note">${esc(t.gdpNote)}</p>${seriesMarkup(city,lang)}${landMarkup(city,ctx,lang)}`;
  if (activeTab === 'workforce') body = `<div class="cc-stat-grid">${stat(t.employed,format(city.employed,lang),ranks.employed,lang)}${stat(t.unemployment,format(city.unemployment,lang,'percent'),ranks.unemployment,lang)}</div><section class="cc-panel-section"><h3>${esc(t.jobs)}</h3>${jobs.length ? `<ul class="cc-jobs-list">${jobRows}</ul>` : `<p class="cc-panel-note">${esc(t.noJobs)}</p>`}</section><p class="cc-panel-note">${esc(t.jobNote)}</p><p class="cc-panel-note">${esc(t.unempNote)}</p>`;
  if (activeTab === 'districts') {
    const ds = district?.districts;
    body = `<section class="cc-panel-section"><h3>${esc(x.districts)}</h3>${districts === null ? `<p>${esc(x.loading)}</p>` : !Array.isArray(ds) ? `<p>${esc(x.unavailable)}</p>` : ds.length ? `<canvas class="city-district-plaques" width="400" height="${ds.length * 30 + 10}" aria-label="${esc(ds.map(d => local(districts.types.find(type => type.id === d.type)?.name,lang)).join(', '))}"></canvas>` : `<p>${esc(x.noDistricts)}</p>`}<p class="cc-panel-note">${esc(local(districts?.rules,lang))}</p></section>`;
  }
  if (activeTab === 'resources') {
    const sites = resources?.items?.filter(item => String(item.city) === id || (Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(city.x) && Number.isFinite(city.y) && Math.hypot(item.x - city.x, item.y - city.y) <= 50)) || [];
    body = `<section class="cc-panel-section"><h3>${esc(x.sites)}</h3>${resources === null ? `<p>${esc(x.loading)}</p>` : resources === false ? `<p>${esc(x.failure)}</p>` : sites.length ? `<ul class="cc-jobs-list">${sites.map(site => { const kind = resources.types.find(type => type.id === site.type); return `<li><span>${esc(site.name)} · ${esc(local(kind?.name,lang))}</span><strong>${site.value == null ? '' : esc(format(site.value,lang)) + ' ' + esc(kind?.unit || '')}</strong></li>`; }).join('')}</ul>` : `<p class="cc-panel-note">${esc(x.noSites)}</p>`}<p class="cc-panel-note">${esc(local(resources?.rules,lang))}</p></section>`;
  }
  if (activeTab === 'compare') {
    const peers = (city.peers || []).map(peer => list(ctx.cities).find(item => String(item.id) === String(peer))).filter(Boolean);
    body = `<section class="cc-panel-section"><h3>${esc(x.compare)} · ${esc(t.population)}</h3>${peers.length ? `<ul class="cc-jobs-list">${peers.map(peer => `<li><span>${esc(local(peer.name,lang))}</span><strong>${esc(format(peer.population,lang))}</strong></li>`).join('')}</ul><p class="cc-panel-note">${esc(x.peerNote)}</p>` : `<p>${esc(t.noData)}</p>`}</section>`;
  }
  const tabs = ['citizens','districts','economy','workforce','resources','compare'];
  const geographyNote = city.gdp_geography_vintage ? (lang === 'fr' ? `Géographie du PIB : ${city.gdp_geography_vintage}.` : `GDP geography: ${city.gdp_geography_vintage}.`) : '';
  root.innerHTML = `<div class="cc-panel-header"><div><span class="cc-panel-kicker">${esc(t.city)} · ${esc(kind)}</span><h2>${esc(local(city.name,lang))}</h2><p>${esc(provinces)}${city.capital ? ` · ${esc(t.capitalBadge)}` : ''}</p><span class="city-type-badge">${esc(x.badge)}: ${esc(badge)}</span></div><button type="button" class="cc-panel-close" aria-label="${esc(t.close)}">×</button><div class="cc-stat-grid city-head-stats">${stat(`${t.population} · 2025`,format(city.population,lang),null,lang)}${stat(`${t.gold}${city.gdp_year ? ` · ${city.gdp_year}` : ''}`,format(gold,lang,'cad'),null,lang)}${stat(`${x.growth} · ${years}`,format(city.growth,lang,'percent'),null,lang)}${stat(x.perPerson,format(perPerson,lang,'cad'),null,lang)}</div><p class="cc-panel-note">${esc(x.ratioNote)} ${esc(geographyNote)}</p><div class="city-medals">${medals}</div></div><div class="cc-panel-tabs" role="tablist">${tabs.map(tab => `<button type="button" class="cc-panel-tab" role="tab" data-tab="${tab}" aria-selected="${activeTab === tab}">${esc(x[tab] || t[tab])}</button>`).join('')}</div><div class="cc-panel-body">${body}</div>`;
  root.hidden = false;
  root.querySelector('.cc-panel-close').onclick = () => changeSelection(null);
  root.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { activeTab = button.dataset.tab; render(ctx); }));
  const mount = root.querySelector('[data-citizens]');
  if (mount) renderCitizens(mount, {cityId: city.id, lang});
  const canvas = root.querySelector('.city-district-plaques');
  if (canvas) drawDistrictPlaques(canvas.getContext('2d'), districts, id, {x: 200, y: 15, lang});
}
export async function init(ctx) {
  rankMeasures(list(ctx.cities));
  rankMeasures(Array.isArray(ctx.provinces) ? ctx.provinces : (ctx.provinces?.provinces || []));
  root = document.createElement('section');
  root.className = 'cc-panel cc-city-panel'; root.hidden = true;
  document.querySelector('#panel-root').append(root);
  window.addEventListener('canadaciv:select-city', event => {
    const id = event.detail?.id;
    if (id != null && list(ctx.cities).some(city => String(city.id) === String(id))) changeSelection(String(id));
  });
  document.addEventListener('canadaciv:panel-open', event => { if (event.detail?.source !== 'city' && root) root.hidden = true; });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && root && !root.hidden && selected()) { event.preventDefault(); changeSelection(null); }
  });
  render(ctx);
}
export function onLang(ctx) { render(ctx); }
export function onHash(ctx) { render(ctx); }
export function onRedraw() {}
export function onClick() {}
