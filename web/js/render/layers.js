// Optional layers use the payload's projected kilometre coordinates directly.
// The renderer never infers missing positions or synthesizes network links.
const lineBounds = new WeakMap();
let visiblePoints = [];
let visibleLines = [];

const styles = {
  resources: {fill: '#dfb85e', edge: '#392b1c'},
  airports: {fill: '#c7dce2', edge: '#304958'},
  ports: {fill: '#91c2d0', edge: '#294653'},
  military: {fill: '#d9a894', edge: '#593c37'}
};

function bounds(line) {
  if (lineBounds.has(line)) return lineBounds.get(line);
  const points = Array.isArray(line.points) ? line.points.filter(p =>
    Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) : [];
  if (points.length < 2) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const result = {points, minX, minY, maxX, maxY};
  lineBounds.set(line, result);
  return result;
}

function drawNetwork(g, features, group, camera, viewport) {
  const {scale, ox, oy} = camera;
  const list = [];
  for (const item of Array.isArray(features) ? features : []) {
    const box = bounds(item);
    if (!box || ox + box.maxX * scale < -10 || oy + box.maxY * scale < -10 ||
        ox + box.minX * scale > viewport.width + 10 || oy + box.minY * scale > viewport.height + 10) continue;
    list.push({group, item, points: box.points});
  }
  if (!list.length) return;
  visibleLines.push(...list);
  // A contrasting casing keeps both networks legible over land and lenses.
  for (const casing of [true, false]) {
    g.beginPath();
    for (const {points} of list) {
      g.moveTo(ox + points[0][0] * scale, oy + points[0][1] * scale);
      for (let i = 1; i < points.length; i++) g.lineTo(ox + points[i][0] * scale, oy + points[i][1] * scale);
    }
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.lineWidth = casing ? 3 : 1.35;
    g.strokeStyle = casing ? 'rgba(37, 33, 27, .8)' : (group === 'roads' ? '#d9bf82' : '#d8d4c5');
    g.setLineDash(!casing && group === 'rail' ? [5, 3] : []);
    g.stroke();
  }
  g.setLineDash([]);
}

function markerPath(g, group, category, x, y, r) {
  g.beginPath();
  if (group === 'resources' && category !== 'energy') {
    g.rect(x - r * .75, y - r * .75, r * 1.5, r * 1.5);
  } else if (group === 'resources') {
    g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath();
  } else if (group === 'airports') {
    g.moveTo(x, y - r); g.lineTo(x + r, y + r * .8); g.lineTo(x - r, y + r * .8); g.closePath();
  } else if (group === 'military') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * .5 : r;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      if (!i) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
  } else {
    g.arc(x, y, r * .8, 0, Math.PI * 2);
  }
}

function drawPoints(g, items, group, camera, viewport, types) {
  const {scale, ox, oy} = camera;
  // Symbols stay readable while their anchors remain the actual site locations.
  const radius = Math.max(3, Math.min(6, 3 + scale * 3));
  for (const item of Array.isArray(items) ? items : []) {
    if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
    const x = ox + item.x * scale, y = oy + item.y * scale;
    if (x < -radius || y < -radius || x > viewport.width + radius || y > viewport.height + radius) continue;
    const type = group === 'resources' ? types.get(item.type) : null;
    markerPath(g, group, type?.category, x, y, radius);
    g.fillStyle = styles[group].fill; g.fill();
    g.strokeStyle = styles[group].edge; g.lineWidth = 1.2; g.stroke();
    visiblePoints.push({group, item, type, x, y, radius});
  }
}

// `enabled` is a Set of resources, roads, rail, airports, ports and military.
// Call after terrain/lenses and before city banners.
export function drawLayers(app, payloads, enabled) {
  visiblePoints = []; visibleLines = [];
  const g = app.ctx, camera = app.getCamera();
  if (!g || !camera || !(camera.scale > 0)) return;
  const viewport = {width: app.canvas.clientWidth, height: app.canvas.clientHeight};
  const infrastructure = payloads?.infrastructure || {};
  const resources = payloads?.resources || {};
  const types = new Map((Array.isArray(resources.types) ? resources.types : []).map(type => [type.id, type]));
  g.save();
  if (enabled.has('roads')) drawNetwork(g, infrastructure.roads, 'roads', camera, viewport);
  if (enabled.has('rail')) drawNetwork(g, infrastructure.rail, 'rail', camera, viewport);
  if (enabled.has('resources')) drawPoints(g, resources.items, 'resources', camera, viewport, types);
  for (const group of ['ports', 'airports', 'military']) {
    if (enabled.has(group)) drawPoints(g, infrastructure[group], group, camera, viewport, types);
  }
  g.restore();
}

function segmentDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

// Returns the nearest visible feature, or null. Point markers take precedence.
// The returned item and resource type are unmodified payload records.
export function hitLayer(app, payloads, enabled, clientX, clientY) {
  let best = null, distance = Infinity;
  for (const point of visiblePoints) {
    if (!enabled.has(point.group)) continue;
    const d = Math.hypot(clientX - point.x, clientY - point.y);
    if (d <= Math.max(7, point.radius + 2) && d < distance) { best = point; distance = d; }
  }
  if (best) return best;
  const {scale, ox, oy} = app.getCamera();
  for (const line of visibleLines) {
    if (!enabled.has(line.group)) continue;
    for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1], b = line.points[i];
      const d = segmentDistance(clientX, clientY, ox + a[0] * scale, oy + a[1] * scale, ox + b[0] * scale, oy + b[1] * scale);
      if (d <= 5 && d < distance) { best = line; distance = d; }
    }
  }
  return best;
}
