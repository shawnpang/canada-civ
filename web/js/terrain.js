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
    const t=round[k] ? .22 : 0;
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
function mountain(ctx,x,y,r,rel,snow,seed) {
  const h=r*(rel===3?1.18: .86+rand(seed,71)*.25);
  const left=r*(.49+rand(seed,72)*.19),right=r*(.50+rand(seed,73)*.23);
  const peak=x+r*(rand(seed,74)-.5)*.25, base=y+r*.25;
  ctx.fillStyle='rgba(26,35,31,.22)';ctx.beginPath();ctx.ellipse(x+r*.08,base,r*.75,r*.16,0,0,Math.PI*2);ctx.fill();
  polygon(ctx,[x-left,base,peak-r*.22,y-h*.56,peak,y-h,x+right,base], '#6b7167');
  polygon(ctx,[peak,y-h,x+right,base,peak+r*.07,base-r*.10], '#46534f');
  polygon(ctx,[x-left,base,peak-r*.22,y-h*.56,peak,y-h,peak-r*.22,base-r*.10], '#96998a');
  ctx.strokeStyle='rgba(38,48,43,.30)';ctx.lineWidth=Math.max(.5,r*.035);
  ctx.beginPath();ctx.moveTo(peak,y-h*.82);ctx.lineTo(peak-r*.08,y-h*.40);ctx.lineTo(peak+r*.06,y-h*.21);ctx.stroke();
  if(snow){
    polygon(ctx,[peak-r*.19,y-h*.58,peak,y-h,peak+r*.25,y-h*.52,peak+r*.12,y-h*.45,peak+r*.04,y-h*.52,peak-r*.08,y-h*.37], '#edf0e6');
    polygon(ctx,[peak,y-h,peak+r*.25,y-h*.52,peak+r*.12,y-h*.45,peak+r*.04,y-h*.52], '#bccbcc');
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
function groundMarks(ctx,x,y,r,cover,i) {
  if(cover>=1&&cover<=3){
    const count=r>12?6+Math.floor(rand(i,40)*4):4;
    const trees=[];
    for(let j=0;j<count;j++)trees.push({x:x+(rand(i,j*2)-.5)*r*1.15,y:y+(rand(i,j*2+1)-.5)*r*.75,j});
    trees.sort((a,b)=>a.y-b.y);
    for(const p of trees)tree(ctx,p.x,p.y,r*(.14+rand(i,p.j+50)*.10),cover===1?1:cover===3&&rand(i,p.j+80)<.38?1:2,rand(i,p.j+90)>.5);
  } else if(cover===7){
    // Small alternating field patches, with varied orientation and spacing.
    ctx.save();ctx.translate(x,y);ctx.rotate((rand(i,30)-.5)*.8);
    const offset=(rand(i,31)-.5)*r*.18, spacing=r*(.12+rand(i,32)*.035);
    ctx.strokeStyle='rgba(91,82,42,.34)';ctx.lineWidth=Math.max(.55,r*.035);
    for(let j=-2;j<=2;j++){
      const yy=j*spacing+offset;
      ctx.beginPath();ctx.moveTo(-r*.43,yy);ctx.lineTo(r*.43,yy);ctx.stroke();
    }
    ctx.strokeStyle='rgba(246,224,150,.32)';ctx.lineWidth=Math.max(.5,r*.025);
    ctx.beginPath();ctx.moveTo(-r*.43,-spacing*.5+offset);ctx.lineTo(r*.43,-spacing*.5+offset);ctx.stroke();
    ctx.restore();
  } else if(cover===11){
    ctx.strokeStyle='rgba(112,148,164,.32)';ctx.lineWidth=Math.max(.5,r*.035);ctx.lineCap='round';
    for(let j=0;j<3;j++){
      const px=x+(rand(i,j)-.5)*r*.9,py=y+(rand(i,j+4)-.5)*r*.75,len=r*(.12+rand(i,j+20)*.16);
      ctx.beginPath();ctx.moveTo(px-len,py);ctx.quadraticCurveTo(px,py-r*.08,px+len,py-r*.025);ctx.stroke();
    }
    if(rand(i,35)>.55){ctx.fillStyle='rgba(255,255,247,.32)';ctx.beginPath();ctx.ellipse(x-r*.22,y-r*.25,r*.12,r*.035,-.3,0,Math.PI*2);ctx.fill()}
  } else {
    // Sparse clumps and stones keep northern barren and shrub terrain distinct.
    ctx.strokeStyle=cover===8?'rgba(205,227,206,.40)':cover===10?'rgba(91,99,82,.32)':'rgba(65,81,48,.34)';
    ctx.lineWidth=Math.max(.55,r*.04);ctx.lineCap='round';
    for(let j=0;j<5;j++){
      const px=x+(rand(i,j)-.5)*r*1.05,py=y+(rand(i,j+8)-.5)*r*.75;
      const length=r*(.07+rand(i,j+16)*.08);
      ctx.beginPath();ctx.moveTo(px-length,py);ctx.lineTo(px,py-r*(cover===10?.02:.08));ctx.lineTo(px+length,py);ctx.stroke();
      if((cover===4||cover===5||cover===8)&&rand(i,j+25)>.5){ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+r*.025,py-r*.15);ctx.stroke()}
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
        const depth=clamp(-(w.elev[i] ?? -1000)/4500,0,1);
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
  if(R<3.5)return;
  for(const [i,x,y] of cells){
    const cover=w.cover[i],rel=w.relief[i];
    if(R>5)groundMarks(ctx,x,y,R,cover,i);
    if(rel>=2){
      const snowy=cover===11||(w.elev_max[i]??0)>1800;
      mountain(ctx,x,y,R,rel,snowy,i);
      if(R>12)mountain(ctx,x-R*.38,y+R*.24,R*.48,2,snowy,i+1);
    } else if(rel===1 && R>5){
      const crest=(rand(i,100)-.5)*R*.18;
      ctx.strokeStyle='rgba(53,70,48,.42)';ctx.lineWidth=Math.max(.7,R*.06);ctx.beginPath();ctx.moveTo(x-R*.55,y+R*.24);ctx.quadraticCurveTo(x-R*.24,y-R*.18+crest,x,y+R*.10);ctx.quadraticCurveTo(x+R*.27,y-R*.10-crest,x+R*.55,y+R*.24);ctx.stroke();
      ctx.strokeStyle='rgba(226,220,166,.22)';ctx.lineWidth=Math.max(.5,R*.025);ctx.beginPath();ctx.moveTo(x-R*.45,y+R*.18);ctx.quadraticCurveTo(x-R*.24,y-R*.20+crest,x-R*.04,y+R*.03);ctx.stroke();
    }
  }
}
