import {setHashKeys, writeHash} from './hash.js';
import {center} from '../hex.js';

// The council presents only values already in the published payloads. Missing
// subject-specific datasets are deliberately represented as empty states.
const advisors = [
  {id:'energy', icon:'ϟ', color:'#d69c45', en:'Energy & Resources', fr:'Énergie et ressources', desc:['Power and the resources beneath the land.','Énergie et ressources du sous-sol.']},
  {id:'economy', icon:'▥', color:'#d5b660', en:'Economy', fr:'Économie', desc:['GDP and the industries in which people work.','PIB et secteurs d’emploi de la population.'], metric:'gold'},
  {id:'people', icon:'♟', color:'#cf967d', en:'People', fr:'Population', desc:['The people who live across Canada.','La population qui vit partout au Canada.'], metric:'population'},
  {id:'prosperity', icon:'⌂', color:'#8ebcaf', en:'Prosperity & Housing', fr:'Prospérité et logement', desc:['Income, housing and economic conditions.','Revenu, logement et conditions économiques.'], metric:'median_income'},
  {id:'knowledge', icon:'▤', color:'#81add0', en:'Knowledge', fr:'Savoir', desc:['The science and information workforce.','Les effectifs en sciences et en information.'], metric:'science'},
  {id:'land', icon:'▲', color:'#a7b970', en:'Land', fr:'Territoire', desc:['The land cover of provinces and territories.','La couverture terrestre des provinces et territoires.'], metric:'forest'},
  {id:'military', icon:'⬡', color:'#aaaeb6', en:'Military', fr:'Défense', desc:['Public information about military sites.','Renseignements publics sur les sites militaires.']},
  {id:'commerce', icon:'⚖', color:'#80b1b8', en:'Commerce', fr:'Commerce', desc:['Connections that move goods and people.','Les liens qui assurent le transport des biens et des personnes.']},
  {id:'culture', icon:'✦', color:'#c49abd', en:'Culture', fr:'Culture', desc:['Work in arts, entertainment and recreation.','Emplois dans les arts, les spectacles et les loisirs.'], metric:'culture'},
  {id:'explorer', icon:'⌖', color:'#aaa0c8', en:'Explorer', fr:'Explorateur', desc:['Compare available measures across places.','Comparer les mesures disponibles selon le lieu.']}
];
const fields = {
  population:{en:'Population',fr:'Population'}, gold:{en:'GDP',fr:'PIB',format:'cad'}, median_income:{en:'Median income',fr:'Revenu médian',format:'cad'}, home_value:{en:'Home value',fr:'Valeur du logement',format:'cad'}, unemployment:{en:'Unemployment',fr:'Chômage',format:'percent'}, science:{en:'Information and professional services workforce',fr:'Effectifs en information et services professionnels'}, culture:{en:'Culture workforce',fr:'Effectifs culturels'}, food:{en:'Food workforce',fr:'Effectifs alimentaires'}, production:{en:'Production workforce',fr:'Effectifs de production'}, growth:{en:'Population growth',fr:'Croissance démographique',format:'percent'}, forest:{en:'Forest cover',fr:'Couverture forestière',format:'percent'}, density:{en:'Population density / km²',fr:'Densité de population / km²'}, income:{en:'Median income',fr:'Revenu médian',format:'cad'}, home:{en:'Home value',fr:'Valeur du logement',format:'cad'}, poverty:{en:'Low income',fr:'Faible revenu',format:'percent'}, age:{en:'Median age',fr:'Âge médian'}, bachelors:{en:'Bachelor’s degree or higher',fr:'Baccalauréat ou grade supérieur',format:'percent'}, farmland:{en:'Cropland cover',fr:'Couverture des terres cultivées',format:'percent'}, developed:{en:'Developed cover',fr:'Couverture aménagée',format:'percent'}, official_language:{en:'French first official language spoken',fr:'Français comme première langue officielle parlée',format:'percent'}, land_area:{en:'Land area (km²)',fr:'Superficie terrestre (km²)'}
};
const copy = {
 en:{open:'Advisors',council:'Your council',intro:'Explore the data behind the map. Select an advisor to begin.',close:'Close advisors',back:'Council',empty:'No data available for this advisor yet.',emptyExplain:'The required official dataset has not been published in this atlas.',national:'Canada',ranking:'Provinces and territories',cities:'Cities',missing:'No data',vintage:'Vintage',source:'Sources and methods are documented in the Almanac.',view:'Show on map',geo:'Geography',province:'Provinces & territories',city:'Cities',division:'Census divisions',x:'Horizontal axis',y:'Vertical axis',table:'Data table',scatter:'Compare measures',scatterEmpty:'No places have both selected measures.',noRows:'No observations available.',note:'Missing observations are omitted. Select a place to locate it on the map.',divisionNote:'Census divisions: Census 2021; land cover 2020. Land-cover shares average assigned hex samples. A marker shows an assigned cell, not a boundary.',geoNote:'Population estimates are 2025; census characteristics and workforce are 2021. GDP is at basic prices: Canada and cities 2022, provinces 2021; city GDP geography may differ. Values are in Canadian dollars.',landNote:'Land-cover shares are averages across mapped land hexes, not legal boundaries.',selection:'Selected on map',councilLabel:'Advisor navigation'},
 fr:{open:'Conseillers',council:'Votre conseil',intro:'Explorez les données derrière la carte. Choisissez un conseiller pour commencer.',close:'Fermer les conseillers',back:'Conseil',empty:'Aucune donnée disponible pour ce conseiller pour le moment.',emptyExplain:'Le jeu de données officiel nécessaire n’a pas encore été publié dans cet atlas.',national:'Canada',ranking:'Provinces et territoires',cities:'Villes',missing:'Aucune donnée',vintage:'Millésime',source:'Les sources et méthodes sont documentées dans l’almanach.',view:'Afficher sur la carte',geo:'Géographie',province:'Provinces et territoires',city:'Villes',division:'Divisions de recensement',x:'Axe horizontal',y:'Axe vertical',table:'Tableau de données',scatter:'Comparer les mesures',scatterEmpty:'Aucun lieu ne possède les deux mesures choisies.',noRows:'Aucune observation disponible.',note:'Les observations manquantes sont exclues. Choisissez un lieu pour le situer sur la carte.',divisionNote:'Divisions de recensement : Recensement de 2021; couverture terrestre de 2020. Les parts sont des moyennes des échantillons d’hexagones attribués. Le repère indique une cellule attribuée, pas une limite.',geoNote:'Estimations de population de 2025; caractéristiques et effectifs du Recensement de 2021. PIB aux prix de base : Canada et villes 2022, provinces 2021; la géographie du PIB des villes peut différer. Valeurs en dollars canadiens.',landNote:'Les parts de couverture terrestre sont des moyennes des hexagones terrestres cartographiés, et non des limites légales.',selection:'Sélection sur la carte',councilLabel:'Navigation des conseillers'}
};
let context, root, launch, panel, active = null, geography = 'province', xField = 'population', yField = 'median_income', selectedDivision = null;
const language = () => context?.getLang?.() === 'fr' ? 'fr' : 'en';
const t = key => copy[language()][key];
const local = value => typeof value === 'object' && value !== null ? (value[language()] || value.en || value.fr || '') : (value ?? '');
const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; };
const button = (className, text, action) => { const el = node('button', className, text); el.type = 'button'; el.addEventListener('click', action); return el; };
const official = name => context?.payloadSources?.[name]?.official !== false;
const provinces = () => !official('provinces') ? [] : Array.isArray(context?.provinces) ? context.provinces : context?.provinces?.provinces || [];
const cities = () => !official('cities') ? [] : Array.isArray(context?.cities) ? context.cities : context?.cities?.cities || [];
function value(place, key) {
  const raw = ['gold','science','culture','food','production'].includes(key) ? place.yields?.[key] : key === 'forest' && place.land ? place.land.forest : place[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}
function format(number, key) {
  if (number == null) return t('missing');
  const type = fields[key]?.format;
  const options = type === 'percent' ? {style:'percent', maximumFractionDigits:1} : {maximumFractionDigits: key === 'density' || key === 'age' ? 1 : 0};
  const result = new Intl.NumberFormat(language() === 'fr' ? 'fr-CA' : 'en-CA', options).format(number);
  return type === 'cad' ? `${result} CAD` : result;
}
function placeName(place) { return local(place.name || place.full) || place.abbr || ''; }
function divisions() {
  const data = official('divisions') ? context?.divisions : null, cols = data?.columns;
  if (!cols || !Array.isArray(cols.cduid)) return [];
  return cols.cduid.map((id, i) => Object.fromEntries(Object.entries(cols).map(([key, values]) => [key, Array.isArray(values) ? values[i] : null])));
}
function dataRows() { return geography === 'province' ? provinces() : geography === 'city' ? cities() : divisions(); }
function mapPosition(place, kind) {
  if (Number.isFinite(place.x) && Number.isFinite(place.y)) return [place.x, place.y];
  if (Number.isFinite(place.label?.x) && Number.isFinite(place.label?.y)) return [place.label.x, place.label.y];
  const world = context.world, grid = world?.grid;
  if (Number.isInteger(place.cell) && grid && place.cell >= 0 && place.cell < grid.cols * grid.rows) return center(place.cell % grid.cols, Math.floor(place.cell / grid.cols), grid.radius);
  if (kind === 'province' && grid && world.owner) {
    const index = world.provinces?.findIndex(p => p.pruid === place.pruid);
    let x = 0, y = 0, count = 0;
    world.owner.forEach((owner, i) => { if (owner === index) { const p = center(i % grid.cols, Math.floor(i / grid.cols), grid.radius); x += p[0]; y += p[1]; count++; } });
    if (count) return [x / count, y / count];
  }
  return null;
}
function selectPlace(place, kind) {
  selectedDivision = kind === 'division' ? place : null;
  const point = mapPosition(place, kind);
  if (point) {
    const camera = context.getCamera();
    const scale = Math.max(camera.scale, kind === 'province' ? .18 : .45);
    context.setCamera({scale, ox:innerWidth / 2 - point[0] * scale, oy:innerHeight / 2 - point[1] * scale});
  }
  if (point) writeHash(context);
  if (kind === 'city') setHashKeys({city:place.id, province:null});
  else if (kind === 'province') setHashKeys({city:null, province:place.abbr});
  else { setHashKeys({city:null, province:null}); context.redraw?.(); render(); }
}
function nav() {
  const bar = node('nav','adv-nav'); bar.setAttribute('aria-label', t('councilLabel'));
  const entries = [{id:'council',icon:'♛',en:t('back'),fr:t('back')}, ...advisors];
  for (const item of entries) {
    const el = button('adv-nav-button' + (active === item.id ? ' is-active' : ''),item.icon,() => { active = item.id; render(); });
    el.title = item[language()]; el.setAttribute('aria-label',item[language()]); el.setAttribute('aria-pressed',String(active === item.id));
    if (item.color) el.style.setProperty('--accent',item.color);
    bar.append(el);
  }
  const close = button('adv-close','×',closePanel); close.setAttribute('aria-label',t('close')); bar.append(close); return bar;
}
function renderCouncil(body) {
  body.append(node('div','adv-kicker',t('council')),node('h2','adv-heading',t('open')),node('p','adv-intro',t('intro')));
  const list = node('div','adv-council');
  for (const item of advisors) {
    const el = button('adv-card','',() => { active = item.id; render(); }); el.style.setProperty('--accent',item.color);
    el.append(node('span','adv-medallion',item.icon));
    const content = node('span','adv-card-copy'); content.append(node('span','adv-card-title',`${language() === 'fr' ? 'Conseil' : 'Council'} · ${item[language()]}`),node('strong','',item[language()]),node('span','',item.desc[language() === 'fr' ? 1 : 0])); el.append(content); list.append(el);
  }
  body.append(list);
}
function currentSelection() {
  const params = new URLSearchParams(location.hash.slice(1));
  const city = cities().find(p => String(p.id) === params.get('city'));
  if (city) return {place:city,kind:'city'};
  const province = provinces().find(p => p.abbr === params.get('province') || p.pruid === params.get('province'));
  if (province) return {place:province,kind:'province'};
  return selectedDivision ? {place:selectedDivision,kind:'division'} : null;
}
function selectionNotice(body) {
  const selected = currentSelection();
  if (selected) body.append(node('p','adv-selection',`${t('selection')}: ${placeName(selected.place)}`));
}
function isMapSelection(place, kind) {
  const params = new URLSearchParams(location.hash.slice(1));
  return kind === 'city' ? params.get('city') === String(place.id) : kind === 'province' ? !params.has('city') && (params.get('province') === place.abbr || params.get('province') === place.pruid) : selectedDivision?.cduid === place.cduid;
}
function sourceNote(body, ids) {
  const section = node('p','adv-note'); section.append(document.createTextNode(t('source')));
  for (const id of [...new Set(ids)]) {
    const source = (Array.isArray(context.sources) ? context.sources : []).find(item => item.id === id);
    if (!source) continue;
    const span = node('span','adv-source'); span.append(document.createTextNode(' · '));
    if (source.homepage) { const link = node('a','',local(source.title)); link.href = source.homepage; link.target = '_blank'; link.rel = 'noopener noreferrer'; span.append(link); }
    else span.append(document.createTextNode(local(source.title)));
    if (source.vintage) span.append(document.createTextNode(` (${local(source.vintage)})`));
    section.append(span);
  }
  body.append(section);
}
function sourceIds(key) {
  if (key === 'gold') return ['statcan_gdp_cma','statcan_gdp_pt_industry'];
  if (key === 'population' || key === 'growth') return ['statcan_annual_population_17100005','statcan_annual_population_17100148','statcan_annual_population_17100155'];
  if (['food','production','science','culture'].includes(key)) return ['statcan_labour_98100594'];
  if (['forest','farmland','developed'].includes(key)) return ['nrcan_landcover_2020'];
  return ['statcan_census_2021_profile'];
}
function leaderboard(title, places, key, kind) {
  const section = node('section','adv-section'); section.append(node('h3','',title));
  const rows = places.map(place => ({place, number:value(place,key)})).filter(row => row.number !== null).sort((a,b) => b.number-a.number).slice(0,10);
  if (!rows.length) { section.append(node('p','adv-empty',t('noRows'))); return section; }
  const list = node('div','adv-ranking'), max = Math.max(...rows.map(row => row.number),0);
  for (const row of rows) {
    const el = button('adv-rank' + (isMapSelection(row.place,kind) ? ' is-selected' : ''),'',() => selectPlace(row.place,kind));
    const line = node('span','adv-rank-line'); line.append(node('span','',placeName(row.place)),node('strong','',format(row.number,key))); el.append(line);
    const track = node('span','adv-track'), fill = node('span','adv-fill'); fill.style.width = `${max > 0 ? Math.max(0,row.number/max*100) : 0}%`; track.append(fill); el.append(track); el.title = t('view'); list.append(el);
  }
  section.append(list); return section;
}
function renderDashboard(body, item) {
  const head = node('div','adv-dashboard-head'); head.style.setProperty('--accent',item.color);
  head.append(node('span','adv-medallion adv-medallion-large',item.icon));
  const title = node('div'); title.append(node('div','adv-kicker',`${language() === 'fr' ? 'Conseil' : 'Council'} · ${item[language()]}`),node('h2','adv-heading',item[language()]),node('p','adv-intro',item.desc[language() === 'fr' ? 1 : 0])); head.append(title); body.append(head);
  selectionNotice(body);
  if (!item.metric) { body.append(node('p','adv-empty-box',t('empty')),node('p','adv-note',t('emptyExplain'))); return; }
  const key = item.metric, national = value(official('nation') ? context.nation?.nation || {} : {},key);
  if (key !== 'forest') {
    const tile = node('div','adv-tile'); tile.append(node('span','adv-kicker',`${t('national')} · ${fields[key][language()]}`),node('strong','',format(national,key))); body.append(tile);
  }
  body.append(node('p','adv-caveat',key === 'forest' ? t('landNote') : t('geoNote')));
  body.append(leaderboard(t('ranking'),provinces(),key,'province'));
  if (key !== 'forest') body.append(leaderboard(t('cities'),cities(),key,'city'));
  const definition = context.nation?.yields?.find(entry => entry.key === key);
  if (definition?.description) body.append(node('p','adv-note',local(definition.description)));
  sourceNote(body,sourceIds(key));
}
function availableFields() {
  return geography === 'division' ? ['population','land_area','density','income','home','poverty','age','bachelors','forest','farmland','developed','official_language'] : ['population','gold','median_income','home_value','unemployment','growth','food','production','science','culture',...(geography === 'province' ? ['forest'] : [])];
}
function selectControl(label, values, selected, change) {
  const wrap = node('label','adv-control'); wrap.append(node('span','',label)); const select = node('select');
  for (const [id, name] of values) { const option = node('option','',name); option.value = id; option.selected = id === selected; select.append(option); }
  select.addEventListener('change',() => change(select.value)); wrap.append(select); return wrap;
}
function scatter(rows) {
  const section = node('section','adv-section'); section.append(node('h3','',t('scatter')));
  const points = rows.map(place => ({place,x:value(place,xField),y:value(place,yField)})).filter(p => p.x !== null && p.y !== null);
  if (!points.length) { section.append(node('p','adv-empty',t('scatterEmpty'))); return section; }
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns,'svg'); svg.setAttribute('viewBox','0 0 360 190'); svg.setAttribute('class','adv-scatter'); svg.setAttribute('role','group'); svg.setAttribute('aria-label',`${fields[xField][language()]} / ${fields[yField][language()]}`);
  const xs = points.map(p => p.x), ys = points.map(p => p.y), minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  for (const point of points) {
    const circle = document.createElementNS(ns,'circle'); circle.setAttribute('cx', 15 + (maxX === minX ? .5 : (point.x-minX)/(maxX-minX))*330); circle.setAttribute('cy', 175 - (maxY === minY ? .5 : (point.y-minY)/(maxY-minY))*160); circle.setAttribute('r','4'); circle.setAttribute('tabindex','0'); circle.setAttribute('role','button');
    const label = `${placeName(point.place)}: ${format(point.x,xField)}, ${format(point.y,yField)}`; circle.setAttribute('aria-label',label); const tooltip = document.createElementNS(ns,'title'); tooltip.textContent = label; circle.append(tooltip);
    circle.addEventListener('click',() => selectPlace(point.place,geography)); circle.addEventListener('keydown',e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPlace(point.place,geography); } }); svg.append(circle);
  }
  section.append(svg); return section;
}
function renderExplorer(body) {
  const item = advisors.find(a => a.id === 'explorer');
  body.append(node('div','adv-kicker',`${language() === 'fr' ? 'Conseil' : 'Council'} · ${item[language()]}`),node('h2','adv-heading',item[language()]),node('p','adv-intro',item.desc[language() === 'fr' ? 1 : 0]));
  selectionNotice(body);
  const controls = node('div','adv-controls');
  controls.append(selectControl(t('geo'),['province','city','division'].map(id => [id,t(id)]),geography,v => { geography = v; selectedDivision = null; xField = 'population'; yField = v === 'division' ? 'income' : 'median_income'; context.redraw?.(); render(); }));
  const options = availableFields().map(id => [id,fields[id][language()]]);
  controls.append(selectControl(t('x'),options,xField,v => {xField = v; render();}),selectControl(t('y'),options,yField,v => {yField = v; render();})); body.append(controls);
  body.append(node('p','adv-caveat',geography === 'division' ? t('divisionNote') : t('geoNote')));
  if (geography === 'division') {
    for (const key of new Set([xField,yField])) {
      const definition = context.lenses?.lenses?.find(lens => lens.id === key);
      if (definition?.description) body.append(node('p','adv-note',local(definition.description)));
    }
  }
  const rows = dataRows(); body.append(scatter(rows));
  const section = node('section','adv-section'); section.append(node('h3','',t('table')),node('p','adv-note',t('note')));
  if (!rows.length) section.append(node('p','adv-empty',t('noRows')));
  else {
    const table = node('table','adv-table'), head = node('thead'), tr = node('tr');
    for (const label of [t('geo'),fields[xField][language()],fields[yField][language()]]) tr.append(node('th','',label)); head.append(tr); table.append(head);
    const tbody = node('tbody');
    for (const place of rows) { const row = node('tr',isMapSelection(place,geography) ? 'is-selected' : ''); const name = node('td'); name.append(button('adv-place',placeName(place),() => selectPlace(place,geography))); row.append(name,node('td','',format(value(place,xField),xField)),node('td','',format(value(place,yField),yField))); tbody.append(row); }
    table.append(tbody); const scroll = node('div','adv-table-scroll'); scroll.append(table); section.append(scroll);
  }
  body.append(section); sourceNote(body,[...sourceIds(xField),...sourceIds(yField)]);
}
function render() {
  if (!root) return;
  launch.textContent = `♛ ${t('open')}`; launch.setAttribute('aria-expanded',String(Boolean(active)));
  panel.hidden = !active; panel.replaceChildren();
  if (!active) return;
  panel.setAttribute('aria-label',t('open')); panel.append(nav());
  const body = node('div','adv-body'); panel.append(body);
  if (active === 'council') renderCouncil(body);
  else if (active === 'explorer') renderExplorer(body);
  else { const item = advisors.find(a => a.id === active); if (item) renderDashboard(body,item); }
}
function closePanel() { active = null; selectedDivision = null; render(); context?.redraw?.(); launch?.focus(); }
export async function init(ctx) {
  context = ctx; root = document.querySelector('#advisors-root'); if (!root) return;
  launch = button('adv-launch','',() => { active = active ? null : 'council'; if (active) document.dispatchEvent(new CustomEvent('canadaciv:panel-open',{detail:{source:'advisors'}})); render(); });
  panel = node('aside','adv-panel'); panel.hidden = true; root.append(launch); document.body.append(panel);
  document.addEventListener('canadaciv:panel-open',event => {
    const source = event.detail?.source;
    if (source !== 'advisors' && active && (!['city','province'].includes(source) || innerWidth <= 700)) closePanel();
  });
  document.addEventListener('keydown',event => { if (event.key === 'Escape' && active) { event.preventDefault(); event.stopImmediatePropagation(); closePanel(); } });
  render();
}
export function onLang(ctx) { context = ctx; render(); }
export function onHash(ctx) { context = ctx; const params = new URLSearchParams(location.hash.slice(1)); if (params.has('city') || params.has('province')) selectedDivision = null; if (active) render(); }
export function onClick() {}
export function onRedraw(ctx) {
  context = ctx;
  if (!active) return;
  const selected = currentSelection(); if (!selected) return;
  const point = mapPosition(selected.place,selected.kind); if (!point) return;
  const camera = ctx.getCamera(), x = point[0]*camera.scale + camera.ox, y = point[1]*camera.scale + camera.oy;
  ctx.ctx.save(); ctx.ctx.beginPath(); ctx.ctx.arc(x,y,12,0,Math.PI*2); ctx.ctx.strokeStyle = '#ffe487'; ctx.ctx.lineWidth = 3; ctx.ctx.stroke(); ctx.ctx.restore();
}
