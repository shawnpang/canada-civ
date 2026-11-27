import {center} from '../hex.js';
import {layoutBanners} from '../ui/banners.js';

// Candidate centres are owned cells, cached because the world is static.
let cachedWorld, anchors = [];
const CELL_OFFSETS = [[0, 0], [0, -.5], [0, .5], [-.5, 0], [.5, 0],
  [-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5], [0, .95], [.85, 0], [-.85, 0]];

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
    const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
    return {province: world.provinces[index], points, meanX, meanY,
      width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys)};
  }).filter(Boolean);
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

function overlapArea(a, b) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

// Break only at existing spaces and hyphens; never remove part of a name.
function lineOptions(text) {
  const parts = text.match(/[^ -]+(?:-| +|$)/g) || [text];
  const line = (start, end) => parts.slice(start, end).join('').trim();
  const options = [[text]];
  for (let i = 1; i < parts.length; i++) {
    options.push([line(0, i), line(i, parts.length)]);
    for (let j = i + 1; j < parts.length; j++) options.push([line(0, i), line(i, j), line(j, parts.length)]);
  }
  return options;
}

// Labels are below banners, but use their current-frame bounds during layout.
export function onRedraw(ctx) {
  const world = ctx.world, g = ctx.ctx, camera = ctx.getCamera?.();
  if (!world || !g || !(camera?.scale > 0)) return;
  if (world !== cachedWorld) { cachedWorld = world; anchors = makeAnchors(world); }
  const lang = ctx.getLang?.() === 'fr' ? 'fr' : 'en';
  const viewportWidth = ctx.canvas?.clientWidth || innerWidth;
  const viewportHeight = ctx.canvas?.clientHeight || innerHeight;
  const fit = Math.min(innerWidth / (world.width + 200), (innerHeight - 95) / (world.height + 200));
  const zoom = camera.scale / fit;
  const selected = new URLSearchParams(location.hash.slice(1)).get('province');
  const ordered = [...anchors].sort((a, b) => {
    const priority = anchor => anchor.province.pruid === selected ? -2 : anchor.province.pruid === '11' ? -1 : anchor.points.length;
    return priority(a) - priority(b);
  });
  const occupied = layoutBanners(ctx).map(box => box.collision);
  g.save();
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  for (const anchor of ordered) {
    const name = anchor.province.name?.[lang] || anchor.province.name?.en;
    if (!name) continue;
    const pei = anchor.province.pruid === '11';
    const text = pei && zoom <= 1.15 ? (lang === 'fr' ? 'Î.-P.-É.' : 'P.E.I.') : name.toLocaleUpperCase(lang === 'fr' ? 'fr-CA' : 'en-CA');
    const areaWidth = Math.max(pei ? 155 : 105, anchor.width * camera.scale * .88);
    const areaHeight = Math.max(15, anchor.height * camera.scale * .4);
    const maxSize = Math.floor(Math.max(12, Math.min(38, 19 + camera.scale * 30, areaHeight)));
    const radius = world.grid.radius || 25;
    const visible = anchor.points.filter(point => {
      const x = camera.ox + point[0] * camera.scale, y = camera.oy + point[1] * camera.scale;
      return x >= -radius * camera.scale && x <= viewportWidth + radius * camera.scale &&
        y >= -radius * camera.scale && y <= viewportHeight + radius * camera.scale;
    });
    if (!visible.length) continue;
    // Limit repeated screen-space trials for large provinces while retaining
    // candidates throughout the visible portion of each province.
    const step = Math.max(1, Math.floor(visible.length / 160));
    const points = visible.filter((_, i) => i % step === 0);
    let chosen = null, fallback = null;
    for (let size = maxSize; size >= 9 && !chosen; size--) {
      g.font = `${size}px Georgia, serif`;
      const spacing = size * .18, outline = Math.max(2.5, size * .15);
      const options = lineOptions(text).map(lines => ({lines, width: Math.max(...lines.map(line => spacedWidth(g, line, spacing)))}));
      options.splice(1, options.length - 1, ...options.slice(1).sort((a, b) => a.lines.length - b.lines.length || a.width - b.width));
      for (const option of options) {
        if (option.width > areaWidth && size > 9) continue;
        const height = size * (1 + (option.lines.length - 1) * 1.1);
        for (const point of points) {
          const px = camera.ox + point[0] * camera.scale, py = camera.oy + point[1] * camera.scale;
          // PEI's two land hexes cannot contain its name. A leader connects a
          // label in the neighbouring water to the centre of the island.
          const offsets = pei ? [[0, -38], [55, -30], [55, 30], [0, 40], [-55, 30], [-55, -30], [90, 0], [-90, 0], [90, -55], [90, 55], [-90, -55], [-90, 55], [0, -75], [0, 75]] :
            CELL_OFFSETS.map(([dx, dy]) => [dx * radius * camera.scale, dy * radius * camera.scale]);
          // Compact coastal provinces can use a little adjacent water when
          // their cities occupy the land at national scale.
          if (anchor.province.pruid === '13') offsets.push([0, -32], [0, 32], [35, -30], [35, 30], [55, 0]);
          for (const [dx, dy] of offsets) {
            const x = px + dx, y = py + dy, padding = outline + 1;
            const box = {left: x - option.width / 2 - padding, right: x + option.width / 2 + padding,
              top: y - height / 2 - padding, bottom: y + height / 2 + padding};
            // A whole name must be on screen, including the upper header area.
            if (box.left < 3 || box.right > viewportWidth - 3 || box.top < 45 || box.bottom > viewportHeight - 28) continue;
            const candidate = {x, y, px, py, size, spacing, outline, lines: option.lines, box, pei};
            const collisions = occupied.filter(other => overlaps(box, other));
            if (!collisions.length) { chosen = candidate; break; }
            // Do not silently omit a visible province if crowded. Retain the
            // least obscured full-name candidate as a last resort.
            if (size === 9) {
              const cost = collisions.reduce((sum, other) => sum + overlapArea(box, other), 0);
              if (!fallback || cost < fallback.cost) fallback = {...candidate, cost};
            }
          }
          if (chosen) break;
        }
        if (chosen) break;
      }
    }
    chosen ||= fallback;
    if (!chosen) continue;
    occupied.push(chosen.box);
    if (chosen.pei) {
      g.beginPath();
      g.moveTo(chosen.px, chosen.py);
      const endX = Math.max(chosen.box.left, Math.min(chosen.px, chosen.box.right));
      const endY = Math.max(chosen.box.top, Math.min(chosen.py, chosen.box.bottom));
      g.lineTo(endX, endY);
      g.strokeStyle = 'rgba(41, 38, 27, .8)'; g.lineWidth = 3; g.stroke();
      g.strokeStyle = 'rgba(244, 232, 186, .9)'; g.lineWidth = 1; g.stroke();
    }
    g.font = `${chosen.size}px Georgia, serif`;
    g.lineWidth = chosen.outline;
    g.strokeStyle = 'rgba(42, 39, 27, .88)';
    g.fillStyle = 'rgba(249, 235, 192, .96)';
    const lineHeight = chosen.size * 1.1;
    chosen.lines.forEach((line, i) => spacedText(g, line, chosen.x,
      chosen.y + (i - (chosen.lines.length - 1) / 2) * lineHeight, chosen.spacing));
  }
  g.restore();
}
