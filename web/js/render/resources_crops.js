import {center} from '../hex.js';

// These symbols are schematic: the census reports crop area for a whole
// division, not the location or area of a field in any particular hex.
function stem(g, x, y, top, color) {
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x - 1, (y + top) / 2, x, top);
  g.strokeStyle = color;
  g.lineWidth = 1.2;
  g.stroke();
}

function grain(g, x, y, size, color) {
  stem(g, x, y + size * .42, y - size * .42, '#625c33');
  g.fillStyle = color;
  for (let i = 0; i < 4; i++) {
    const yy = y - size * .35 + i * size * .15;
    g.beginPath(); g.ellipse(x - size * .09, yy, size * .085, size * .12, -.55, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(x + size * .09, yy - size * .035, size * .085, size * .12, .55, 0, Math.PI * 2); g.fill();
  }
}

function flower(g, x, y, size) {
  stem(g, x, y + size * .43, y - size * .22, '#52673a');
  g.strokeStyle = '#52673a'; g.lineWidth = 1;
  for (const [dx, dy] of [[-.25, -.22], [.23, -.32], [0, -.4]]) {
    g.beginPath(); g.moveTo(x, y + size * .08); g.lineTo(x + size * dx, y + size * dy); g.stroke();
    g.fillStyle = '#ecd15a';
    g.beginPath(); g.arc(x + size * dx, y + size * dy, size * .13, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f8e68b';
    g.beginPath(); g.arc(x + size * dx - size * .025, y + size * dy - size * .025, size * .045, 0, Math.PI * 2); g.fill();
  }
}

function corn(g, x, y, size) {
  stem(g, x, y + size * .43, y - size * .4, '#536837');
  g.fillStyle = '#708444';
  g.beginPath(); g.moveTo(x, y + size * .3); g.quadraticCurveTo(x - size * .43, y + size * .08, x - size * .35, y - size * .13); g.quadraticCurveTo(x - size * .13, y, x, y + size * .3); g.fill();
  g.beginPath(); g.moveTo(x, y + size * .27); g.quadraticCurveTo(x + size * .4, y + size * .03, x + size * .32, y - size * .18); g.quadraticCurveTo(x + size * .12, y, x, y + size * .27); g.fill();
  g.fillStyle = '#e8c65a'; g.beginPath(); g.ellipse(x, y - size * .2, size * .13, size * .25, 0, 0, Math.PI * 2); g.fill();
}

function leaves(g, x, y, size) {
  stem(g, x, y + size * .43, y - size * .32, '#53663a');
  g.fillStyle = '#7e9650';
  for (const [dx, dy, angle] of [[-.2, -.05, -.8], [.2, -.16, .8], [0, -.34, 0]]) {
    g.beginPath(); g.ellipse(x + size * dx, y + size * dy, size * .13, size * .22, angle, 0, Math.PI * 2); g.fill();
  }
}

// Crop kinds without a dedicated drawing still get a generic plant, never a
// different named crop. Type IDs are checked against the published catalogue.
function paintCrop(g, crop, x, y, size) {
  if (crop === 'canola') flower(g, x, y, size);
  else if (crop === 'corn' || crop === 'maize') corn(g, x, y, size);
  else if (['wheat', 'barley', 'oats', 'rye'].includes(crop)) grain(g, x, y, size, crop === 'wheat' ? '#e5c778' : '#d3bd7b');
  else leaves(g, x, y, size);
}

// Call within drawLayers while the Resources toggle is enabled. Coordinates
// are in CSS pixels, like the rest of the layer renderer. No hit target is
// registered because these are illustrations, not mapped sites.
export function drawCropResources(app, resources, world) {
  const crops = resources?.crops, grid = world?.grid, camera = app?.getCamera?.();
  if (!Array.isArray(crops?.cells) || !crops.types || !grid || !camera || !app.ctx || !app.canvas) return;
  const {cols, rows, radius} = grid, {scale, ox, oy} = camera;
  if (!(cols > 0 && rows > 0 && radius > 0 && scale > 0)) return;
  const r = radius * scale;
  if (r < 12) return;
  const size = Math.min(24, r * .65), width = app.canvas.clientWidth, height = app.canvas.clientHeight;
  const types = Array.isArray(crops.types) ? new Set(crops.types.map(type => type.id)) : new Set(Object.keys(crops.types));
  const g = app.ctx;
  g.save();
  g.globalAlpha *= Math.min(1, (r - 12) / 6);
  for (const item of crops.cells) {
    const cell = item?.cell, crop = item?.crop;
    if (!Number.isInteger(cell) || cell < 0 || cell >= cols * rows || !types.has(crop)) continue;
    const [mx, my] = center(cell % cols, Math.floor(cell / cols), radius);
    const x = ox + mx * scale, y = oy + my * scale;
    if (x < -size || y < -size || x > width + size || y > height + size) continue;
    paintCrop(g, crop, x, y, size);
  }
  g.restore();
}
