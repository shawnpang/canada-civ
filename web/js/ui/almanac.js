// The catalogue is data-driven: do not claim a source was used unless it is in
// sources.json, and do not substitute a number for an unavailable value.
let context;
let root;
let overlay;
let content;
let tabs;
let launch;
let activePage = 'about';
let previousFocus;

// The current nation payload has definitions but no source fields. These IDs
// are the actual inputs recorded in the catalogue for each measure.
const yieldSources = {
  population: ['statcan_annual_population_17100005', 'statcan_annual_population_17100148', 'statcan_annual_population_17100155'],
  food: ['statcan_labour_98100594'],
  production: ['statcan_labour_98100594'],
  gold: ['statcan_gdp_cma', 'statcan_gdp_pt_industry'],
  science: ['statcan_labour_98100594'],
  culture: ['statcan_labour_98100594'],
  unemployment: ['statcan_census_2021_profile']
};

const copy = {
  en: {
    open: 'Almanac', close: 'Close Almanac', about: 'About', yields: 'Yields',
    lenses: 'Lenses', terrain: 'Terrain', sources: 'Sources & licences',
    aboutText: 'Canada Civ is a read-only visualizer of Canada, not a game. Inspired by usaciv by Andrej Karpathy.',
    code: 'The Canada Civ code is MIT licensed. Data is covered by its own licences.',
    missing: 'Missing or suppressed data is null, never a fabricated zero.',
    fixture: 'This is a fixture catalogue for UI development, not an official data catalogue. The official catalogue will replace it when the data build is available.',
    noSources: 'No source catalogue is currently available.',
    noYields: 'Yield definitions are not currently available.',
    noLenses: 'Lens definitions are not currently available.',
    vintage: 'Vintage', source: 'Source', licence: 'Licence', publisher: 'Publisher',
    product: 'Product or table', usedFor: 'Used for', files: 'Files',
    unavailable: 'Not specified', sourceUnmapped: 'Not specified in this entry; see the source catalogue.',
    lensesIntro: 'Lenses colour the map using the measure and caveat described in each entry.',
    terrainText: 'The map is a schematic hex representation, not a legal boundary map. Consult the source catalogue for the data and vintages used in the terrain.',
    licencesIntro: 'Credit: Statistics Canada and Government of Canada data. Individual source licences are listed below.',
    ogl: 'Open Government Licence – Canada', statcan: 'Statistics Canada Open Licence',
    population: 'Population', populationMeaning: 'Resident population.',
    unemployment: 'Unemployment', unemploymentMeaning: 'Unemployment rate; suppressed or unavailable values remain missing.',
    food: 'Food', foodMeaning: 'Jobs in agriculture, forestry, fishing and hunting (NAICS 11), by place of residence.',
    production: 'Production', productionMeaning: 'Jobs in mining, quarrying and oil and gas extraction, construction and manufacturing (NAICS 21, 23 and 31–33), by place of residence.',
    gold: 'Gold', goldMeaning: 'Gross domestic product in current Canadian dollars at basic prices, by place of work. Basic prices exclude taxes on products and include subsidies on products; they differ from market prices. GDP is not shown for census divisions.',
    science: 'Science', scienceMeaning: 'Jobs in professional, scientific and technical services and information and cultural industries (NAICS 54 and 51), by place of residence.',
    culture: 'Culture', cultureMeaning: 'Jobs in arts, entertainment and recreation (NAICS 71), by place of residence; NAICS 51 is included in Science.',
    caveatMissing: 'No caveat is supplied in this entry.',
  },
  fr: {
    open: 'Almanach', close: 'Fermer l’almanach', about: 'À propos', yields: 'Rendements',
    lenses: 'Couches', terrain: 'Terrain', sources: 'Sources et licences',
    aboutText: 'Canada Civ est un visualiseur du Canada en lecture seule, pas un jeu. Inspiré d’usaciv par Andrej Karpathy.',
    code: 'Le code de Canada Civ est sous licence MIT. Les données sont assujetties à leurs propres licences.',
    missing: 'Les données manquantes ou supprimées sont nulles (null), jamais remplacées par un faux zéro.',
    fixture: 'Ce catalogue provisoire sert au développement de l’interface et ne constitue pas un catalogue officiel. Le catalogue officiel le remplacera lors de la production des données.',
    noSources: 'Aucun catalogue de sources n’est disponible pour le moment.',
    noYields: 'Les définitions des rendements ne sont pas disponibles pour le moment.',
    noLenses: 'Les définitions des couches ne sont pas disponibles pour le moment.',
    vintage: 'Millésime', source: 'Source', licence: 'Licence', publisher: 'Organisme',
    product: 'Produit ou tableau', usedFor: 'Utilisation', files: 'Fichiers',
    unavailable: 'Non précisé', sourceUnmapped: 'Non précisée dans cette entrée; voir le catalogue des sources.',
    lensesIntro: 'Les couches colorent la carte selon la mesure et la réserve décrites dans chaque entrée.',
    terrainText: 'La carte représente le territoire par des hexagones schématiques, et non par des limites légales. Consultez le catalogue pour les données et millésimes utilisés pour le terrain.',
    licencesIntro: 'Crédit : données de Statistique Canada et du gouvernement du Canada. Les licences de chaque source figurent ci-dessous.',
    ogl: 'Licence du gouvernement ouvert – Canada', statcan: 'Licence ouverte de Statistique Canada',
    population: 'Population', populationMeaning: 'Population résidente.',
    unemployment: 'Chômage', unemploymentMeaning: 'Taux de chômage; les valeurs supprimées ou indisponibles restent manquantes.',
    food: 'Nourriture', foodMeaning: 'Emplois en agriculture, foresterie, pêche et chasse (SCIAN 11), selon le lieu de résidence.',
    production: 'Production', productionMeaning: 'Emplois en extraction minière, exploitation en carrière et extraction de pétrole et de gaz, construction et fabrication (SCIAN 21, 23 et 31–33), selon le lieu de résidence.',
    gold: 'Or', goldMeaning: 'Produit intérieur brut en dollars canadiens courants aux prix de base, selon le lieu de travail. Les prix de base excluent les taxes sur les produits et comprennent les subventions sur les produits; ils diffèrent des prix du marché. Aucun PIB n’est affiché pour les divisions de recensement.',
    science: 'Science', scienceMeaning: 'Emplois dans les services professionnels, scientifiques et techniques et dans l’industrie de l’information et l’industrie culturelle (SCIAN 54 et 51), selon le lieu de résidence.',
    culture: 'Culture', cultureMeaning: 'Emplois dans les arts, spectacles et loisirs (SCIAN 71), selon le lieu de résidence; le SCIAN 51 est compris dans Science.',
    caveatMissing: 'Aucune réserve n’est fournie pour cette entrée.',
  }
};

