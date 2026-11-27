// Cartographic water treatment derived only from the world grid's water flags.
// The paths are cached in map kilometres so they stay anchored while panning.
import {lodFor, FAR, MID, NEAR} from './art/lod.js';
import {landFill} from './art/palette.js';
const R = 25, DX = Math.sqrt(3) * R;
// Keep terrain's canvas background and the grid-edge fade in sync.
const DEEP_OCEAN = '#1b4967';
const geometry = new WeakMap();
function kind(w, i) { return w.water[i] === 3 ? 1 : w.water[i] ? 0 : -1; }
function neighbours(row, col) {
  const s = row & 1;
  return [[row,col+1],[row+1,col+s],[row+1,col+s-1],
    [row,col-1],[row-1,col+s-1],[row-1,col+s]];
}
function index(row, col, rows, cols) {
  return row < 0 || col < 0 || row >= rows || col >= cols ? -1 : row * cols + col;
}
function centre(row, col) { return [(col + .5 * (row & 1)) * DX, row * 1.5 * R]; }
function midpoint(a, b) { return [(a[0]+b[0])/2, (a[1]+b[1])/2]; }
function triangle(path, a, b, c) {
  // Match the winding of the hexes so overlapping extensions never cancel.
  if ((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]) < 0) [b,c]=[c,b];
  path.moveTo(a[0],a[1]); path.lineTo(b[0],b[1]); path.lineTo(c[0],c[1]); path.closePath();
}
function landColor(w, i) {
  return w.owner[i] === -2 ? '#89847c' : landFill(w.cover[i], FAR);
}

