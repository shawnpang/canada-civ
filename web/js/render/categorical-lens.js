// A categorical lens uses published keys, not interpolated numeric values.
// Unknown keys and missing observations both retain the no-data treatment.
export function categoricalColor(lens, value) {
  if (lens?.type !== 'categorical' || value == null || !Array.isArray(lens.categories)) return null;
  const category = lens.categories.find(item => item.value === value);
  return /^#[0-9a-f]{6}$/i.test(category?.color || '') ? category.color : null;
}

// Called from the common legend after its heading and description. The
// existing no-data swatch, vintage and caveat follow this list.
export function renderCategoricalLegend(panel, lens, lang) {
  if (lens?.type !== 'categorical') return false;
  const categories = Array.isArray(lens.categories) ? lens.categories : [];
  for (const category of categories) {
    const colour = categoricalColor(lens, category.value);
    const name = typeof category.name === 'string' ? category.name : category.name?.[lang] || category.name?.en;
    if (!colour || !name) continue;
    const row = document.createElement('div');
    row.className = 'lens-legend__missing';
    const swatch = document.createElement('span');
    swatch.className = 'lens-legend__missing-swatch';
    swatch.style.background = colour;
    swatch.setAttribute('aria-hidden', 'true');
    row.append(swatch, document.createTextNode(name));
    panel.append(row);
  }
  return true;
}
