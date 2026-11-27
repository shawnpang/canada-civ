import {setHashKeys, writeHash} from './hash.js';
import {center} from '../hex.js';
import {getYear} from './timeslider.js';

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
  {id:'wonders', icon:'✧', color:'#c8aa72', en:'Wonders', fr:'Merveilles', desc:['Parks, historic sites and natural landmarks.','Parcs, lieux historiques et repères naturels.']},
  {id:'explorer', icon:'⌖', color:'#aaa0c8', en:'Explorer', fr:'Explorateur', desc:['Compare available measures across places.','Comparer les mesures disponibles selon le lieu.']}
];
const fields = {
  population:{en:'Population',fr:'Population'}, gold:{en:'GDP',fr:'PIB',format:'cad'}, median_income:{en:'Median income',fr:'Revenu médian',format:'cad'}, home_value:{en:'Home value',fr:'Valeur du logement',format:'cad'}, unemployment:{en:'Unemployment',fr:'Chômage',format:'percent'}, science:{en:'Information and professional services workforce',fr:'Effectifs en information et services professionnels'}, culture:{en:'Culture workforce',fr:'Effectifs culturels'}, food:{en:'Food workforce',fr:'Effectifs alimentaires'}, production:{en:'Production workforce',fr:'Effectifs de production'}, growth:{en:'Population growth',fr:'Croissance démographique',format:'percent'}, forest:{en:'Forest cover',fr:'Couverture forestière',format:'percent'}, density:{en:'Population density / km²',fr:'Densité de population / km²'}, income:{en:'Median income',fr:'Revenu médian',format:'cad'}, home:{en:'Home value',fr:'Valeur du logement',format:'cad'}, poverty:{en:'Low income',fr:'Faible revenu',format:'percent'}, age:{en:'Median age',fr:'Âge médian'}, bachelors:{en:'Bachelor’s degree or higher',fr:'Baccalauréat ou grade supérieur',format:'percent'}, farmland:{en:'Cropland cover',fr:'Couverture des terres cultivées',format:'percent'}, developed:{en:'Developed cover',fr:'Couverture aménagée',format:'percent'}, official_language:{en:'French first official language spoken',fr:'Français comme première langue officielle parlée',format:'percent'}, land_area:{en:'Land area (km²)',fr:'Superficie terrestre (km²)'}
};
Object.assign(fields, {crop:{en:'Cropland cover',fr:'Couverture des terres cultivées',format:'percent'}, pasture:{en:'Pasture cover',fr:'Couverture des pâturages',format:'percent'}, grass:{en:'Grassland cover',fr:'Couverture des prairies',format:'percent'}, shrub:{en:'Shrub cover',fr:'Couverture arbustive',format:'percent'}, wetland:{en:'Wetland cover',fr:'Couverture des milieux humides',format:'percent'}});
const titles = {energy:['Power Advisor','Conseiller à l’énergie'], economy:['Treasurer','Grand argentier'], people:['Census Advisor','Conseiller au recensement'], prosperity:['Steward of Prosperity','Intendant de la prospérité'], knowledge:['Scholar','Érudit'], land:['Land Advisor','Conseiller au territoire'], military:['Defense Advisor','Conseiller à la défense'], commerce:['Trade Advisor','Conseiller au commerce'], culture:['Culture Advisor','Conseiller à la culture'], wonders:['Keeper of Wonders','Gardien des merveilles'], explorer:['Explorer','Explorateur']};
const titleFor = id => titles[id]?.[language() === 'fr' ? 1 : 0] || '';
const copy = {
 en:{open:'Advisors',council:'Your council',intro:'Explore the data behind the map. Select an advisor to begin.',close:'Close advisors',back:'Council',empty:'No data available for this advisor yet.',emptyExplain:'The published dataset is unavailable or could not be loaded.',national:'Canada',ranking:'Provinces and territories',cities:'Cities',missing:'No data',vintage:'Vintage',source:'Sources and methods are documented in the Almanac.',view:'Show on map',geo:'Geography',province:'Provinces & territories',city:'Cities',division:'Census divisions',x:'Horizontal axis',y:'Vertical axis',table:'Data table',scatter:'Compare measures',scatterEmpty:'No places have both selected measures.',noRows:'No observations available.',note:'Missing values appear as No data; scatter points require both measures. Select a place with a map point to locate it.',divisionNote:'Census divisions: Census 2021; land cover 2020. Land-cover shares average assigned hex samples. A marker shows an assigned cell, not a boundary.',geoNote:'Canada, provincial / territorial and city population estimates are {year}; census characteristics and workforce are 2021. GDP is at basic prices: Canada and cities 2022, provinces 2021; city GDP geography may differ. Values are in Canadian dollars.',landNote:'Land-cover shares are averages across mapped land hexes, not legal boundaries.',selection:'Selected on map',councilLabel:'Advisor navigation'},
 fr:{open:'Conseillers',council:'Votre conseil',intro:'Explorez les données derrière la carte. Choisissez un conseiller pour commencer.',close:'Fermer les conseillers',back:'Conseil',empty:'Aucune donnée disponible pour ce conseiller pour le moment.',emptyExplain:'Le jeu de données publié est indisponible ou n’a pas pu être chargé.',national:'Canada',ranking:'Provinces et territoires',cities:'Villes',missing:'Aucune donnée',vintage:'Millésime',source:'Les sources et méthodes sont documentées dans l’almanach.',view:'Afficher sur la carte',geo:'Géographie',province:'Provinces et territoires',city:'Villes',division:'Divisions de recensement',x:'Axe horizontal',y:'Axe vertical',table:'Tableau de données',scatter:'Comparer les mesures',scatterEmpty:'Aucun lieu ne possède les deux mesures choisies.',noRows:'Aucune observation disponible.',note:'Les valeurs manquantes sont indiquées comme Aucune donnée; le graphique exige les deux mesures. Choisissez un lieu ayant un point sur la carte pour le situer.',divisionNote:'Divisions de recensement : Recensement de 2021; couverture terrestre de 2020. Les parts sont des moyennes des échantillons d’hexagones attribués. Le repère indique une cellule attribuée, pas une limite.',geoNote:'Estimations de population du Canada, des provinces, des territoires et des villes de {year}; caractéristiques et effectifs du Recensement de 2021. PIB aux prix de base : Canada et villes 2022, provinces 2021; la géographie du PIB des villes peut différer. Valeurs en dollars canadiens.',landNote:'Les parts de couverture terrestre sont des moyennes des hexagones terrestres cartographiés, et non des limites légales.',selection:'Sélection sur la carte',councilLabel:'Navigation des conseillers'}
};
let context, root, launch, panel, active = null, geography = 'province', xField = 'population', yField = 'median_income', selectedDivision = null;
let sortKey = 'name', sortDirection = 1, selectedSite = null;
const extra = {resources:null, infrastructure:null};
const language = () => context?.getLang?.() === 'fr' ? 'fr' : 'en';
const t = key => copy[language()][key];
const geoNote = () => t('geoNote').replace('{year}', getYear() ?? '—');
const local = value => typeof value === 'object' && value !== null ? (value[language()] || value.en || value.fr || '') : (value ?? '');
const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; };
const button = (className, text, action) => { const el = node('button', className, text); el.type = 'button'; el.addEventListener('click', action); return el; };
const official = name => context?.payloadSources?.[name]?.official !== false;
const provinces = () => !official('provinces') ? [] : Array.isArray(context?.provinces) ? context.provinces : context?.provinces?.provinces || [];
const cities = () => !official('cities') ? [] : Array.isArray(context?.cities) ? context.cities : context?.cities?.cities || [];
function value(place, key) {
  const raw = ['gold','science','culture','food','production'].includes(key) ? place.yields?.[key] : place.land && ['forest','crop','pasture','grass','shrub','wetland','developed'].includes(key) ? place.land[key] : place[key];
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
  selectedSite = null; selectedDivision = kind === 'division' ? place : null;
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
    const content = node('span','adv-card-copy'); content.append(node('span','adv-card-title',titleFor(item.id)),node('strong','',item[language()]),node('span','',item.desc[language() === 'fr' ? 1 : 0])); el.append(content); list.append(el);
  }
  body.append(list);
}
function currentSelection() {
  const params = new URLSearchParams(location.hash.slice(1));
  const city = cities().find(p => String(p.id) === params.get('city'));
  if (city) return {place:city,kind:'city'};
  const province = provinces().find(p => p.abbr === params.get('province') || p.pruid === params.get('province'));
  if (province) return {place:province,kind:'province'};
  return selectedDivision ? {place:selectedDivision,kind:'division'} : selectedSite ? {place:selectedSite,kind:'site'} : null;
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
  const section = node('p','adv-note'); section.append(document.createTextNode(`${t('source')} web/data/sources.json`));
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
function sourceIds(key, kind = geography) {
  if (kind === 'division' && key === 'population') return ['statcan_census_population'];
  if (key === 'gold') return ['statcan_gdp_cma','statcan_gdp_pt_industry'];
  if (key === 'population' || key === 'growth') return ['statcan_annual_population_17100005','statcan_annual_population_17100148','statcan_annual_population_17100155'];
  if (['food','production','science','culture'].includes(key)) return ['statcan_labour_98100594'];
  if (['forest','farmland','developed','crop','pasture','grass','shrub','wetland'].includes(key)) return ['nrcan_landcover_2020'];
  return ['statcan_census_2021_profile'];
}
function leaderboard(title, places, key, kind) {
  const section = node('section','adv-section'); section.append(node('h3','',title));
  const rows = places.map(place => ({place, number:value(place,key)})).filter(row => row.number !== null).sort((a,b) => b.number-a.number).slice(0,10);
  if (!rows.length) { section.append(node('p','adv-empty',t('noRows'))); return section; }
  const list = node('div','adv-ranking'), max = Math.max(...rows.map(row => row.number),0);
  for (const row of rows) {
    const el = button('adv-rank' + (isMapSelection(row.place,kind) ? ' is-selected' : ''),'',() => selectPlace(row.place,kind));
    if (!mapPosition(row.place,kind)) { el.disabled = true; el.title = bilingual('No map point','Aucun point sur la carte'); }
    const line = node('span','adv-rank-line'); line.append(node('span','',placeName(row.place)),node('strong','',format(row.number,key))); el.append(line);
    const track = node('span','adv-track'), fill = node('span','adv-fill'); fill.style.width = `${max > 0 ? Math.max(0,row.number/max*100) : 0}%`; track.append(fill); el.append(track); if (!el.disabled) el.title = t('view'); list.append(el);
  }
  section.append(list); return section;
}
function bilingual(en, fr) { return language() === 'fr' ? fr : en; }
function locateSite(place) {
  const point = mapPosition(place, 'site');
  if (!point) return;
  selectedDivision = null;
  selectedSite = place;
  const camera = context.getCamera(), scale = Math.max(camera.scale, .45);
  context.setCamera({scale, ox:innerWidth / 2 - point[0] * scale, oy:innerHeight / 2 - point[1] * scale});
  writeHash(context); setHashKeys({city:null, province:null}); context.redraw?.(); render();
}
function statTile(body, label, number, suffix = '') {
  const tile = node('div','adv-tile');
  tile.append(node('span','adv-kicker',label),node('strong','',number == null ? t('missing') : `${new Intl.NumberFormat(language() === 'fr' ? 'fr-CA' : 'en-CA', {maximumFractionDigits:2}).format(number)}${suffix}`)); body.append(tile);
}
function siteList(body, title, items, detail) {
  const section = node('section','adv-section'); section.append(node('h3','',title));
  if (!items?.length) section.append(node('p','adv-empty',t('noRows')));
  else for (const item of items) {
    const row = node('div','adv-site');
    const name = mapPosition(item,'site') ? button('adv-place',placeName(item),() => locateSite(item)) : node('span','',placeName(item));
    row.append(name, node('span','',detail(item))); section.append(row);
  }
  body.append(section);
}
function renderSpecial(body, id) {
  const data = id === 'wonders' ? context.wonders : extra[id === 'energy' ? 'resources' : 'infrastructure'];
  if (!data) { body.append(node('p','adv-empty-box',t('empty')),node('p','adv-note',t('emptyExplain'))); return; }
  if (id === 'energy') {
    body.append(node('p','adv-caveat',local(data.rules)));
    statTile(body,bilingual('Mapped resource sites · 2016 / 2025','Sites de ressources cartographiés · 2016 / 2025'),data.summary?.mapped_sites);
    statTile(body,bilingual('Mapped clean generating capacity · 2016','Capacité de production propre cartographiée · 2016'),data.summary?.mapped_generating_capacity_mw,' MW');
    const section = node('section','adv-section'); section.append(node('h3','',bilingual('Mapped sites by type','Sites cartographiés par type')));
    for (const type of data.types || []) { const count = data.summary?.mapped_by_type?.[type.id]; const row = node('div','adv-site'); row.append(node('span','',`${local(type.name)} · ${local(data.vintage?.[type.source]) || t('missing')}`),node('strong','',count == null ? t('missing') : String(count))); section.append(row); } body.append(section);
    body.append(node('p','adv-note','web/data/resources.json')); sourceNote(body,['nrcan_clean_generation','nrcan_900a']);
  } else if (id === 'military') {
    body.append(node('p','adv-caveat',local(data.rules)));
    statTile(body,bilingual('Directory points mapped · 2026','Points du répertoire cartographiés · 2026'),data.military?.length);
    siteList(body,bilingual('Mapped bases','Bases cartographiées'),data.military,() => '2026');
    body.append(node('p','adv-note','web/data/infrastructure.json')); sourceNote(body,['dnd_bases','cgn_military']);
  } else if (id === 'commerce') {
    body.append(node('p','adv-caveat',bilingual('No freight matrix or trade volumes are published in this atlas. These infrastructure records provide context only.','Aucune matrice de fret ni aucun volume commercial ne sont publiés dans cet atlas. Ces infrastructures servent uniquement de contexte.')),node('p','adv-note',local(data.rules)));
    for (const [key,en,fr,year] of [['roads','Mapped road segments','Segments routiers cartographiés','2017'],['rail','Mapped rail segments','Segments ferroviaires cartographiés','2017'],['airports','Airports','Aéroports','2021'],['ports','Core fishing harbours','Ports de pêche essentiels','2026']]) statTile(body,`${bilingual(en,fr)} · ${year}`,data[key]?.length);
    body.append(node('p','adv-note','web/data/infrastructure.json')); sourceNote(body,['atlas_15m_roads','atlas_15m_rail','tc_airports','dfo_small_craft_harbours']);
  } else {
    for (const rule of data.rules || []) body.append(node('p','adv-caveat',local(rule)));
    siteList(body,bilingual('Selected sites · attendance 2025–26 where reported','Sites sélectionnés · fréquentation 2025–2026 lorsque déclarée'),data.items,item => item.attendance == null ? t('missing') : new Intl.NumberFormat(language() === 'fr' ? 'fr-CA' : 'en-CA').format(item.attendance));
    body.append(node('p','adv-note','web/data/wonders.json')); sourceNote(body,['parks_canada_attendance','parks_canada_locations','nrcan_cgn']);
  }
}

function renderDashboard(body, item) {
  const head = node('div','adv-dashboard-head'); head.style.setProperty('--accent',item.color);
  head.append(node('span','adv-medallion adv-medallion-large',item.icon));
  const title = node('div'); title.append(node('div','adv-kicker',titleFor(item.id)),node('h2','adv-heading',item[language()]),node('p','adv-intro',item.desc[language() === 'fr' ? 1 : 0])); head.append(title); body.append(head);
  selectionNotice(body);
  if (['energy','commerce','military','wonders'].includes(item.id)) { renderSpecial(body,item.id); return; }
  if (!item.metric) { body.append(node('p','adv-empty-box',t('empty')),node('p','adv-note',t('emptyExplain'))); return; }
  const key = item.metric, national = value(official('nation') ? context.nation?.nation || {} : {},key);
  if (key !== 'forest') {
    const tile = node('div','adv-tile'); tile.append(node('span','adv-kicker',`${t('national')} · ${fields[key][language()]} · ${measureVintage(key, 'city')}`),node('strong','',format(national,key))); body.append(tile);
  }
  body.append(node('p','adv-caveat',key === 'forest' ? t('landNote') : geoNote()),node('p','adv-note',`web/data/nation.json · web/data/provinces.json · web/data/cities.json · ${measureVintage(key, 'province')}${key === 'gold' ? ' / 2022' : ''}`));
  body.append(leaderboard(t('ranking'),provinces(),key,'province'));
  if (key === 'forest') for (const cover of ['crop','grass','shrub','wetland','developed']) body.append(leaderboard(fields[cover][language()] + ' · 2020',provinces(),cover,'province'));
  if (key === 'science') { body.append(node('p','adv-caveat',bilingual('Education: share aged 25–64 with a bachelor’s degree or higher, Census 2021.','Éducation : part des 25 à 64 ans ayant un baccalauréat ou un grade supérieur, Recensement de 2021.'))); body.append(leaderboard(fields.bachelors[language()] + ' · 2021',divisions(),'bachelors','division'),node('p','adv-note','web/data/divisions.json')); sourceNote(body,['statcan_census_2021_profile']); }
  if (key !== 'forest') body.append(leaderboard(t('cities'),cities(),key,'city'));
  const definition = context.nation?.yields?.find(entry => entry.key === key);
  if (definition?.description) body.append(node('p','adv-note',local(definition.description)));
  sourceNote(body,sourceIds(key, 'province'));
}
function measureVintage(key, kind) {
  if (['forest','farmland','developed','crop','pasture','grass','shrub','wetland'].includes(key)) return '2020';
  if (key === 'gold') return kind === 'province' ? '2021' : '2022';
  if (key === 'growth') return '2021–2025';
  if (key === 'population' && kind !== 'division') return String(getYear() ?? '—');
  return '2021';
}
function availableFields() {
  return geography === 'division' ? ['population','land_area','density','income','home','poverty','age','bachelors','forest','farmland','developed','official_language'] : ['population','gold','median_income','home_value','unemployment','growth','food','production','science','culture',...(geography === 'province' ? ['forest','crop','pasture','grass','shrub','wetland','developed'] : [])];
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
    if (mapPosition(point.place,geography)) { circle.addEventListener('click',() => selectPlace(point.place,geography)); circle.addEventListener('keydown',e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPlace(point.place,geography); } }); } else { circle.removeAttribute('tabindex'); circle.removeAttribute('role'); circle.classList.add('no-location'); } svg.append(circle);
  }
  section.append(svg); return section;
}
function renderExplorer(body) {
  const item = advisors.find(a => a.id === 'explorer');
  body.append(node('div','adv-kicker',titleFor(item.id)),node('h2','adv-heading',item[language()]),node('p','adv-intro',item.desc[language() === 'fr' ? 1 : 0]));
  selectionNotice(body);
  const controls = node('div','adv-controls');
  controls.append(selectControl(t('geo'),['province','city','division'].map(id => [id,t(id)]),geography,v => { geography = v; selectedDivision = null; sortKey = 'name'; sortDirection = 1; xField = 'population'; yField = v === 'division' ? 'income' : 'median_income'; context.redraw?.(); render(); }));
  const options = availableFields().map(id => [id,fields[id][language()]]);
  controls.append(selectControl(t('x'),options,xField,v => {xField = v; sortKey = 'name'; render();}),selectControl(t('y'),options,yField,v => {yField = v; sortKey = 'name'; render();})); body.append(controls);
  body.append(node('p','adv-caveat',geography === 'division' ? t('divisionNote') : geoNote()));
  body.append(node('p','adv-note', `${fields[xField][language()]}: ${measureVintage(xField, geography)} · ${fields[yField][language()]}: ${measureVintage(yField, geography)} · web/data/${geography === 'division' ? 'divisions' : geography === 'city' ? 'cities' : 'provinces'}.json`));
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
    for (const [key,label] of [['name',t('geo')],[xField,fields[xField][language()]],[yField,fields[yField][language()]]]) { const th = node('th'); const b = button('adv-sort', `${label}${sortKey === key ? (sortDirection === 1 ? ' ▲' : ' ▼') : ''}`, () => { sortDirection = sortKey === key ? -sortDirection : 1; sortKey = key; render(); }); th.setAttribute('aria-sort',sortKey === key ? (sortDirection === 1 ? 'ascending' : 'descending') : 'none'); th.append(b); tr.append(th); } head.append(tr); table.append(head);
    const tbody = node('tbody');
    const sorted = [...rows].sort((a,b) => { const av = sortKey === 'name' ? placeName(a) : value(a,sortKey), bv = sortKey === 'name' ? placeName(b) : value(b,sortKey); if (av == null) return bv == null ? 0 : 1; if (bv == null) return -1; return sortDirection * (typeof av === 'string' ? av.localeCompare(bv, language()) : av-bv); });
    for (const place of sorted) { const row = node('tr',isMapSelection(place,geography) ? 'is-selected' : ''); const name = node('td'); if (mapPosition(place,geography)) name.append(button('adv-place',placeName(place),() => selectPlace(place,geography))); else name.append(node('span','',`${placeName(place)} · ${bilingual('No map point','Aucun point sur la carte')}`)); row.append(name,node('td','',format(value(place,xField),xField)),node('td','',format(value(place,yField),yField))); tbody.append(row); }
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
function closePanel() { active = null; selectedDivision = null; selectedSite = null; render(); context?.redraw?.(); launch?.focus(); }
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
  await Promise.all(Object.keys(extra).map(async name => { try { const response = await fetch(`data/${name}.json`); if (!response.ok) throw new Error(response.status); extra[name] = await response.json(); } catch { extra[name] = null; } }));
  if (active) render();
}
export function onLang(ctx) { context = ctx; render(); }
export function onHash(ctx) { context = ctx; const params = new URLSearchParams(location.hash.slice(1)); if (params.has('city') || params.has('province')) { selectedDivision = null; selectedSite = null; } if (active) render(); }
export function onClick() {}
export function onRedraw(ctx) {
  context = ctx;
  if (!active) return;
  const selected = currentSelection(); if (!selected) return;
  const point = mapPosition(selected.place,selected.kind); if (!point) return;
  const camera = ctx.getCamera(), x = point[0]*camera.scale + camera.ox, y = point[1]*camera.scale + camera.oy;
  ctx.ctx.save(); ctx.ctx.beginPath(); ctx.ctx.arc(x,y,12,0,Math.PI*2); ctx.ctx.strokeStyle = '#ffe487'; ctx.ctx.lineWidth = 3; ctx.ctx.stroke(); ctx.ctx.restore();
}