function makeGeometry(w) {
  const {rows, cols} = w.grid;
  const water = [new Path2D(), new Path2D()];
  const shelf = new Path2D();
  const shores = [new Path2D(), new Path2D()];
  const cutouts = [new Path2D(), new Path2D()];
  const crossings = new Map();
  const land = new Map();
  const landPath = i => {
    const color = landColor(w,i);
    if (!land.has(color)) land.set(color,new Path2D());
    return land.get(color);
  };
  for (let row=0; row<rows; row++) for (let col=0; col<cols; col++) {
    const i=row*cols+col, type=kind(w,i);
    if (type<0) continue;
    const p=centre(row,col), ns=neighbours(row,col);
    const ni=ns.map(([r,c])=>index(r,c,rows,cols));
    const nc=ns.map(([r,c])=>centre(r,c));
    const isShelf=w.water[i]===2;
    const path=isShelf ? new Path2D() : water[type], extensions=[];
    // A water hex loses the corner between two land neighbours. At the
    // opposite configuration, a triangle extends water into the land hex.
    for(let k=0;k<6;k++) {
      const angle=(k*60-30)*Math.PI/180;
      const v=[p[0]+R*Math.cos(angle),p[1]+R*Math.sin(angle)];
      const a=(k+5)%6,b=k;
      const la=ni[a]>=0 && kind(w,ni[a])<0;
      const lb=ni[b]>=0 && kind(w,ni[b])<0;
      const pa=midpoint(p,nc[a]),pb=midpoint(p,nc[b]);
      if(k===0) path.moveTo(...(la&&lb ? pa : v));
      else path.lineTo(...(la&&lb ? pa : v));
      if(la&&lb) {
        path.lineTo(...pb);
        // Restore the small land wedge previously occupied by a water hex.
        // Split it between the adjacent land fills; no land texture is made up.
        const m=midpoint(pa,pb);
        triangle(landPath(ni[a]),v,pa,m);
        triangle(landPath(ni[b]),v,m,pb);
      }
      if(la!==lb && ni[a]>=0 && ni[b]>=0) {
        const landSide=la?a:b, waterSide=la?b:a;
        const end=midpoint(nc[landSide],nc[waterSide]);
        extensions.push([v,landSide===a?pa:pb,end]);
      }
    }
    path.closePath();
    for(const points of extensions) triangle(path,...points);
    if(isShelf) { water[type].addPath(path); shelf.addPath(path); }
  }
  // Connect crossings by the pair of cells they lie between. Every complete
  // crossing has one incoming and one outgoing segment, with water on the
  // right. Keeping that orientation also tells us which corners to trim.
  function shoreTriangle(ids, points) {
    if(ids.some(i=>i<0)) return;
    const wet=ids.map(i=>kind(w,i)>=0);
    if(wet.every(Boolean)||wet.every(v=>!v)) return;
    const ends=[];
    for(let k=0;k<3;k++) if(wet[k]!==wet[(k+1)%3]) {
      const j=(k+1)%3, key=[ids[k],ids[j]].sort((a,b)=>a-b).join(':');
      if(!crossings.has(key)) crossings.set(key,{point:midpoint(points[k],points[j])});
      ends.push(crossings.get(key));
    }
    const wetTypes=ids.filter((_,k)=>wet[k]).map(i=>kind(w,i));
    const type=wetTypes.every(v=>v===1)?1:0;
    const wetPoint=points[wet.indexOf(true)], [a,b]=ends;
    const cross=(b.point[0]-a.point[0])*(wetPoint[1]-a.point[1])-(b.point[1]-a.point[1])*(wetPoint[0]-a.point[0]);
    const from=cross>0?a:b, to=cross>0?b:a;
    from.next=to; to.prev=from; from.type=type;
    // For a smoothed marine shore, extend the shelf only when a contributing
    // water cell is actually classified as shelf.
    from.shelf=type===0 && ids.some((i,k)=>wet[k] && w.water[i]===2);
    from.land=ids[wet.indexOf(false)];
  }
  for(let row=0;row<rows-1;row++) for(let col=0;col<cols;col++) {
    const s=row&1;
    for(const cells of [ [[row,col],[row,col+1],[row+1,col+s]],
      [[row,col],[row+1,col+s-1],[row+1,col+s]] ]) {
      shoreTriangle(cells.map(([r,c])=>index(r,c,rows,cols)),cells.map(([r,c])=>centre(r,c)));
    }
  }
  for(const node of crossings.values()) {
    if(!node.prev || !node.next) continue;
    const p=node.point, a=midpoint(node.prev.point,p), b=midpoint(p,node.next.point);
    const type=node.type, shore=shores[type];
    shore.moveTo(...a); shore.quadraticCurveTo(...p,...b);
    const turn=(p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]);
    if(Math.abs(turn)<.001) continue;
    // Replace just the small wedge between the straight and curved coast.
    // Clockwise bends cut water; counterclockwise bends add it. The same
    // curve is used for the fill, shallows, and waterline.
    const path=turn>0?cutouts[type]:water[type];
    if(turn>0) {
      path.moveTo(...a); path.lineTo(...p); path.lineTo(...b); path.quadraticCurveTo(...p,...a); path.closePath();
      const ground=landPath(node.land);
      ground.moveTo(...a); ground.lineTo(...p); ground.lineTo(...b); ground.quadraticCurveTo(...p,...a); ground.closePath();
    } else {
      path.moveTo(...b); path.lineTo(...p); path.lineTo(...a); path.quadraticCurveTo(...p,...b); path.closePath();
      if(node.shelf) {
        shelf.moveTo(...b); shelf.lineTo(...p); shelf.lineTo(...a); shelf.quadraticCurveTo(...p,...b); shelf.closePath();
      }
    }
  }
  return {water, shelf, shores, land, cutouts};
}

