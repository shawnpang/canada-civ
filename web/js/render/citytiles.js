// Decorative city fabric. Buildings are illustrative marks, not counts or
// locations of actual structures. All placement starts from published cells.
import {center} from '../hex.js';
import {drawDistrictPlaques} from './districts.js';

const indexed = new WeakMap();
const list = (payload, key) => Array.isArray(payload) ? payload : (payload?.[key] || []);
const valid = (w, i) => Number.isInteger(i) && i >= 0 && i < w.grid.cols * w.grid.rows && w.owner?.[i] >= 0 && !w.water?.[i];
function hash(value) {
  let h = 2166136261;
  for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function random(seed, n) {
  let h = Math.imul(seed ^ Math.imul(n + 1, 0x9e3779b1), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function hex(g, x, y, r) {
  g.beginPath();
  for (let j = 0; j < 6; j++) {
    const a = (j * 60 - 30) * Math.PI / 180;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (j) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
}
function neighbours(w, i) {
  const row = Math.floor(i / w.grid.cols), col = i % w.grid.cols, s = row & 1;
  return [[row-1,col+s-1],[row-1,col+s],[row,col+1],
    [row+1,col+s],[row+1,col+s-1],[row,col-1]]
    .filter(([r,c]) => r >= 0 && c >= 0 && r < w.grid.rows && c < w.grid.cols)
    .map(([r,c]) => r * w.grid.cols + c);
}
function point(w, i, view) {
  const [x,y] = center(i % w.grid.cols, Math.floor(i / w.grid.cols), w.grid.radius || 25);
  return [view.ox + x * view.scale, view.oy + y * view.scale];
}
function tileIndex(w, cities, towns) {
  const cached = indexed.get(w);
  if (cached && cached.cities === cities && cached.towns === towns) return cached.tiles;
  const tiles = new Map();
  // The land-cover urban flag is an observed classification; it is not a
  // claim that any specific building or settlement sits at the stamp position.
  for (let i = 0; i < w.grid.cols * w.grid.rows; i++) {
    if (valid(w, i) && (w.cover?.[i] === 9 || w.pct?.developed?.[i] >= 30)) {
      tiles.set(i, {seed: hash(`urban:${i}`), large: false});
    }
  }
  for (const city of list(cities, 'cities')) {
    const large = city.metro === true && Number.isFinite(city.population) && city.population >= 500000;
    const cells = [city.cell, ...(Array.isArray(city.footprint) ? city.footprint : [])];
    for (const cell of cells) {
      if (!valid(w, cell)) continue;
      const previous = tiles.get(cell);
      tiles.set(cell, {seed: hash(`city:${city.id}:${cell}`), large: !!(previous && previous.large) || large});
    }
  }
  for (const town of list(towns, 'towns')) {
    if (valid(w, town.cell) && !tiles.has(town.cell)) tiles.set(town.cell, {seed: hash(`town:${town.id}:${town.cell}`), large: false});
  }
  indexed.set(w, {cities, towns, tiles});
  return tiles;
}
function polygon(g, coords, color) {
  g.fillStyle = color; g.beginPath(); g.moveTo(coords[0], coords[1]);
  for (let i = 2; i < coords.length; i += 2) g.lineTo(coords[i], coords[i+1]);
  g.closePath(); g.fill();
}
function house(g, x, y, size, variant) {
  const s = size, wall = ['#dfcfaa','#cbbd9d','#ead9b3','#bbad91'][variant % 4];
  g.fillStyle = 'rgba(31,40,29,.22)'; g.beginPath(); g.ellipse(x+s*.12,y+s*.17,s*.58,s*.19,0,0,Math.PI*2); g.fill();
  polygon(g, [x-s*.43,y-s*.08,x,y-s*.25,x+s*.43,y-s*.08,x+s*.43,y+s*.21,x,y+s*.38,x-s*.43,y+s*.21], wall);
  polygon(g, [x,y-s*.25,x+s*.43,y-s*.08,x+s*.43,y+s*.21,x,y+s*.38], '#a89e88');
  polygon(g, [x-s*.51,y-s*.10,x-s*.13,y-s*.43,x+s*.04,y-s*.49,x+s*.48,y-s*.16,x,y+.02], ['#82564a','#6d5b51','#986a51'][variant % 3]);
  polygon(g, [x-s*.51,y-s*.10,x-s*.13,y-s*.43,x+s*.04,y-s*.49,x,y+.02], 'rgba(245,208,169,.28)');
  g.fillStyle = '#4c6060'; g.fillRect(x-s*.27,y+s*.06,s*.12,s*.11);
  g.fillStyle = '#725d4b'; g.fillRect(x+s*.12,y+s*.12,s*.12,s*.16);
}
function tower(g, x, y, s, variant) {
  const h = s * (1.0 + .25 * variant), width = s * .38;
  g.fillStyle = 'rgba(28,36,31,.22)'; g.beginPath(); g.ellipse(x+s*.1,y+s*.15,s*.44,s*.14,0,0,Math.PI*2); g.fill();
  polygon(g, [x-width,y-h,x+width,y-h-s*.09,x+width,y,x,y+s*.14,x-width,y], '#d4c8ae');
  polygon(g, [x,y-h-s*.04,x+width,y-h-s*.09,x+width,y,x,y+s*.14], '#9babb0');
  polygon(g, [x-width,y-h,x,y-h-s*.15,x+width,y-h-s*.09,x,y-h+.07], '#f0dfbc');
  g.fillStyle = '#5d777c';
  for (let j = 0; j < 3; j++) for (let k = 0; k < 2; k++) g.fillRect(x-width*.72+k*width*.48,y-h*.78+j*h*.24,width*.23,h*.10);
}
function civic(g, x, y, s, kind) {
  if (kind === 0) { // Small chapel-like silhouette.
    house(g, x, y, s, 0);
    g.fillStyle = '#e6d6b7'; g.fillRect(x-s*.13,y-s*.69,s*.24,s*.40);
    polygon(g, [x-s*.19,y-s*.68,x,y-s*.94,x+s*.19,y-s*.68], '#655e58');
  } else { // Water tower, drawn as a decorative local landmark.
    g.strokeStyle = '#827f71'; g.lineWidth = Math.max(.7,s*.08);
    g.beginPath(); g.moveTo(x-s*.22,y+s*.25); g.lineTo(x-s*.12,y-s*.28); g.lineTo(x+s*.12,y-s*.28); g.lineTo(x+s*.22,y+s*.25); g.moveTo(x-s*.16,y+s*.04); g.lineTo(x+s*.16,y+s*.04); g.stroke();
    g.fillStyle = '#d6d7c9'; g.beginPath(); g.ellipse(x,y-s*.34,s*.29,s*.17,0,0,Math.PI*2); g.fill();
    g.fillStyle = '#a1b8b5'; g.fillRect(x-s*.29,y-s*.35,s*.58,s*.16);
    g.fillStyle = '#e4e5d6'; g.beginPath(); g.ellipse(x,y-s*.35,s*.29,s*.10,0,0,Math.PI*2); g.fill();
  }
}
function fabric(g, x, y, r, tile) {
  const seed = tile.seed;
  g.save(); hex(g,x,y,r*.98); g.clip();
  // Transparent edge keeps the observed surrounding cover visible.
  const lawn = g.createRadialGradient(x,y,r*.12,x,y,r*.98);
  lawn.addColorStop(0,'rgba(147,167,104,.74)'); lawn.addColorStop(.66,'rgba(143,162,104,.46)'); lawn.addColorStop(1,'rgba(143,162,104,0)');
  g.fillStyle = lawn; g.fillRect(x-r,y-r,r*2,r*2);
  if (r < 14) {
    for (let j=0;j<11;j++) {
      const px=x+(random(seed,j*3)-.5)*r*1.15, py=y+(random(seed,j*3+1)-.5)*r*1.15;
      g.fillStyle = j%3 ? '#d9c8a0' : '#8e6654';
      g.fillRect(px,py,Math.max(1.4,r*.10),Math.max(1.3,r*.075));
    }
  } else {
    // A few angled lanes and irregular lots give the marks a coherent fabric.
    g.strokeStyle = 'rgba(218,210,178,.54)'; g.lineWidth = Math.max(1,r*.035);
    for (let j=-1;j<=1;j++) { g.beginPath(); g.moveTo(x-r*.65,y+j*r*.28-r*.15); g.lineTo(x+r*.65,y+j*r*.28+r*.15); g.stroke(); }
    const marks=[];
    for(let j=0;j<18;j++) {
      const px=x+(random(seed,j*4)-.5)*r*1.27, py=y+(random(seed,j*4+1)-.5)*r*1.13;
      marks.push({x:px,y:py,size:r*(.13+random(seed,j*4+2)*.07),variant:Math.floor(random(seed,j*4+3)*12)});
    }
    marks.sort((a,b)=>a.y-b.y);
    for(const p of marks) house(g,p.x,p.y,p.size,p.variant);
    if(tile.large) {
      for(let j=0;j<4;j++) tower(g,x+(j-1.5)*r*.16,y+r*.08+(j%2)*r*.06,r*.20,j%3);
    } else if (random(seed,99) > .45) civic(g,x+r*.25,y+r*.1,r*.20,random(seed,100)>.5?1:0);
  }
  g.restore();
}
function footprint(w, city) {
  const cells = Array.isArray(city.footprint) ? city.footprint.filter(i => valid(w,i)) : [];
  if (!cells.length && valid(w,city.cell)) cells.push(city.cell);
  if (cells.length === 1 && valid(w,city.cell)) {
    for (const i of neighbours(w,city.cell)) if (valid(w,i) && (w.cover?.[i] === 9 || w.pct?.developed?.[i] >= 30)) cells.push(i);
  }
  return [...new Set(cells)];
}
function paintHighlight(g,w,view,city,r) {
  g.save();
  for(const i of footprint(w,city)) {
    const [x,y]=point(w,i,view);
    if(x < -r*2 || y < -r*2 || x > view.width+r*2 || y > view.height+r*2) continue;
    hex(g,x,y,r*.96); g.fillStyle='rgba(245,222,133,.28)'; g.fill();
    g.shadowColor='rgba(255,226,128,.65)'; g.shadowBlur=Math.min(12,r*.22);
    g.strokeStyle='rgba(255,229,155,.88)'; g.lineWidth=Math.max(1,Math.min(2.5,r*.035)); g.stroke();
    g.shadowBlur=0;
  }
  g.restore();
}
function plaques(g,w,view,city,payload,lang) {
  const items = payload?.cities?.[String(city.id)]?.districts;
  if (!Array.isArray(items) || !items.length || !valid(w,city.cell)) return;
  // Only positions are schematic: use nearby existing land cells, never infer
  // a district boundary or attach the LQ to a particular neighbourhood.
  const ns=neighbours(w,city.cell).filter(i=>valid(w,i));
  const ordered=[ns[0],ns[Math.floor(ns.length/2)],ns[ns.length-1],...ns].filter((v,i,a)=>v!=null && a.indexOf(v)===i);
  if (!ordered.length) return;
  const [x,y]=point(w,city.cell,view);
  const positions=items.map((_,i)=>{const p=point(w,ordered[i%ordered.length],view); return {x:p[0],y:p[1]};});
  drawDistrictPlaques(g,payload,city.id,{x,y,lang,positions});
}

// view = {width,height,scale,ox,oy}; opts = {cities,towns,selectedCityId,
// districts,showDistricts,lang}. Call after terrain/water and before overlays.
export function paintCityTiles(g, w, view, opts = {}) {
  if (!g || !w?.grid || !view || !Number.isFinite(view.scale) || view.scale <= 0 || !Number.isFinite(view.ox) || !Number.isFinite(view.oy)) return;
  const r=(w.grid.radius || 25)*view.scale;
  const city=list(opts.cities,'cities').find(c=>String(c.id)===String(opts.selectedCityId));
  if (!opts.plaquesOnly && city) paintHighlight(g,w,view,city,r);
  if (!opts.plaquesOnly && r >= 10) {
    for(const [i,tile] of tileIndex(w,opts.cities,opts.towns)) {
      const [x,y]=point(w,i,view);
      if(x < -r*2 || y < -r*2 || x > view.width+r*2 || y > view.height+r*2) continue;
      fabric(g,x,y,r,tile);
    }
  }
  if (city && opts.showDistricts && opts.districts) plaques(g,w,view,city,opts.districts,opts.lang === 'fr' ? 'fr' : 'en');
}
