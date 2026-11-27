import {center} from '../hex.js';
import {layoutBanners} from '../ui/banners.js';

// Candidate centres are actual owned cells. Cache them because the world does
// not change on pan; screen-space collision checks are repeated on redraw.
let cachedWorld, anchors = [];
// These offsets stay inside a pointy-top hex, in units of its radius.
const CELL_OFFSETS = [[0, 0], [0, -.5], [0, .5], [-.5, 0], [.5, 0],
  [-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5], [.3, .8], [-.3, .8],
  [0, .95], [.85, 0], [-.85, 0]];

function makeAnchors(world) {
  const grid = world?.grid;
  if (!grid || !Array.isArray(world.owner) || !Array.isArray(world.provinces)) return [];
  const groups = world.provinces.map(() => []);
  for (let i = 0; i < world.owner.length; i++) {
    const owner = world.owner[i];
    if (groups[owner]) groups[owner].push(center(i % grid.cols, Math.floor(i / grid.cols), grid.radius || 25));
  }
  return groups.map((points, index) => {
    if (!points.length) return null;
    const meanX = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    points.sort((a, b) => Math.hypot(a[0] - meanX, a[1] - meanY) - Math.hypot(b[0] - meanX, b[1] - meanY));
    if (points.length <= 2) points.sort((a, b) => a[0] - b[0]);
    const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
    return {province: world.provinces[index], points, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys)};
  // Place the smallest province first, then the other compact provinces before
  // larger ones. Within the compact group, larger ones get first choice.
  }).filter(Boolean).sort((a, b) => {
    const rank = anchor => anchor.points.length <= 2 ? 0 : anchor.points.length <= 100 ? 1 : 2;
    const ar = rank(a), br = rank(b);
    return ar - br || (ar === 1 ? b.points.length - a.points.length : a.points.length - b.points.length);
  });
}

function spacedWidth(g, text, spacing) {
  const letters = [...text];
  return letters.reduce((sum, letter) => sum + g.measureText(letter).width, 0) + Math.max(0, letters.length - 1) * spacing;
}

function spacedText(g, text, x, y, spacing) {
  let cursor = x - spacedWidth(g, text, spacing) / 2;
  for (const letter of text) {
    g.strokeText(letter, cursor, y);
    g.fillText(letter, cursor, y);
    cursor += g.measureText(letter).width + spacing;
  }
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// Preserve the official spelling: a line may end at an existing space or
// hyphen, and a hyphen stays visible at the end of its line.
function lineOptions(text) {
  const parts = text.match(/[^ -]+(?:-| +|$)/g) || [text];
  const line = (start, end) => parts.slice(start, end).join('').trim();
  const options = [[text]];
  for (let i = 1; i < parts.length; i++) {
    options.push([line(0, i), line(i, parts.length)]);
    for (let j = i + 1; j < parts.length; j++) {
      options.push([line(0, i), line(i, j), line(j, parts.length)]);
    }
  }
  return options;
}

// Painted below foreground symbols and banners, but laid out against the same
// current-frame banner and district-plaque rectangles used to draw them.
export function onRedraw(ctx) {
  const world = ctx.world, g = ctx.ctx, camera = ctx.getCamera?.();
  if (!world || !g || !(camera?.scale > 0)) return;
  if (world !== cachedWorld) { cachedWorld = world; anchors = makeAnchors(world); }
  const lang = ctx.getLang?.() === 'fr' ? 'fr' : 'en';
  const viewportWidth = ctx.canvas?.clientWidth || innerWidth;
  const viewportHeight = ctx.canvas?.clientHeight || innerHeight;
  const fit = Math.min(innerWidth / (world.width + 200), (innerHeight - 95) / (world.height + 200));
  const zoom = camera.scale / fit;
  // At close zoom, banners and district plaques become the primary labels.
  const alpha = Math.max(0, Math.min(1, (3.6 - zoom) / 1.6));
  if (!alpha) return;
  const occupied = layoutBanners(ctx).map(box => box.collision);
  g.save();
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.globalAlpha *= alpha;
  for (const anchor of anchors) {
    const name = anchor.province.name?.[lang] || anchor.province.name?.en;
    if (!name) continue;
    const text = name.toLocaleUpperCase(lang === 'fr' ? 'fr-CA' : 'en-CA');
    const areaWidth = Math.max(70, anchor.width * camera.scale * .8);
    const areaHeight = Math.max(10, anchor.height * camera.scale * .32);
    const initialSize = Math.max(10, Math.min(32, 17 + camera.scale * 24, areaHeight));
    let chosen = null;
    // Prefer a readable size before shrinking. Within each size, try the
    // unwrapped name first and then balanced two-line alternatives.
    const tinyAtNationalZoom = anchor.points.length <= 2 && zoom <= 1.15;
    const maxSize = tinyAtNationalZoom ? Math.min(initialSize, 9) : initialSize;
    const offsets = tinyAtNationalZoom ? [[0, .95], ...CELL_OFFSETS] : CELL_OFFSETS;
    for (let size = Math.floor(maxSize); size >= 8 && !chosen; size -= 1) {
      g.font = `${size}px Georgia, serif`;
      const spacing = size * (size <= 10 ? .06 : .15), outline = Math.max(2, size * .13);
      const options = lineOptions(text).map(lines => ({lines, width: Math.max(...lines.map(line => spacedWidth(g, line, spacing)))}));
      options.splice(1, options.length - 1, ...options.slice(1).sort((a, b) => a.lines.length - b.lines.length || a.width - b.width));
      for (const option of options) {
        if (option.width > areaWidth) continue;
        const height = size * (1 + (option.lines.length - 1) * 1.1);
        candidates: for (const point of anchor.points) for (const [dx, dy] of offsets) {
          const radius = world.grid.radius || 25;
          const x = camera.ox + (point[0] + dx * radius) * camera.scale, y = camera.oy + (point[1] + dy * radius) * camera.scale;
          if (x < -option.width || y < -height || x > viewportWidth + option.width || y > viewportHeight + height) continue;
          const padding = outline + 1;
          const box = {left: x - option.width / 2 - padding, right: x + option.width / 2 + padding,
            top: y - height / 2 - padding, bottom: y + height / 2 + padding};
          if (occupied.some(other => overlaps(box, other))) continue;
          chosen = {x, y, size, spacing, outline, lines: option.lines, box};
          break candidates;
        }
        if (chosen) break;
      }
    }
    if (!chosen) continue;
    occupied.push(chosen.box);
    g.font = `${chosen.size}px Georgia, serif`;
    g.lineWidth = chosen.outline;
    g.strokeStyle = 'rgba(45, 42, 28, .72)';
    g.fillStyle = 'rgba(244, 232, 186, .85)';
    const lineHeight = chosen.size * 1.1;
    chosen.lines.forEach((line, i) => spacedText(g, line, chosen.x,
      chosen.y + (i - (chosen.lines.length - 1) / 2) * lineHeight, chosen.spacing));
  }
  g.restore();
}
