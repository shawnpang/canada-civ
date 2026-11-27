import {center} from '../hex.js';

// Label anchors are derived from owned cells, not inferred administrative
// boundaries. Cache the geometry because the world does not change on pan.
let cachedWorld, anchors = [];

function makeAnchors(world, cities) {
  const grid = world?.grid;
  if (!grid || !Array.isArray(world.owner) || !Array.isArray(world.provinces)) return [];
  const groups = world.provinces.map(() => []);
  for (let i = 0; i < world.owner.length; i++) {
    const owner = world.owner[i];
    if (groups[owner]) groups[owner].push(center(i % grid.cols, Math.floor(i / grid.cols), grid.radius || 25));
  }
  const cityPoints = (Array.isArray(cities) ? cities : cities?.cities || [])
    .filter(city => Number.isFinite(city.x) && Number.isFinite(city.y));
  return groups.map((points, index) => {
    if (!points.length) return null;
    const meanX = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    // Prefer a real owned cell near the centroid and away from city anchors.
    let best = points[0], score = Infinity;
    for (const point of points) {
      const distance = Math.hypot(point[0] - meanX, point[1] - meanY);
      const nearestCity = cityPoints.reduce((min, city) => Math.min(min, Math.hypot(point[0] - city.x, point[1] - city.y)), Infinity);
      const candidate = distance + Math.max(0, 220 - nearestCity) * 2;
      if (candidate < score) { score = candidate; best = point; }
    }
    const xs = points.map(point => point[0]);
    const ys = points.map(point => point[1]);
    return {province: world.provinces[index], x: best[0], y: best[1], width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys)};
  }).filter(Boolean);
}

function spacedText(g, text, x, y, spacing) {
  const letters = [...text];
  const widths = letters.map(letter => g.measureText(letter).width);
  const total = widths.reduce((a, b) => a + b, 0) + Math.max(0, letters.length - 1) * spacing;
  let cursor = x - total / 2;
  for (let i = 0; i < letters.length; i++) {
    g.strokeText(letters[i], cursor, y);
    g.fillText(letters[i], cursor, y);
    cursor += widths[i] + spacing;
  }
}

// Painted below the foreground map symbols and city banners.
export function onRedraw(ctx) {
  const world = ctx.world, g = ctx.ctx, camera = ctx.getCamera?.();
  if (!world || !g || !(camera?.scale > 0)) return;
  if (world !== cachedWorld) { cachedWorld = world; anchors = makeAnchors(world, ctx.cities); }
  const lang = ctx.getLang?.() === 'fr' ? 'fr' : 'en';
  const viewportWidth = ctx.canvas?.clientWidth || innerWidth;
  const viewportHeight = ctx.canvas?.clientHeight || innerHeight;
  g.save();
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  for (const anchor of anchors) {
    const name = anchor.province.name?.[lang] || anchor.province.name?.en;
    if (!name) continue;
    const text = name.toLocaleUpperCase(lang === 'fr' ? 'fr-CA' : 'en-CA');
    const x = camera.ox + anchor.x * camera.scale, y = camera.oy + anchor.y * camera.scale;
    if (x < -200 || y < -50 || x > viewportWidth + 200 || y > viewportHeight + 50) continue;
    // Keep labels restrained for small provinces, and scale them gradually as
    // the map is enlarged. Long bilingual names shrink to the area available.
    const areaWidth = Math.max(45, anchor.width * camera.scale * .8);
    const areaHeight = Math.max(10, anchor.height * camera.scale * .32);
    let size = Math.max(10, Math.min(32, 17 + camera.scale * 24, areaHeight));
    g.font = `${size}px Georgia, serif`;
    const nominalWidth = g.measureText(text).width + Math.max(0, text.length - 1) * size * .15;
    if (nominalWidth > areaWidth) size = Math.max(8, size * areaWidth / nominalWidth);
    g.font = `${size}px Georgia, serif`;
    g.lineWidth = Math.max(2, size * .13);
    g.strokeStyle = 'rgba(45, 42, 28, .72)';
    g.fillStyle = 'rgba(244, 232, 186, .85)';
    spacedText(g, text, x, y, size * .15);
  }
  g.restore();
}
