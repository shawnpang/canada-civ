// Original procedural map painting. The small repeatable marks are decorative,
// not individual trees, fields, ice features, or measured mountain summits.
const LAND = ['#81936d','#829b60','#496d4c','#66885b','#a0a276','#b7a96f','#a4a575','#c1ae6e','#829b78','#aaa487','#a9a895','#dce3d7'];
const SQRT3 = Math.sqrt(3);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
function rand(i,n) {
  let x = Math.imul(i + 1, 0x45d9f3b) ^ Math.imul(n + 19, 0x27d4eb2d);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
function hex(ctx,x,y,r) {
  ctx.beginPath();
  for (let k=0;k<6;k++) {
    const a=(k*60-30)*Math.PI/180;
    const px=x+r*Math.cos(a), py=y+r*Math.sin(a);
    if(k===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.closePath();
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
function mountain(ctx,x,y,r,rel,snow,seed,contrast) {
  const h=r*(rel===3?1.04:.72+rand(seed,71)*.18);
  const left=r*(.38+rand(seed,72)*.13),right=r*(.39+rand(seed,73)*.15);
  const peak=x+r*(rand(seed,74)-.5)*.20, base=y+r*.25;
  ctx.fillStyle='rgba(25,36,30,.24)';ctx.beginPath();ctx.ellipse(x+r*.08,base,r*.64,r*.13,0,0,Math.PI*2);ctx.fill();
  // Northwest-facing facets catch the light; the opposite face is in shadow.
  const light=Math.round(142+contrast*24), dark=Math.round(66-contrast*13);
  polygon(ctx,[x-left,base,peak-r*.18,y-h*.50,peak,y-h,peak-r*.07,base], `rgb(${light},${light+4},${light-4})`);
  polygon(ctx,[peak,y-h,x+right,base,peak-r*.07,base], `rgb(${dark},${dark+11},${dark+9})`);
  polygon(ctx,[x-left,base,peak-r*.19,y-h*.50,peak-r*.07,base], 'rgba(57,70,57,.28)');
  ctx.strokeStyle='rgba(31,42,37,.32)';ctx.lineWidth=Math.max(.5,r*.025);
  ctx.beginPath();ctx.moveTo(peak,y-h*.89);ctx.lineTo(peak-r*.10,y-h*.42);ctx.lineTo(peak-r*.03,base-r*.07);ctx.stroke();
  if(snow){
    polygon(ctx,[peak-r*.16,y-h*.53,peak,y-h,peak+r*.19,y-h*.54,peak+r*.09,y-h*.46,peak+r*.02,y-h*.52,peak-r*.07,y-h*.39], '#e9eee7');
    polygon(ctx,[peak,y-h,peak+r*.19,y-h*.54,peak+r*.09,y-h*.46,peak+r*.02,y-h*.52], '#b8c9c9');
  }
}
function tree(ctx,x,y,r,kind,variant) {
  ctx.fillStyle='rgba(24,43,28,.22)';ctx.beginPath();ctx.ellipse(x+r*.07,y+r*.28,r*.39,r*.13,0,0,Math.PI*2);ctx.fill();
  if(kind===1){
    ctx.fillStyle='#344d32';ctx.fillRect(x-r*.05,y,r*.10,r*.3);
    ctx.fillStyle=variant?'#486b3e':'#3d633b';ctx.beginPath();ctx.arc(x,y-r*.07,r*.34,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(182,200,132,.28)';ctx.beginPath();ctx.arc(x-r*.1,y-r*.19,r*.15,0,Math.PI*2);ctx.fill();
  } else {
    polygon(ctx,[x-r*.32,y+r*.16,x-r*.19,y-r*.06,x,y-r*(variant?.62:.52),x+r*.22,y-r*.04,x+r*.32,y+r*.16], variant?'#31543a':'#294b35');
    polygon(ctx,[x-r*.28,y+r*.11,x,y-r*(variant?.62:.52),x-r*.02,y+r*.10], '#527950');
  }
}
// Fractional counts are deterministic across frames; a zero share produces no marks.
function markCount(share,maximum,i,salt) {
  if(!Number.isFinite(share)||share<=0)return 0;
  const exact=clamp(share,0,100)*maximum/100;
  return Math.floor(exact)+(rand(i,salt)<exact%1?1:0);
}
function groundMarks(ctx,x,y,r,cover,i,pct) {
  const share=key=>pct?.[key]?.[i];
  const fields=markCount(share('crop'),r>12?8:5,i,200);
  // Patch positions are decorative: a cover share does not locate individual fields.
  for(let j=0;j<fields;j++){
    const px=x+(rand(i,201+j*3)-.5)*r*.95,py=y+(rand(i,202+j*3)-.5)*r*.68;
    const fw=r*(.16+rand(i,203+j*3)*.14),fh=r*(.12+rand(i,230+j)*.10);
    const colors=['#c9b46c','#a3a55e','#d7c681','#b49e61'];
    ctx.fillStyle=colors[Math.floor(rand(i,240+j)*colors.length)];ctx.fillRect(px-fw/2,py-fh/2,fw,fh);
    ctx.strokeStyle='rgba(80,80,45,.18)';ctx.lineWidth=Math.max(.4,r*.012);ctx.strokeRect(px-fw/2,py-fh/2,fw,fh);
  }
  const reeds=markCount(share('wetland'),r>12?7:4,i,260);
  ctx.lineCap='round';ctx.lineWidth=Math.max(.6,r*.025);
  for(let j=0;j<reeds;j++){
    const px=x+(rand(i,261+j*2)-.5)*r*.95,py=y+(rand(i,262+j*2)-.5)*r*.65;
    ctx.strokeStyle='rgba(48,91,67,.65)';ctx.beginPath();
    ctx.moveTo(px-r*.06,py);ctx.lineTo(px-r*.08,py-r*.13);ctx.moveTo(px,py);ctx.lineTo(px+r*.02,py-r*.19);ctx.moveTo(px+r*.06,py);ctx.lineTo(px+r*.10,py-r*.12);ctx.stroke();
    ctx.strokeStyle='rgba(194,210,162,.55)';ctx.beginPath();ctx.moveTo(px-r*.10,py+r*.03);ctx.lineTo(px+r*.12,py+r*.03);ctx.stroke();
  }
  const count=markCount(share('forest'),r>12?10:6,i,300), trees=[];
  for(let j=0;j<count;j++)trees.push({x:x+(rand(i,301+j*2)-.5)*r*1.05,y:y+(rand(i,302+j*2)-.5)*r*.70,j});
  trees.sort((a,b)=>a.y-b.y);
  for(const p of trees){
    const kind=cover===1?1:cover===2?2:rand(i,p.j+360)<.35?1:2;
    tree(ctx,p.x,p.y,r*(.13+rand(i,p.j+340)*.08),kind,rand(i,p.j+380)>.5);
  }
  if(cover===11){
    ctx.strokeStyle='rgba(112,148,164,.32)';ctx.lineWidth=Math.max(.5,r*.035);
    for(let j=0;j<3;j++){
      const px=x+(rand(i,j)-.5)*r*.9,py=y+(rand(i,j+4)-.5)*r*.75,len=r*(.12+rand(i,j+20)*.16);
      ctx.beginPath();ctx.moveTo(px-len,py);ctx.quadraticCurveTo(px,py-r*.08,px+len,py-r*.025);ctx.stroke();
    }
  } else if(cover===4||cover===5||cover===10){
    ctx.strokeStyle=cover===10?'rgba(91,99,82,.32)':'rgba(65,81,48,.34)';ctx.lineWidth=Math.max(.55,r*.035);
    for(let j=0;j<4;j++){
      const px=x+(rand(i,j)-.5)*r*1.05,py=y+(rand(i,j+8)-.5)*r*.75, length=r*(.07+rand(i,j+16)*.08);
      ctx.beginPath();ctx.moveTo(px-length,py);ctx.lineTo(px,py-r*(cover===10?.02:.08));ctx.lineTo(px+length,py);ctx.stroke();
    }
  }
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
export function paintMapTerrain(ctx,w,{width,height,scale,ox,oy}) {
  const R=25*scale,dx=SQRT3*25,cols=w.grid.cols,rows=w.grid.rows;
  // The ocean extends beyond the finite source grid.
  ctx.fillStyle='#315e6b';ctx.fillRect(0,0,width,height);
  const cells=[];
  for(let row=0;row<rows;row++){
    const y=oy+row*37.5*scale;if(y< -R*2||y>height+R*2)continue;
    for(let col=0;col<cols;col++){
      const x=ox+(col+.5*(row&1))*dx*scale;if(x< -R*2||x>width+R*2)continue;
      const i=row*cols+col,o=w.owner[i],water=w.water[i];
      const edge=clamp(Math.min(row,col,rows-1-row,cols-1-col)/9,0,1);
      if(water===1){
        const depth=w.elev[i]==null?0:clamp(-w.elev[i]/4500,0,1);
        if(depth>.08&&edge>0){ctx.fillStyle=`rgba(11,37,53,${(.055*depth*edge).toFixed(3)})`;hex(ctx,x,y,R+.35);ctx.fill()}
        continue;
      }
      if(water){
        ctx.globalAlpha=edge;ctx.fillStyle=water===3?'#6d9fa9':'#4b8089';
        if(water===3&&R>3){
          const corners=exposedCorners(w,row,col,rows,cols,j=>j>=0&&w.water[j]===3);
          boundaryHex(ctx,x,y,R+.35,corners);
        } else hex(ctx,x,y,R+.35);
        ctx.fill();ctx.globalAlpha=1;continue;
      }
      if(o===-2)ctx.globalAlpha=edge;
      ctx.fillStyle=o===-2?'#758873':LAND[w.cover[i]]||LAND[0];
      const corners=R>3?exposedCorners(w,row,col,rows,cols,j=>j>=0&&!w.water[j]):null;
      if(corners&&corners.some(Boolean))boundaryHex(ctx,x,y,R+.35,corners);else hex(ctx,x,y,R+.35);
      ctx.fill();ctx.globalAlpha=1;
      if(o>=0){
        const light=shade(w,i,row,col,rows,cols);
        if(light){
          ctx.fillStyle=light>0?`rgba(250,239,202,${(.17*light).toFixed(3)})`:`rgba(23,38,36,${(-.19*light).toFixed(3)})`;
          if(corners&&corners.some(Boolean))boundaryHex(ctx,x,y,R+.2,corners);else hex(ctx,x,y,R+.2);
          ctx.fill();
        }
        cells.push([i,x,y]);
      }
      if(R>4&&o>=0){
        ctx.strokeStyle='rgba(34,51,40,.12)';ctx.lineWidth=.5;
        if(corners&&corners.some(Boolean))boundaryHex(ctx,x,y,R,corners);else hex(ctx,x,y,R);
        ctx.stroke();
      }
    }
  }
  if(R>=3.5)for(const [i,x,y] of cells){
    const cover=w.cover[i],rel=w.relief[i];
    if(R>5)groundMarks(ctx,x,y,R,cover,i,w.pct);
    if(rel>=2){
      const snowy=cover===11||(w.elev_max[i]!=null&&w.elev_max[i]>1800);
      // Measured mean height only adjusts contrast, never the relief class.
      const contrast=w.elev[i]==null?0:clamp(w.elev[i]/2500,0,1);
      if(R>12)mountain(ctx,x-R*.30,y-R*.01,R*.65,rel,snowy,i+1,contrast);
      mountain(ctx,x+R*.08,y+R*.08,R*.83,rel,snowy,i,contrast);
      if(R>12)mountain(ctx,x+R*.40,y+R*.23,R*.48,2,snowy,i+2,contrast);
    } else if(rel===1 && R>5){
      const crest=(rand(i,100)-.5)*R*.14;
      ctx.fillStyle='rgba(37,55,38,.20)';ctx.beginPath();ctx.ellipse(x+R*.06,y+R*.28,R*.55,R*.13,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#718562';ctx.beginPath();ctx.moveTo(x-R*.55,y+R*.24);ctx.quadraticCurveTo(x-R*.30,y-R*.22+crest,x-R*.06,y+R*.08);ctx.quadraticCurveTo(x+R*.22,y-R*.22-crest,x+R*.55,y+R*.24);ctx.closePath();ctx.fill();
      ctx.strokeStyle='rgba(232,226,179,.45)';ctx.lineWidth=Math.max(.5,R*.035);ctx.beginPath();ctx.moveTo(x-R*.50,y+R*.19);ctx.quadraticCurveTo(x-R*.30,y-R*.18+crest,x-R*.13,y+R*.04);ctx.stroke();
    }
  }
  paintRivers(ctx,w,width,height,scale,ox,oy);
}