function lang() { return context.getLang() === 'fr' ? 'fr' : 'en'; }
function text(key) { return copy[lang()][key]; }
function local(value) {
  if (value == null) return '';
  if (typeof value === 'object') return value[lang()] ?? value.en ?? value.fr ?? '';
  return String(value);
}
function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value != null) node.textContent = value;
  return node;
}
function paragraph(parent, value) { if (value) parent.append(element('p', '', value)); }
function link(parent, label, url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw Error('Unsupported URL');
    const a = element('a', '', label);
    a.href = parsed.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    parent.append(a);
  } catch { parent.append(document.createTextNode(label)); }
}
function sourceList() {
  return Array.isArray(context.sources) ? context.sources : (context.sources?.sources || []);
}
function sourceById(id) { return sourceList().find(source => source.id === id); }
function metadata(parent, label, value) {
  const p = element('p', 'almanac-meta');
  p.append(element('strong', '', `${label}: `), document.createTextNode(value || text('unavailable')));
  parent.append(p);
}
function sourceReference(parent, id) {
  const source = sourceById(id);
  const p = element('p', 'almanac-meta');
  p.append(element('strong', '', `${text('source')}: `));
  if (!id) p.append(document.createTextNode(text('sourceUnmapped')));
  else if (source) link(p, local(source.title) || source.id, source.homepage);
  else p.append(document.createTextNode(String(id)));
  parent.append(p);
  if (source) {
    metadata(parent, text('vintage'), local(source.vintage));
    metadata(parent, text('licence'), local(source.license ?? source.licence));
  }
}
function entry(title) {
  const section = element('section', 'almanac-entry');
  section.append(element('h3', '', title));
  content.append(section);
  return section;
}
function renderAbout() {
  paragraph(content, text('aboutText'));
  paragraph(content, text('code'));
  paragraph(content, text('missing'));
  if (context.sources?.fixture || context.payloadSources?.sources?.official === false) paragraph(content, text('fixture'));
  const p = element('p');
  link(p, 'usaciv', 'https://karpathy.ai/usaciv/');
  content.append(p);
  const licences = element('p');
  link(licences, text('ogl'), 'https://open.canada.ca/en/open-government-licence-canada');
  licences.append(document.createTextNode(' · '));
  link(licences, text('statcan'), 'https://www.statcan.gc.ca/en/reference/licence');
  content.append(licences);
}
function renderYields() {
  paragraph(content, text('missing'));
  const definitions = context.nation?.yields || [];
  for (const key of ['population', 'food', 'production', 'gold', 'science', 'culture', 'unemployment']) {
    const definition = definitions.find(y => y.key === key);
    const section = entry(local(definition?.label) || text(key));
    paragraph(section, text(`${key}Meaning`));
    const description = local(definition?.description);
    if (description && description !== text(`${key}Meaning`)) paragraph(section, description);
    if (key === 'population') paragraph(section, local(context.nation?.population_note));
    const sources = definition?.source ? [definition.source] : yieldSources[key];
    for (const id of sources) sourceReference(section, id);
  }
}
function renderLenses() {
  paragraph(content, text('lensesIntro'));
  const lenses = context.lenses?.lenses || [];
  if (!lenses.length) paragraph(content, text('noLenses'));
  for (const lens of lenses) {
    const section = entry(local(lens.name) || lens.id);
    paragraph(section, local(lens.description));
    paragraph(section, local(lens.note) || text('caveatMissing'));
    metadata(section, text('vintage'), local(lens.vintage || context.lenses?.vintage));
    sourceReference(section, lens.source);
  }
}
function renderTerrain() {
  paragraph(content, text('terrainText'));
  paragraph(content, text('missing'));
  for (const id of ['statcan_boundaries_2021', 'nrcan_mrdem', 'nrcan_landcover_2020', 'etopo', 'natural_earth', 'atlas_rivers', 'atlas_lakes']) {
    if (sourceById(id)) sourceReference(content, id);
  }
}
function renderSources() {
  paragraph(content, text('licencesIntro'));
  if (context.sources?.fixture || context.payloadSources?.sources?.official === false) paragraph(content, text('fixture'));
  const licences = element('p');
  link(licences, text('ogl'), 'https://open.canada.ca/en/open-government-licence-canada');
  licences.append(document.createTextNode(' · '));
  link(licences, text('statcan'), 'https://www.statcan.gc.ca/en/reference/licence');
  content.append(licences);
  const sources = sourceList();
  if (!sources.length) paragraph(content, text('noSources'));
  for (const source of sources) {
    const section = entry(local(source.title) || source.id);
    if (source.homepage) {
      const p = element('p');
      link(p, local(source.title) || source.id, source.homepage);
      section.append(p);
    }
    metadata(section, text('publisher'), local(source.publisher));
    metadata(section, text('product'), local(source.product_id ?? source.table_id));
    metadata(section, text('vintage'), local(source.vintage));
    metadata(section, text('licence'), local(source.license ?? source.licence));
    if (source.used_for) metadata(section, text('usedFor'), local(source.used_for));
    paragraph(section, local(source.description));
    if (Array.isArray(source.files) && source.files.length) {
      const p = element('p', 'almanac-meta');
      p.append(element('strong', '', `${text('files')}: `));
      source.files.forEach((file, i) => {
        if (i) p.append(document.createTextNode(' · '));
        link(p, file.file || file.url, file.url);
      });
      section.append(p);
    }
  }
}
function render() {
  if (!root) return;
  launch.textContent = text('open');
  const close = overlay.querySelector('.almanac-close');
  close.setAttribute('aria-label', text('close'));
  overlay.querySelector('h2').textContent = text('open');
  tabs.replaceChildren();
  for (const page of ['about', 'yields', 'lenses', 'terrain', 'sources']) {
    const button = element('button', '', text(page));
    button.type = 'button';
    if (activePage === page) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => {
      activePage = page;
      render();
      tabs.querySelector('[aria-current=page]')?.focus();
    });
    tabs.append(button);
  }
  content.replaceChildren();
  ({about: renderAbout, yields: renderYields, lenses: renderLenses, terrain: renderTerrain, sources: renderSources})[activePage]();
}
function close() {
  overlay.hidden = true;
  if (previousFocus?.isConnected) previousFocus.focus();
}

export async function init(ctx) {
  context = ctx;
  root = document.querySelector('#almanac-root');
  if (!root) return;
  launch = element('button', 'almanac-launch');
  launch.type = 'button';
  overlay = element('div', 'almanac-overlay');
  overlay.hidden = true;
  const dialog = element('div', 'almanac-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'almanac-title');
  const header = element('div', 'almanac-header');
  const title = element('h2');
  title.id = 'almanac-title';
  const closeButton = element('button', 'almanac-close', '×');
  closeButton.type = 'button';
  closeButton.addEventListener('click', close);
  header.append(title, closeButton);
  tabs = element('nav', 'almanac-tabs');
  content = element('div', 'almanac-content');
  dialog.append(header, tabs, content);
  overlay.append(dialog);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  launch.addEventListener('click', () => {
    previousFocus = document.activeElement;
    overlay.hidden = false;
    closeButton.focus();
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !overlay.hidden && !event.defaultPrevented) {
      event.preventDefault();
      close();
    }
  });
  root.replaceChildren(launch, overlay);
  render();
}
export function onLang(ctx) { context = ctx; render(); }
