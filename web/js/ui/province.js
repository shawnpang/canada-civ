import {cell} from '../hex.js';
import {hitCity} from './banners.js';
import {getYear} from './timeslider.js';

let root;
let lastId = null;
const codes = {'10':'NL', '11':'PE', '12':'NS', '13':'NB', '24':'QC', '35':'ON', '46':'MB', '47':'SK', '48':'AB', '59':'BC', '60':'YT', '61':'NT', '62':'NU'};
const words = {
  en: {title: 'PROVINCE / TERRITORY', population: 'Population', food: 'Food', production: 'Production', gold: 'Gold · GDP', science: 'Science', culture: 'Culture', unemployment: 'Unemployment', land: 'Land mix', noLand: 'No land mix data available.', note: 'Gold is GDP in current Canadian dollars at basic prices. Other yields represent jobs by industry.', landNote: 'Land mix is the average cover share across mapped land hexes.', noData: 'No data', rank: 'Rank among 13', close: 'Close province view', forest: 'Forest', crop: 'Cropland', cropland: 'Cropland', pasture: 'Pasture', grass: 'Grassland', grassland: 'Grassland', shrub: 'Shrubland', scrub: 'Shrubland', wetland: 'Wetland', developed: 'Developed', urban: 'Urban', barren: 'Barren', ice: 'Snow and ice'},
  fr: {title: 'PROVINCE / TERRITOIRE', population: 'Population', food: 'Nourriture', production: 'Production', gold: 'Or · PIB', science: 'Science', culture: 'Culture', unemployment: 'Chômage', land: 'Couverture terrestre', noLand: 'Aucune donnée sur la couverture terrestre.', note: 'L’or représente le PIB en dollars canadiens courants aux prix de base. Les autres rendements représentent les emplois par secteur.', landNote: 'La couverture terrestre est la part moyenne des hexagones terrestres cartographiés.', noData: 'Aucune donnée', rank: 'Rang parmi 13', close: 'Fermer la vue de la province', forest: 'Forêt', crop: 'Terres cultivées', cropland: 'Terres cultivées', pasture: 'Pâturages', grass: 'Prairies', grassland: 'Prairies', shrub: 'Arbustes', scrub: 'Arbustes', wetland: 'Milieux humides', developed: 'Terrains aménagés', urban: 'Milieu urbain', barren: 'Terres dénudées', ice: 'Neige et glace'}
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const local = (value, lang) => typeof value === 'string' ? value : value?.[lang] || value?.en || '';
const provinces = payload => Array.isArray(payload) ? payload : (payload?.provinces || []);
function format(value, lang, type = 'number') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return words[lang].noData;
  const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
  if (type === 'percent') return new Intl.NumberFormat(locale, {style: 'percent', maximumFractionDigits: 1}).format(value);
  const result = new Intl.NumberFormat(locale, {maximumFractionDigits: 0}).format(value);
  return type === 'cad' ? `${result} CAD` : result;
}
function stat(label, value, rank, lang, rankYear = null) {
  const ranking = typeof rank === 'number' && Number.isFinite(rank) ? `<span class="cc-stat-rank">${esc(words[lang].rank)}${rankYear ? ` · ${esc(rankYear)}` : ''}: ${esc(rank)}</span>` : '';
  return `<div class="cc-stat"><span class="cc-stat-label">${esc(label)}</span><strong class="cc-stat-value">${esc(value)}</strong>${ranking}</div>`;
}
function updateHash(code) {
  const p = new URLSearchParams(location.hash.slice(1));
  p.delete('city');
  if (code) p.set('province', code); else p.delete('province');
  history.pushState(null, '', '#' + p.toString());
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
function render(ctx) {
  if (!root) return;
  const p = new URLSearchParams(location.hash.slice(1));
  const id = p.get('province');
  const province = !p.has('city') && provinces(ctx.provinces).find(item => item.abbr === id || item.pruid === id || codes[item.pruid] === id);
  if (!province) { root.hidden = true; root.replaceChildren(); lastId = null; return; }
  if (id !== lastId) {
    lastId = id;
    document.dispatchEvent(new CustomEvent('canadaciv:panel-open', {detail: {source: 'province'}}));
  }
  const lang = ctx.getLang() === 'fr' ? 'fr' : 'en', t = words[lang], yields = province.yields || {}, ranks = province.ranks || {};
  const gold = Object.hasOwn(yields, 'gold') ? yields.gold : province.gdp;
  const year = getYear();
  const stats = [
    stat(`${t.population} · ${year ?? '—'}`, format(province.population, lang), ranks.population, lang, year !== 2025 ? 2025 : null),
    stat(`${t.gold} · 2021`, format(gold, lang, 'cad'), ranks.gold ?? ranks.gdp, lang),
    stat(t.food, format(yields.food, lang), ranks.food, lang),
    stat(t.production, format(yields.production, lang), ranks.production, lang),
    stat(t.science, format(yields.science, lang), ranks.science, lang),
    stat(t.culture, format(yields.culture, lang), ranks.culture, lang),
    stat(t.unemployment, format(province.unemployment, lang, 'percent'), ranks.unemployment, lang)
  ].join('');
  const land = province.land && typeof province.land === 'object' ? Object.entries(province.land).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)) : [];
  const landRows = land.map(([key, value]) => `<li><span>${esc(t[key] || key.replaceAll('_', ' '))}</span><strong>${esc(format(value, lang, 'percent'))}</strong></li>`).join('');
  root.innerHTML = `<div class="cc-panel-header"><div><span class="cc-panel-kicker">${esc(t.title)}</span><h2>${esc(local(province.name, lang))}</h2></div><button type="button" class="cc-panel-close" aria-label="${esc(t.close)}">×</button></div><div class="cc-panel-body"><div class="cc-stat-grid">${stats}</div><p class="cc-panel-note">${esc(t.note)}</p><section class="cc-panel-section"><h3>${esc(t.land)}</h3>${land.length ? `<ul class="cc-jobs-list">${landRows}</ul><p class="cc-panel-note">${esc(t.landNote)}</p>` : `<p class="cc-panel-note">${esc(t.noLand)}</p>`}</section></div>`;
  root.hidden = false;
  root.querySelector('.cc-panel-close').onclick = () => updateHash(null);
}
export async function init(ctx) {
  root = document.createElement('section');
  root.className = 'cc-panel cc-province-panel';
  root.hidden = true;
  document.querySelector('#panel-root').append(root);
  document.addEventListener('canadaciv:panel-open', event => {
    if (event.detail?.source !== 'province' && root) root.hidden = true;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && root && !root.hidden && !new URLSearchParams(location.hash.slice(1)).has('city')) { event.preventDefault(); updateHash(null); }
  });
  render(ctx);
}
export function onClick(ctx, event) {
  if (!ctx.world || hitCity(ctx, event)) return;
  const {cols, rows, radius} = ctx.world.grid;
  const [col, row] = cell(event.x, event.y, radius);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return;
  const owner = ctx.world.owner[row * cols + col];
  if (!Number.isInteger(owner) || owner < 0) return;
  const entry = ctx.world.provinces[owner];
  if (entry) updateHash(codes[entry.pruid] || entry.abbr);
}
export function onLang(ctx) { render(ctx); }
export function onHash(ctx) { render(ctx); }
export function onRedraw() {}
