import {setHashKeys} from './hash.js';

// The shell may supply the payload; otherwise the panel loads it independently.
let root, payload, request, lastId;
const words = {
  en: {title: 'TOWN VIEW', kind: 'Census agglomeration', population: 'Population', census: '2021 Census count', estimate: 'July 1, 2025 population estimate', noData: 'No data', used: 'Used for selection', close: 'Close town view', note: 'Estimates and Census counts use different methods. The 2025 estimate is preliminary and uses 2021 boundaries.', source: 'Source: Statistics Canada'},
  fr: {title: 'VUE DE LA LOCALITÉ', kind: 'Agglomération de recensement', population: 'Population', census: 'Chiffre du Recensement de 2021', estimate: 'Estimation de la population au 1er juillet 2025', noData: 'Aucune donnée', used: 'Utilisé pour la sélection', close: 'Fermer la vue de la localité', note: 'Les estimations et les chiffres du recensement utilisent des méthodes différentes. L’estimation de 2025 est provisoire et utilise les limites de 2021.', source: 'Source : Statistique Canada'}
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const local = (value, lang) => typeof value === 'string' ? value : value?.[lang] || value?.en || '';
const list = data => Array.isArray(data) ? data : (data?.towns || []);
const selected = () => new URLSearchParams(location.hash.slice(1)).get('city');
const format = (value, lang) => typeof value === 'number' && Number.isFinite(value)
  ? new Intl.NumberFormat(lang === 'fr' ? 'fr-CA' : 'en-CA').format(value) : words[lang].noData;

function render(ctx) {
  if (!root) return;
  const town = list(payload).find(item => String(item.id) === selected());
  if (!town) { root.hidden = true; root.replaceChildren(); lastId = null; return; }
  if (String(town.id) !== lastId) {
    lastId = String(town.id);
    document.dispatchEvent(new CustomEvent('canadaciv:panel-open', {detail: {source: 'town'}}));
  }
  const lang = ctx.getLang() === 'fr' ? 'fr' : 'en', t = words[lang];
  const census = town.pop_series?.['2021'];
  const estimate = town.pop_series?.['2025'];
  const rows = [[t.census, census, '2021'], [t.estimate, estimate, '2025']].map(([label, value, year]) =>
    `<div class="town-pop-row"><span>${esc(label)}${town.population_vintage === year ? `<small>${esc(t.used)}</small>` : ''}</span><strong>${esc(format(value, lang))}</strong></div>`).join('');
  root.innerHTML = `<div class="cc-panel-header"><span class="cc-panel-kicker">${esc(t.title)} · ${esc(t.kind)}</span><h2>${esc(local(town.name, lang))}</h2><p>${esc((town.provinces || []).join(' · '))}</p><button type="button" class="cc-panel-close" aria-label="${esc(t.close)}">×</button></div><div class="cc-panel-body"><section class="cc-panel-section"><h3>${esc(t.population)}</h3>${rows}<p class="cc-panel-note">${esc(t.note)}</p><p class="cc-panel-note">${esc(t.source)}</p></section></div>`;
  root.hidden = false;
  root.querySelector('.cc-panel-close').onclick = () => setHashKeys({city: null});
}

export async function init(ctx) {
  root = document.createElement('section');
  root.className = 'cc-panel cc-town-panel';
  root.hidden = true;
  document.querySelector('#panel-root')?.append(root);
  payload = ctx.towns;
  if (!payload) {
    request = fetch('data/towns.json').then(response => {
      if (!response.ok) throw new Error('Town data unavailable');
      return response.json();
    }).then(data => { payload = data; render(ctx); }).catch(() => {});
  }
  window.addEventListener('canadaciv:select-town', event => {
    const id = event.detail?.id;
    if (id != null && list(payload).some(town => String(town.id) === String(id))) setHashKeys({city: String(id), province: null});
  });
  document.addEventListener('canadaciv:panel-open', event => { if (event.detail?.source !== 'town' && root) root.hidden = true; });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && root && !root.hidden && selected()) {
      event.preventDefault();
      setHashKeys({city: null});
    }
  });
  render(ctx);
  await request;
}
export function onLang(ctx) { render(ctx); }
export function onHash(ctx) { render(ctx); }
export function onRedraw() {}
export function onClick() {}