export function paintWater(ctx, w, {width,height,scale,ox,oy}) {
  if (!(scale>0) || !w?.grid || !w.water) return;
  let paths=geometry.get(w);
  if(!paths) { paths=makeGeometry(w); geometry.set(w,paths); }
  const lod=lodFor(R*scale);
  ctx.save();
  ctx.translate(ox,oy); ctx.scale(scale,scale);
  // Only these tiny wedges are land-coloured: they replace the old water
  // protrusions when a midpoint shore straightens a concave coast.
  for(const [color,path] of paths.land) { ctx.fillStyle=color; ctx.fill(path); }
  for(let type=0;type<2;type++) {
    ctx.save();
    // Subtract rounded convex corners without changing the winding of the
    // many overlapping cell polygons in the water mask.
    const outside=new Path2D();
    outside.rect(-DX*2,-R*2,(w.grid.cols+4)*DX,(w.grid.rows+4)*R*1.5);
    outside.addPath(paths.cutouts[type]);
    ctx.clip(outside,'evenodd'); ctx.clip(paths.water[type]);
    const gradient=ctx.createLinearGradient(0,0,DX*110,R*120);
    if(type===0) {
      gradient.addColorStop(0,'#204e70'); gradient.addColorStop(.48,'#285d7d'); gradient.addColorStop(1,DEEP_OCEAN);
    } else {
      gradient.addColorStop(0,'#245d83'); gradient.addColorStop(.55,'#30779b'); gradient.addColorStop(1,'#245f86');
    }
    ctx.fillStyle=gradient;
    ctx.fillRect(-ox/scale,-oy/scale,width/scale,height/scale);
    if(type===0) {
      // Shelf is only the subset of the marine mask marked coast by the data;
      // the shared marine clip retains the same smoothed coastline.
      ctx.save(); ctx.clip(paths.shelf);
      const shelfGradient=ctx.createLinearGradient(0,0,DX*110,R*120);
      shelfGradient.addColorStop(0,'#347b91'); shelfGradient.addColorStop(.48,'#408ca0'); shelfGradient.addColorStop(1,'#33788f');
      ctx.fillStyle=shelfGradient;
      ctx.fillRect(-ox/scale,-oy/scale,width/scale,height/scale);
      ctx.restore();
    }
    ctx.lineJoin='round'; ctx.lineCap='round';
    // Clip to water so the strokes form bands on the water side only.
    if(lod>=MID) {
      ctx.strokeStyle=type===1?'rgba(126,202,199,.62)':'rgba(112,207,194,.62)';
      ctx.lineWidth=Math.max(3/scale,R*.40)*2;
      ctx.stroke(paths.shores[type]);
      ctx.strokeStyle=type===1?'rgba(174,222,210,.34)':'rgba(170,232,209,.37)';
      ctx.lineWidth=Math.max(1.8/scale,R*.18)*2;
      ctx.stroke(paths.shores[type]);
    }
    if(lod>=NEAR) {
      ctx.strokeStyle='rgba(235,247,224,.90)';
      ctx.lineWidth=Math.max(1.4/scale,R*.075)*2;
      ctx.stroke(paths.shores[type]);
    }
    ctx.strokeStyle=type===1?'rgba(32,79,83,.78)':'rgba(36,91,86,.82)';
    ctx.lineWidth=Math.max(.7/scale,R*.018)*2;
    ctx.stroke(paths.shores[type]);
    if(type===0) {
      // Fade both the fill and coastal bands into terrain's ocean background
      // at the grid edge; this is not another coastline.
      const right=(w.grid.cols-.5)*DX, bottom=(w.grid.rows-1)*1.5*R;
      for(const [x0,y0,x1,y1] of [[0,0,DX*2.5,0],[right,0,right-DX*2.5,0],
        [0,0,0,R*3.75],[0,bottom,0,bottom-R*3.75]]) {
        const fade=ctx.createLinearGradient(x0,y0,x1,y1);
        fade.addColorStop(0,DEEP_OCEAN); fade.addColorStop(1,'rgba(27,73,103,0)');
        ctx.fillStyle=fade; ctx.fillRect(-ox/scale,-oy/scale,width/scale,height/scale);
      }
    }
    ctx.restore();
  }
  ctx.restore();
}
