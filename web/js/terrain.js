// Original procedural map painting. Marks suggest terrain within each sampled
// cell; they are not mapped trees, field boundaries, or mountain summits.
import {FAR, MID, NEAR, CLOSE, lodFor, hexPath} from './render/art/lod.js';
import {getSprite, drawSprite, seedRand} from './render/art/sprites.js';
import {paintWater} from './render/water.js';
import {paintNeighbours} from './render/neighbours.js';
import {arcticFarColor} from './render/art/arctic.js';
import {landFill, SHADE_TINTS, FAR_MOUNTAIN, LAND_FILLS} from './render/art/palette.js';

const LAND_FAR = LAND_FILLS[FAR];
const SQRT3 = Math.sqrt(3);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
function rand(i,n) {
  let x = Math.imul(i + 1, 0x45d9f3b) ^ Math.imul(n + 19, 0x27d4eb2d);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
function polygon(ctx,points,fill) {
  ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(points[0],points[1]);
  for(let n=2;n<points.length;n+=2)ctx.lineTo(points[n],points[n+1]);
  ctx.closePath();ctx.fill();
}
// The six centres surrounding an odd-r cell, in clockwise order from east.
function neighbours(row,col) {
  const shift=row&1;
  return [[row,col+1],[row+1,col+shift],[row+1,col+shift-1],
    [row,col-1],[row-1,col+shift-1],[row-1,col+shift]];
}
function indexAt(row,col,rows,cols) {
  return row<0||col<0||row>=rows||col>=cols ? -1 : row*cols+col;
}
// Round only exposed corners. Shared edges and the classifications stay put;
// this is a small cartographic treatment, not a reconstructed shoreline.
function boundaryHex(ctx,x,y,r,round) {
  const points=[];
  for(let k=0;k<6;k++){
    const a=(k*60-30)*Math.PI/180;
    points.push([x+r*Math.cos(a),y+r*Math.sin(a)]);
  }
  ctx.beginPath();
  for(let k=0;k<6;k++){
    const p=points[k],prev=points[(k+5)%6],next=points[(k+1)%6];
    const t=round[k] ? .32 : 0;
    const ax=p[0]+(prev[0]-p[0])*t,ay=p[1]+(prev[1]-p[1])*t;
    const bx=p[0]+(next[0]-p[0])*t,by=p[1]+(next[1]-p[1])*t;
    if(k===0)ctx.moveTo(ax,ay);else ctx.lineTo(ax,ay);
    if(t)ctx.quadraticCurveTo(p[0],p[1],bx,by);
  }
  ctx.closePath();
}
function exposedCorners(w,row,col,rows,cols,isSame) {
  const ns=neighbours(row,col).map(([r,c])=>indexAt(r,c,rows,cols));
  // Vertex k is between the neighbour directions k-1 and k.
  return ns.map((_,k)=>ns[(k+5)%6]>=0&&ns[k]>=0&&!isSame(ns[(k+5)%6])&&!isSame(ns[k]));
}
// A directional gradient from available neighbouring land means. No missing
// elevations or water cells are substituted for measured land heights.
function shade(w,i,row,col,rows,cols) {
  const elevation=w.elev[i];
  if(elevation==null)return 0;
  const ns=neighbours(row,col),dirs=[[1,0],[.5,SQRT3/2],[-.5,SQRT3/2],[-1,0],[-.5,-SQRT3/2],[.5,-SQRT3/2]];
  let gx=0,gy=0,weight=0;
  for(let n=0;n<6;n++){
    const j=indexAt(ns[n][0],ns[n][1],rows,cols);
    if(j<0||w.owner[j]<0||w.water[j]||w.elev[j]==null)continue;
    const delta=w.elev[j]-elevation;
    gx+=delta*dirs[n][0];gy+=delta*dirs[n][1];weight++;
  }
  if(weight<2)return 0;
  // Light comes from upper left in screen space. Relief strengthens contrast.
  return clamp((-gx-gy)*3/weight/650,-1,1)*(w.relief[i]>=2?1: w.relief[i]===1?.85:.65);
}
const riverBounds=new WeakMap();
function paintRivers(ctx,w,width,height,scale,ox,oy) {
  if(!Array.isArray(w.rivers)||scale<=0)return;
  let bounds=riverBounds.get(w);
  if(!bounds){
    bounds=w.rivers.map(river=>{
      const pts=river.pts||[];let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for(let j=0;j+1<pts.length;j+=2){minX=Math.min(minX,pts[j]);maxX=Math.max(maxX,pts[j]);minY=Math.min(minY,pts[j+1]);maxY=Math.max(maxY,pts[j+1]);}
      return [minX,minY,maxX,maxY];
    });
    riverBounds.set(w,bounds);
  }
  const visible=[];
  for(let i=0;i<w.rivers.length;i++){
    const b=bounds[i];
    if(ox+b[2]*scale< -4||oy+b[3]*scale< -4||ox+b[0]*scale>width+4||oy+b[1]*scale>height+4)continue;
    visible.push(w.rivers[i]);
  }
  if(!visible.length)return;
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  // Stroke the original generalized vertices twice, keeping the bank understated.
  for(const bank of [true,false]){
    ctx.beginPath();
    for(const river of visible){
      const pts=river.pts;if(!pts||pts.length<4)continue;
      ctx.moveTo(ox+pts[0]*scale,oy+pts[1]*scale);
      for(let j=2;j+1<pts.length;j+=2)ctx.lineTo(ox+pts[j]*scale,oy+pts[j+1]*scale);
    }
    ctx.strokeStyle=bank?'rgba(34,73,72,.72)':'#70adbc';
    ctx.lineWidth=bank?clamp(scale*2.3,1.2,5):clamp(scale*1.25,.65,3);ctx.stroke();
  }
  ctx.restore();
}

// A handful of reusable, transparent painted surfaces. Marks are fixed to a
// cell in map coordinates and are never re-randomized by the camera.
function sequence(seed) {
  let n=0;return ()=>seedRand(seed + n++ * 9973);
}
function groundSprite(cover,variant,cold,scale) {
  const box={w:44*scale,h:51*scale,ax:-22*scale,ay:-25.5*scale};
  return getSprite(`ground:${cover}:${variant}:${cold}`,scale,box,ctx=>{
    const random=sequence(cover*83+variant*901+(cold?1231:0));
    ctx.save();hexPath(ctx,22,25.5,24.7);ctx.clip();
    const snow=cover===11||cold;
    for(let j=0;j<46;j++){
      const x=random()*44,y=random()*51;
      const rx=1.1+random()*5.7,ry=.5+random()*2.8;
      ctx.fillStyle=snow
        ? (j%3===0?'rgba(102,141,153,.17)':'rgba(255,255,247,.30)')
        : (j%3===0?'rgba(30,52,32,.12)':'rgba(238,227,168,.14)');
      ctx.beginPath();ctx.ellipse(x,y,rx,ry,(random()-.5)*.7,0,Math.PI*2);ctx.fill();
    }
    if(snow){
      // Broad overlapping wind-polished snow and blue-grey ice streaks.
      for(let j=0;j<9;j++){
        const x=random()*48-2,y=random()*50;
        ctx.strokeStyle=j%2?'rgba(255,255,250,.42)':'rgba(107,146,158,.20)';
        ctx.lineWidth=.4+random()*1.2;ctx.beginPath();ctx.moveTo(x-4,y+1);
        ctx.quadraticCurveTo(x,y-1.5,x+5+random()*5,y-1);ctx.stroke();
      }
    }
    ctx.restore();
  });
}
// Overlapping map-anchored washes soften classification boundaries. Water is
// repainted afterwards, so the pigment never changes the water mask.
function pigmentSprite(cover,variant,cold,scale) {
  const box={w:92*scale,h:94*scale,ax:-46*scale,ay:-47*scale};
  return getSprite(`pigment:${cover}:${variant}:${cold}`,scale,box,ctx=>{
    const random=sequence(3001+cover*139+variant*919+(cold?601:0));
    const snow=cover===11||cold;
    const palette=snow
      ? ['rgba(255,255,249,.42)','rgba(220,234,230,.38)','rgba(104,143,153,.22)','rgba(247,251,244,.36)']
      : cover>=1&&cover<=3
        ? ['rgba(31,67,42,.28)','rgba(56,91,47,.30)','rgba(175,185,112,.23)','rgba(220,213,158,.18)']
        : cover===7||cover===5||cover===6
          ? ['rgba(131,119,65,.25)','rgba(233,207,133,.31)','rgba(113,137,78,.26)','rgba(241,223,168,.23)']
          : ['rgba(91,111,83,.25)','rgba(221,211,166,.27)','rgba(139,150,121,.26)','rgba(243,236,199,.20)'];
    const wash=ctx.createRadialGradient(46,47,1,46,47,43);
    wash.addColorStop(0,palette[variant%palette.length]);
    wash.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=wash;ctx.fillRect(3,4,86,86);
    for(let j=0;j<15;j++){
      const x=16+random()*60,y=17+random()*60;
      const rx=4+random()*13,ry=2+random()*7;
      ctx.fillStyle=palette[Math.floor(random()*palette.length)];
      ctx.beginPath();ctx.ellipse(x,y,rx,ry,(random()-.5)*1.1,0,Math.PI*2);ctx.fill();
    }
    if(snow){
      for(let j=0;j<7;j++){
        const x=15+random()*58,y=18+random()*57;
        ctx.strokeStyle=j%2?'rgba(255,255,250,.46)':'rgba(116,151,161,.23)';
        ctx.lineWidth=1+random()*2;ctx.beginPath();ctx.moveTo(x-7,y+2);
        ctx.quadraticCurveTo(x,y-2,x+8+random()*9,y-1);ctx.stroke();
      }
    }
  });
}
function treeSprite(kind,variant,scale) {
  const box={w:13*scale,h:15*scale,ax:-6.5*scale,ay:-12*scale};
  return getSprite(`trees:${kind}:${variant}`,scale,box,ctx=>{
    const random=sequence(500+variant*31+kind*13);
    ctx.fillStyle='rgba(27,44,29,.24)';ctx.beginPath();ctx.ellipse(6.8,12,5.8,1.7,0,0,Math.PI*2);ctx.fill();
    // Three overlapping crowns form one clump. Highlight always faces NW.
    const trees=[[3.2,9.5,3.1],[8.9,10,3.4],[6.2,11.1,4.2]];
    for(const [x,y,s] of trees){
      const deciduous=kind===1||(kind===3&&random()<.45);
      ctx.fillStyle='#594f38';ctx.fillRect(x-.3,y-1,.6,2.5);
      if(deciduous){
        ctx.fillStyle=variant%2?'#476d3e':'#557846';ctx.beginPath();ctx.arc(x,y-s*.65,s*.62,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='rgba(191,207,137,.35)';ctx.beginPath();ctx.arc(x-s*.18,y-s*.89,s*.28,0,Math.PI*2);ctx.fill();
      } else {
        const h=s*(1.45+random()*.35),wide=s*.55;
        polygon(ctx,[x-wide,y,x-wide*.68,y-h*.35,x-wide*.78,y-h*.35,x,y-h,x+wide*.7,y-h*.37,x+wide*.57,y-h*.37,x+wide,y],variant%2?'#345a3b':'#2d5038');
        polygon(ctx,[x-wide,y,x-wide*.68,y-h*.35,x,y-h,x-s*.09,y], 'rgba(133,166,103,.38)');
      }
    }
  });
}
function mountainSprite(variant,snow,scale) {
  const box={w:58*scale,h:36*scale,ax:-29*scale,ay:-31*scale};
  return getSprite(`massif:${variant}:${snow}`,scale,box,ctx=>{
    ctx.translate(10,0);
    const random=sequence(177+variant*101);
    ctx.fillStyle='rgba(28,40,32,.24)';ctx.beginPath();ctx.ellipse(19,30,17,3.2,0,0,Math.PI*2);ctx.fill();
    // Unequal silhouettes and staggered shoulders retain upper-left light.
    const peaks=[],count=2+Math.floor(random()*3);
    for(let n=0;n<count;n++){
      const x=6+(n+.35+random()*.5)*26/count;
      peaks.push({x,y:3+random()*14,w:6+random()*9});
    }
    peaks.sort((a,b)=>a.y-b.y);
    for(const p of peaks){
      const base=27+random()*4,shoulder=p.x-p.w*(.25+random()*.3),sy=p.y+(base-p.y)*(.32+random()*.25);
      const right=p.x+p.w*(.65+random()*.4),ridge=p.x+(random()-.35)*3;
      polygon(ctx,[p.x-p.w,base,shoulder,sy,p.x,p.y,ridge,base],variant%2?'#9daca0':'#a6b2a1');
      polygon(ctx,[p.x,p.y,right,base,ridge,base],variant%2?'#53695e':'#5b7064');
      polygon(ctx,[p.x-p.w,base,shoulder,sy,ridge-1,base],'rgba(55,75,61,.25)');
      ctx.strokeStyle='rgba(43,60,51,.33)';ctx.lineWidth=.45;ctx.beginPath();ctx.moveTo(p.x,p.y+1);ctx.lineTo(p.x-2,sy+2);ctx.lineTo(ridge,base-2);ctx.stroke();
      if(snow){
        const t=(snow===2?.33:.19)+random()*.09,sy2=p.y+(base-p.y)*t,sw=p.w*t;
        polygon(ctx,[p.x-sw,sy2,p.x,p.y,p.x+sw,sy2,p.x+sw*.55,sy2+1+random()*2,p.x+sw*.08,sy2+.6,p.x-sw*.4,sy2+1+random()*2], '#eaf1eb');
        polygon(ctx,[p.x,p.y,p.x+sw,sy2,p.x+sw*.55,sy2+2,p.x+sw*.08,sy2+.6], '#becfd0');
      }
    }
  });
}
function hillSprite(variant,scale) {
  const box={w:25*scale,h:12*scale,ax:-12.5*scale,ay:-9*scale};
  return getSprite(`hill:${variant}`,scale,box,ctx=>{
    const random=sequence(241+variant*89);
    for(let n=0;n<3;n++){
      const x=5+n*7,y=9+random(),wide=5+random()*2,h=3+random()*3;
      ctx.fillStyle='rgba(37,55,38,.20)';ctx.beginPath();ctx.ellipse(x,y,wide,1.3,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=n%2?'#788e68':'#849775';ctx.beginPath();ctx.moveTo(x-wide,y);ctx.quadraticCurveTo(x-wide*.5,y-h,x,y-h);ctx.quadraticCurveTo(x+wide*.6,y-h*.8,x+wide,y);ctx.fill();
      ctx.strokeStyle='rgba(230,229,185,.42)';ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(x-wide*.8,y-.4);ctx.quadraticCurveTo(x-wide*.4,y-h,x,y-h+.3);ctx.stroke();
    }
  });
}
// Grid lines are in EPSG:3347 map kilometres. The x=2500 km transition is
// an approximate Manitoba/Shield edge, not a claim about real parcel boundaries.
function paintFields(ctx,x,y,wx,wy,r,scale,i,share,lod) {
  if(!Number.isFinite(share)||share<=0)return;
  const west=wx<2500, step=west?6:4, lotHeight=west?6:3.4;
  const left=wx-22,right=wx+22,top=wy-25,bottom=wy+25;
  ctx.save();hexPath(ctx,x,y,r*.99);ctx.clip();
  for(let gy=Math.floor(top/lotHeight);gy<=Math.floor(bottom/lotHeight);gy++){
    for(let gx=Math.floor(left/step);gx<=Math.floor(right/step);gx++){
      const key=Math.imul(gx,73856093)^Math.imul(gy,19349663);
      if(rand(key,30)>share/100)continue;
      const offset=west?0:(rand(key,31)-.5)*step*.35;
      const px=x+(gx*step+offset-wx)*scale,py=y+(gy*lotHeight-wy)*scale;
      const fw=(step-(west?.3:.25))*scale,fh=(lotHeight-.25)*scale;
      const colors=['#cbb77b','#d7c58a','#b5ad70','#a6aa6d','#c1a96d','#d2bd7c','#9da56e'];
      ctx.fillStyle=colors[Math.floor(rand(key,32)*colors.length)];ctx.fillRect(px,py,fw,fh);
      if(lod===CLOSE){
        ctx.strokeStyle='rgba(87,92,53,.25)';ctx.lineWidth=Math.max(.35,scale*.12);ctx.beginPath();
        for(let line=1;line<5;line++){
          if(rand(key,33)<.5){const yy=py+fh*line/5;ctx.moveTo(px+.3,yy);ctx.lineTo(px+fw-.3,yy);}
          else {const xx=px+fw*line/5;ctx.moveTo(xx,py+.3);ctx.lineTo(xx,py+fh-.3);}
        }
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
function countFor(share,maximum,i,salt) {
  if(!Number.isFinite(share)||share<=0)return 0;
  const n=clamp(share,0,100)*maximum/100;
  return Math.floor(n)+(rand(i,salt)<n%1?1:0);
}
// This is the same decorative snow rule used by the detailed mountain stamps.
function mountainSnow(cover,wy,max) {
  return cover===11||wy<1500||(max!=null&&max>2300)?2:wy<2300||(max!=null&&max>1800)?1:0;
}
function paintFarMountain(ctx,x,y,r,snow) {
  // Compact silhouettes stay inside the cell and do not imply a summit position.
  const top=y-r*.48, base=y+r*.28, left=x-r*.48, right=x+r*.48;
  polygon(ctx,[left,base,x,top,x+r*.05,base],FAR_MOUNTAIN.light);
  polygon(ctx,[x,top,right,base,x+r*.05,base],FAR_MOUNTAIN.dark);
  if(snow){
    const depth=snow===2?.34:.23, sy=top+(base-top)*depth, sw=r*.48*depth;
    polygon(ctx,[x-sw,sy,x,top,x+sw,sy,x+sw*.4,sy+r*.04,x,sy-r*.03,x-sw*.45,sy+r*.05],FAR_MOUNTAIN.snow);
  }
}
export function paintMapTerrain(ctx,w,{width,height,scale,ox,oy}) {
  if(scale<=0)return;
  const radius=w.grid.radius||25,R=radius*scale,dx=SQRT3*radius,dy=1.5*radius;
  const cols=w.grid.cols,rows=w.grid.rows,lod=lodFor(R),cells=[];
  const textures=new Map(),trees=new Map(),mountains=new Map(),hills=new Map();
  const sprite=(cache,key,make)=>{if(!cache.has(key))cache.set(key,make());return cache.get(key);};
  // Fallback ocean, coast and lake fills. See HOOK-REQUEST.md for the water stream.
  ctx.fillStyle='#1b4967';ctx.fillRect(0,0,width,height);
  const firstRow=Math.max(0,Math.floor((-oy-2*R)/(dy*scale)));
  const lastRow=Math.min(rows-1,Math.ceil((height-oy+2*R)/(dy*scale)));
  for(let row=firstRow;row<=lastRow;row++){
    const y=oy+row*dy*scale,shift=.5*(row&1);
    const firstCol=Math.max(0,Math.floor((-ox-2*R)/(dx*scale)-shift));
    const lastCol=Math.min(cols-1,Math.ceil((width-ox+2*R)/(dx*scale)-shift));
    for(let col=firstCol;col<=lastCol;col++){
      const wx=(col+shift)*dx,wy=row*dy,x=ox+wx*scale;
      const i=row*cols+col,o=w.owner[i],water=w.water[i];
      // Water cells are filled by paintWater so oversized hex fills do not
      // poke past the midpoint shoreline.
      if(water || o===-2) continue;
      const corners=R>3?exposedCorners(w,row,col,rows,cols,j=>!w.water[j]):null;
      const rounded=corners&&corners.some(Boolean);
      const cover=w.cover[i]||0;
      const arcticColor=lod===FAR?arcticFarColor(w,row,col,LAND_FAR):null;
      // High northern barren and shrub cells receive a cool surface treatment;
      // ice cover itself remains the only explicit ice classification.
      const cold=(cover===4||cover===5||cover===10)&&rand(i,44)<clamp((2200-wy)/700,0,1);
      ctx.fillStyle=arcticColor||(cold?'#b5bcb0':landFill(cover,lod));
      if(rounded)boundaryHex(ctx,x,y,R+.35,corners);else hexPath(ctx,x,y,R+.35);
      ctx.fill();ctx.globalAlpha=1;
      if(o<0)continue;
      const light=shade(w,i,row,col,rows,cols)*(arcticColor ? .35 : 1);
      if(light){
        const strength=lod===FAR?1.3:1;
        ctx.fillStyle=light>0?`rgba(${SHADE_TINTS.light},${(.14*strength*light).toFixed(3)})`:`rgba(${SHADE_TINTS.dark},${(-.16*strength*light).toFixed(3)})`;
        if(rounded)boundaryHex(ctx,x,y,R+.2,corners);else hexPath(ctx,x,y,R+.2);
        ctx.fill();
      }
      const shore=lod!==FAR&&neighbours(row,col).some(([r,c])=>{
        const j=indexAt(r,c,rows,cols);return j<0||!!w.water[j];
      });
      cells.push({i,x,y,wx,wy,cover,cold,arcticColor,corners:rounded?corners:null,shore});
    }
  }
  // A second pass permits pigment to overlap adjacent land classifications.
  for(const cell of cells){
    const {i,x,y,cover,cold,arcticColor,corners}=cell;
    // The large random washes obscure small Arctic islands at national zoom.
    if(lod===FAR&&arcticColor)continue;
    const variant=Math.floor(rand(i,3)*8),key=`${cover}:${variant}:${cold}`;
    if(lod<=MID){
      const texture=sprite(textures,key,()=>pigmentSprite(cover,variant,cold,scale));
      // At national scale keep the classified colour legible under the wash.
      if(lod===FAR&&!cold&&cover!==11)ctx.globalAlpha=.35;
      drawSprite(ctx,texture,x,y);
      ctx.globalAlpha=1;
    } else {
      const texture=sprite(textures,key,()=>groundSprite(cover,variant,cold,scale));
      if(corners){ctx.save();boundaryHex(ctx,x,y,R,corners);ctx.clip();}
      drawSprite(ctx,texture,x,y);
      if(corners)ctx.restore();
    }
  }
  // Foreign land and water are part of the cached terrain pass.
  paintNeighbours(ctx, w, {width, height, scale, ox, oy});
  paintWater(ctx, w, {width, height, scale, ox, oy});
  if(lod===FAR)for(const cell of cells){
    const {i,x,y,wy,cover}=cell;
    if(w.relief[i]<2)continue;
    ctx.save();hexPath(ctx,x,y,R);ctx.clip();
    paintFarMountain(ctx,x,y,R,mountainSnow(cover,wy,w.elev_max?.[i]));
    ctx.restore();
  }
  const allMarks=[];
  if(lod!==FAR)for(const cell of cells){
    const {i,x,y,wx,wy,cold,corners,shore}=cell,cover=w.cover[i],rel=w.relief[i];
    const pct=w.pct||{};
    if(shore){ctx.save();if(corners)boundaryHex(ctx,x,y,R,corners);else hexPath(ctx,x,y,R);ctx.clip();}
    paintFields(ctx,x,y,wx,wy,R,scale,i,pct.crop?.[i],lod);
    const marks=[];
    const forest=cover===11||(cold&&wy<1500)?0:countFor(pct.forest?.[i],lod===MID?4:lod===NEAR?13:20,i,300);
    for(let j=0;j<forest;j++){
      const px=x+(rand(i,301+j*3)-.5)*R*1.38,py=y+(rand(i,302+j*3)-.5)*R*1.20;
      const kind=cover===1?1:cover===2?2:cover===3?3:(rand(i,360+j)<(wy<2300?.13:.35)?1:2);
      const variant=Math.floor(rand(i,390+j)*4),key=`${kind}:${variant}`;
      marks.push({x:px,y:py,k:.75+rand(i,420+j)*.55,sprite:sprite(trees,key,()=>treeSprite(kind,variant,scale))});
    }
    if(rel===1){
      const count=lod===MID?1:2;
      for(let j=0;j<count;j++){
        const variant=Math.floor(rand(i,510+j)*4);
        marks.push({x:x+(rand(i,520+j)-.5)*R*.8,y:y+(rand(i,530+j)-.5)*R*.6,k:.75+rand(i,540+j)*.4,sprite:sprite(hills,variant,()=>hillSprite(variant,scale))});
      }
    } else if(rel>=2){
      // Elevation and northern location affect decorative snow, never summit placement.
      const snow=mountainSnow(cover,wy,w.elev_max?.[i]);
      const base=lod===MID?2:lod===NEAR?4:5;
      const density=rand(i,590);
      const count=density<.12?1:density<.36?Math.max(2,base-2):density<.76?base:base+2;
      for(let j=0;j<count;j++){
        const variant=Math.floor(rand(i,600+j)*12),key=`${variant}:${snow}`;
        marks.push({x:x+(rand(i,610+j*2)-.5)*R*1.55,y:y+(rand(i,611+j*2)-.5)*R*1.25,k:.48+rand(i,640+j)*.82,sprite:sprite(mountains,key,()=>mountainSprite(variant,snow,scale))});
      }
    }
    for(const mark of marks)allMarks.push({...mark,shore,corners,cellX:x,cellY:y});
    if(shore)ctx.restore();
  }
  allMarks.sort((a,b)=>a.y-b.y);
  for(const mark of allMarks){
    if(mark.shore){
      ctx.save();
      if(mark.corners)boundaryHex(ctx,mark.cellX,mark.cellY,R,mark.corners);
      else hexPath(ctx,mark.cellX,mark.cellY,R);
      ctx.clip();
    }
    drawSprite(ctx,mark.sprite,mark.x,mark.y,mark.k);
    if(mark.shore)ctx.restore();
  }
  paintRivers(ctx,w,width,height,scale,ox,oy);
}
