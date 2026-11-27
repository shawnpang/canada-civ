// Canvas helpers for the optional districts payload. Coordinates supplied here
// are screen pixels; plaque positions are decorative and have no geographic
// meaning. The City View must show the schematic caveat from payload.rules.

function cityRecord(payload, cityId) {
  return payload?.cities?.[String(cityId)] || null;
}

function districtType(payload, id) {
  return Array.isArray(payload?.types) ? payload.types.find(type => type.id === id) : null;
}

function nameOf(type, lang) {
  const name = type?.name;
  if (typeof name === 'string') return name;
  return name?.[lang === 'fr' ? 'fr' : 'en'] || name?.en || '';
}

function tracePanel(g, left, top, width, height) {
  const cut = 4;
  g.beginPath();
  g.moveTo(left + cut, top);
  g.lineTo(left + width - cut, top);
  g.lineTo(left + width, top + cut);
  g.lineTo(left + width, top + height - cut);
  g.lineTo(left + width - cut, top + height);
  g.lineTo(left + cut, top + height);
  g.lineTo(left, top + height - cut);
  g.lineTo(left, top + cut);
  g.closePath();
}

// A null badge is unknown or unqualified, and is deliberately not drawn.
// Returns the painted bounds for the banner's own layout, or null.
export function drawCityTypeBadge(g, payload, cityId, {x, y, lang = 'en'} = {}) {
  if (!g || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const id = cityRecord(payload, cityId)?.badge;
  const label = nameOf(districtType(payload, id), lang);
  if (id == null || !label) return null;
  g.save();
  g.font = 'bold 10px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const width = Math.ceil(g.measureText(label).width) + 18, height = 18;
  const left = x - width / 2, top = y - height / 2;
  tracePanel(g, left, top, width, height);
  g.fillStyle = '#20394b'; g.fill();
  g.strokeStyle = '#d8b36a'; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#fff1c7'; g.fillText(label, x, y);
  g.restore();
  return {left, top, width, height};
}

// Draw a decorative plaque for each published selection. The caller supplies
// optional screen-space positions in selection order; otherwise the plaques
// form a vertical stack from (x, y). No employment numbers or
// positions are inferred. A null district list produces no plaques.
export function drawDistrictPlaques(g, payload, cityId, {x, y, lang = 'en', positions} = {}) {
  if (!g || !Number.isFinite(x) || !Number.isFinite(y)) return [];
  const districts = cityRecord(payload, cityId)?.districts;
  if (!Array.isArray(districts)) return [];
  const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
  const number = new Intl.NumberFormat(locale, {minimumFractionDigits: 1, maximumFractionDigits: 2});
  const drawn = [];
  g.save();
  g.font = 'bold 10px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const [index, district] of districts.entries()) {
    const label = nameOf(districtType(payload, district?.type), lang);
    if (!label || !Number.isFinite(district?.lq) || district.lq < 0) continue;
    const supplied = positions?.[index];
    const px = supplied ? supplied.x : x;
    const py = supplied ? supplied.y : y + index * 26;
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    const text = `${label} · ×${number.format(district.lq)}`;
    const width = Math.ceil(g.measureText(text).width) + 22, height = 22;
    const left = px - width / 2, top = py - height / 2;
    tracePanel(g, left, top, width, height);
    g.fillStyle = '#202e34'; g.fill();
    g.strokeStyle = '#d8b36a'; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = '#fff1c7'; g.fillText(text, px, py);
    drawn.push({type: district.type, left, top, width, height});
  }
  g.restore();
  return drawn;
}
