// Standalone City View content. Call renderCitizens again when the city or
// language changes; the shared Census payload is fetched on first use only.
const defaultUrl = new URL('../../data/citizens.json', import.meta.url);
const requests = new Map();
const generations = new WeakMap();
const copy = {
  en: {
    title: 'Citizens', loading: 'Loading Census 2021 citizen profiles…',
    error: 'The citizen profiles could not be loaded.', retry: 'Try again',
    missing: 'No data available for this city.', rowMissing: 'Some observations are unavailable; the pictogram is not shown.',
    noData: 'No data', total: 'Published total', figures: 'Each figure represents approximately',
    figuresEnd: 'of the displayed category counts.', source: 'Source', rules: 'How to read these rows',
    sourceName: 'Statistics Canada, Census of Population 2021',
    rounding: 'Census counts are rounded by Statistics Canada; category counts may not add to the published total.'
  },
  fr: {
    title: 'Citoyens', loading: 'Chargement des profils de citoyens du Recensement de 2021…',
    error: 'Impossible de charger les profils de citoyens.', retry: 'Réessayer',
    missing: 'Aucune donnée disponible pour cette ville.', rowMissing: 'Certaines observations sont indisponibles; le pictogramme n’est pas affiché.',
    noData: 'Aucune donnée', total: 'Total publié', figures: 'Chaque figurine représente environ',
    figuresEnd: 'des effectifs des catégories affichées.', source: 'Source', rules: 'Comment lire ces rangées',
    sourceName: 'Statistique Canada, Recensement de la population de 2021',
    rounding: 'Les effectifs du recensement sont arrondis par Statistique Canada; la somme des catégories peut différer du total publié.'
  }
};
const local = (value, lang) => typeof value === 'string' ? value : value?.[lang] || value?.en || '';
const number = (value, lang) => typeof value === 'number' && Number.isFinite(value)
  ? new Intl.NumberFormat(lang === 'fr' ? 'fr-CA' : 'en-CA').format(value) : copy[lang].noData;
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}
function load(url) {
  const key = String(url);
  if (!requests.has(key)) {
    requests.set(key, fetch(url).then(response => {
      if (!response.ok) throw new Error(`Citizen profile request failed (${response.status})`);
      return response.json();
    }).catch(error => { requests.delete(key); throw error; }));
  }
  return requests.get(key);
}
function row(theme, observations, lang, iconTotal) {
  const t = copy[lang];
  const section = node('section', 'citizens-row');
  section.append(node('h3', 'citizens-row-title', local(theme.label, lang)));
  const universe = local(theme.universe, lang);
  if (universe) section.append(node('p', 'citizens-universe', universe));
  const values = new Map((observations?.values || []).map(value => [value.id, value]));
  const categories = theme.categories || [];
  const hasIcons = categories.length > 0 && categories.every(category => {
    const icons = values.get(category.id)?.icons;
    return Number.isInteger(icons) && icons >= 0 && icons <= iconTotal;
  });
  if (hasIcons) {
    const pictograms = node('div', 'citizens-figures');
    // The legend provides the accessible description of these decorative figures.
    pictograms.setAttribute('aria-hidden', 'true');
    categories.forEach((category, index) => {
      for (let i = 0; i < values.get(category.id).icons; i++) {
        const figure = node('span', 'citizens-figure');
        figure.style.setProperty('--citizen-color', `var(--citizen-color-${index % 10})`);
        pictograms.append(figure);
      }
    });
    section.append(pictograms);
    const pct = new Intl.NumberFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {style: 'percent', maximumFractionDigits: 1}).format(1 / iconTotal);
    section.append(node('p', 'citizens-figure-note', `${t.figures} ${pct} ${t.figuresEnd}`));
  } else {
    section.append(node('p', 'citizens-missing', t.rowMissing));
  }
  const legend = node('ul', 'citizens-legend');
  categories.forEach((category, index) => {
    const item = node('li', 'citizens-legend-item');
    const swatch = node('span', 'citizens-swatch');
    swatch.style.setProperty('--citizen-color', `var(--citizen-color-${index % 10})`);
    swatch.setAttribute('aria-hidden', 'true');
    item.append(swatch, node('span', 'citizens-category', local(category.label, lang)),
      node('strong', 'citizens-count', number(values.get(category.id)?.count, lang)));
    legend.append(item);
  });
  section.append(legend, node('p', 'citizens-total', `${t.total}: ${number(observations?.total, lang)}`));
  return section;
}
function show(mount, payload, cityId, lang) {
  const t = copy[lang];
  const wrapper = node('div', 'citizens');
  wrapper.append(node('h2', 'citizens-title', t.title));
  const city = payload.cities?.[String(cityId)];
  if (!city) {
    wrapper.append(node('p', 'citizens-missing', t.missing));
  } else {
    const icons = Number.isInteger(payload.pictograms_per_row) && payload.pictograms_per_row > 0 ? payload.pictograms_per_row : 20;
    for (const theme of payload.themes || []) wrapper.append(row(theme, city.themes?.[theme.id], lang, icons));
    wrapper.append(node('p', 'citizens-footnote', t.rounding));
  }
  const rule = local(payload.rules, lang);
  if (rule) {
    const details = node('details', 'citizens-rules');
    details.append(node('summary', '', t.rules), node('p', '', rule));
    wrapper.append(details);
  }
  const source = node('p', 'citizens-source');
  const link = node('a', '', t.sourceName);
  link.href = lang === 'fr' ? 'https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/index-fra.cfm' : 'https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/index-eng.cfm';
  source.append(document.createTextNode(`${t.source}: `), link);
  if (payload.vintage) source.append(document.createTextNode(` · ${payload.vintage}`));
  if (payload.source_ids?.length) source.append(document.createTextNode(` (${payload.source_ids.join(', ')})`));
  wrapper.append(source);
  mount.replaceChildren(wrapper);
}
/** Render into a shell-owned element. Reinvoke for each city or language change.
 * Optional dataUrl permits a different static data location. */
export async function renderCitizens(mount, {cityId, lang = 'en', dataUrl = defaultUrl} = {}) {
  if (!mount) throw new TypeError('A citizens mount element is required');
  lang = lang === 'fr' ? 'fr' : 'en';
  const generation = (generations.get(mount) || 0) + 1;
  generations.set(mount, generation);
  mount.replaceChildren(node('p', 'citizens-loading', copy[lang].loading));
  try {
    const payload = await load(dataUrl);
    if (generations.get(mount) === generation) show(mount, payload, cityId, lang);
  } catch {
    if (generations.get(mount) !== generation) return;
    const error = node('p', 'citizens-missing', copy[lang].error);
    const retry = node('button', 'citizens-retry', copy[lang].retry);
    retry.type = 'button';
    retry.addEventListener('click', () => renderCitizens(mount, {cityId, lang, dataUrl}));
    mount.replaceChildren(error, retry);
  }
}

/** Invalidate any pending render and clear a mount when the tab closes. */
export function clearCitizens(mount) {
  if (!mount) return;
  generations.set(mount, (generations.get(mount) || 0) + 1);
  mount.replaceChildren();
}
