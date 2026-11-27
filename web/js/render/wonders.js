// Wonders use only the coordinates in their payload. Missing coordinates are
// never coerced to zero or replaced by an approximate location.
let hitBoxes = [];

function local(value, lang) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[lang] || value.en || value.fr || '';
}

function items(ctx) {
  return Array.isArray(ctx.wonders?.items) ? ctx.wonders.items : [];
}

function name(item, lang) {
  return local(item.name, lang) || item.id || '';
}

// A layer controller can call onRedraw only while the layer is enabled. If it
// exposes isLayerVisible, this module also honours that state directly.
export function onRedraw(ctx) {
  hitBoxes = [];
  if (ctx.isLayerVisible && !ctx.isLayerVisible('wonders')) return;
  const g = ctx.ctx, camera = ctx.getCamera?.();
  if (!g || !camera || !Number.isFinite(camera.scale) || camera.scale <= 0) return;
  const width = ctx.canvas?.clientWidth ?? innerWidth;
  const height = ctx.canvas?.clientHeight ?? innerHeight;
  const lang = ctx.getLang?.() === 'fr' ? 'fr' : 'en';
  const labels = [];
  g.save();
  g.font = 'bold 11px Georgia, serif';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  for (const item of items(ctx)) {
    if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
    const x = camera.ox + item.x * camera.scale;
    const y = camera.oy + item.y * camera.scale;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < -12 || y < -12 || x > width + 12 || y > height + 12) continue;
    // Original, small diamond marker in screen pixels; position is geographic.
    g.beginPath();
    g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath();
    g.fillStyle = '#f3d283'; g.fill();
    g.strokeStyle = '#4b321c'; g.lineWidth = 1.5; g.stroke();
    hitBoxes.push({item, left: x - 8, right: x + 8, top: y - 8, bottom: y + 8});
    const title = name(item, lang);
    if (!title) continue;
    const box = {left: x + 9, right: x + 17 + g.measureText(title).width, top: y - 9, bottom: y + 9};
    if (box.right > width || labels.some(b => box.left < b.right + 3 && box.right + 3 > b.left && box.top < b.bottom + 2 && box.bottom + 2 > b.top)) continue;
    labels.push(box);
    g.fillStyle = 'rgba(31, 34, 29, .88)';
    g.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
    g.fillStyle = '#fff0c9';
    g.fillText(title, box.left + 4, y);
    hitBoxes.push({item, ...box});
  }
  g.restore();
}

// Coordinates are client pixels, matching the shell's map-click event. The
// layer controller can use this to provide a tooltip without inventing ranks.
export function hitWonder(event) {
  for (let i = hitBoxes.length - 1; i >= 0; i--) {
    const box = hitBoxes[i];
    if (event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom) return box.item;
  }
  return null;
}

export function clearHits() { hitBoxes = []; }
export function wonderName(item, lang) { return name(item, lang === 'fr' ? 'fr' : 'en'); }
