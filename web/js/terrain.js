// Original procedural map painting. Data drives every terrain choice; the small
// repeatable marks are decorative, not individual trees or measured features.
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
function mountain(ctx,x,y,r,rel,snow,seed) {
  // Asymmetric faceted ridges with a consistent upper-left light source.
  const h=r*(rel===3?1.22:1.02), width=r*.65;
  ctx.fillStyle='rgba(26,35,31,.22)';ctx.beginPath();ctx.ellipse(x+r*.09,y+r*.29,r*.83,r*.18,0,0,Math.PI*2);ctx.fill();
  polygon(ctx,[x-width,y+r*.24,x-r*.19,y-h*.62,x+r*.08,y-h,x+width,y+r*.24], '#6b7066');
  polygon(ctx,[x+r*.08,y-h,x+width,y+r*.24,x+r*.15,y+r*.14], '#424f4b');
  polygon(ctx,[x-width,y+r*.24,x-r*.19,y-h*.62,x+r*.08,y-h,x-r*.25,y+r*.12], '#92968a');
  if(snow) {
    polygon(ctx,[x-r*.20,y-h*.61,x+r*.08,y-h,x+r*.32,y-h*.50,x+r*.19,y-h*.43,x+r*.08,y-h*.50,x-r*.03,y-h*.36], '#ebeee4');
    polygon(ctx,[x+r*.08,y-h,x+r*.32,y-h*.50,x+r*.19,y-h*.43,x+r*.08,y-h*.50], '#b9c8ca');
  }
}
function tree(ctx,x,y,r,kind) {
  ctx.fillStyle='rgba(24,43,28,.23)';ctx.beginPath();ctx.ellipse(x+r*.07,y+r*.28,r*.39,r*.13,0,0,Math.PI*2);ctx.fill();
  if(kind===1){
    ctx.fillStyle='#344d32';ctx.fillRect(x-r*.05,y,r*.10,r*.3);
    ctx.fillStyle='#3d633b';ctx.beginPath();ctx.arc(x,y-r*.07,r*.34,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(182,200,132,.28)';ctx.beginPath();ctx.arc(x-r*.1,y-r*.19,r*.15,0,Math.PI*2);ctx.fill();
  } else {
    polygon(ctx,[x-r*.31,y+r*.16,x,y-r*.53,x+r*.31,y+r*.16], '#294b35');
    polygon(ctx,[x-r*.28,y-r*.01,x,y-r*.53,x-r*.02,y+r*.11], '#527950');
  }
}
function groundMarks(ctx,x,y,r,cover,i) {
  if(cover>=1&&cover<=3){
    const count=r>12?7:4;
    for(let j=0;j<count;j++){
      const px=x+(rand(i,j*2)-.5)*r*1.25,py=y+(rand(i,j*2+1)-.5)*r*.85;
      tree(ctx,px,py,r*(.16+rand(i,j+50)*.09),cover===1?1:cover===3&&j%3===0?1:2);
    }
  } else if(cover===7){
    // Schematic furrows, clipped to the tile by their conservative placement.
    ctx.strokeStyle='rgba(91,82,42,.31)';ctx.lineWidth=Math.max(.55,r*.035);
    for(let j=-2;j<=2;j++){ctx.beginPath();ctx.moveTo(x-r*.49,y+j*r*.15-r*.12);ctx.lineTo(x+r*.49,y+j*r*.15+r*.12);ctx.stroke()}
    ctx.strokeStyle='rgba(246,224,150,.25)';ctx.beginPath();ctx.moveTo(x-r*.18,y-r*.43);ctx.lineTo(x-r*.42,y+r*.34);ctx.stroke();
  } else if(cover===11){
    ctx.strokeStyle='rgba(124,156,169,.32)';ctx.lineWidth=Math.max(.5,r*.04);
    for(let j=0;j<3;j++){let px=x+(rand(i,j)-.5)*r,py=y+(rand(i,j+4)-.5)*r*.9;ctx.beginPath();ctx.moveTo(px-r*.2,py);ctx.quadraticCurveTo(px,py-r*.09,px+r*.22,py);ctx.stroke()}
  } else {
    ctx.strokeStyle=cover===8?'rgba(205,227,206,.35)':'rgba(65,81,48,.34)';ctx.lineWidth=Math.max(.55,r*.045);ctx.lineCap='round';
    for(let j=0;j<5;j++){let px=x+(rand(i,j)-.5)*r*1.2,py=y+(rand(i,j+8)-.5)*r;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+r*.10,py-r*(cover===10?.03:.12));ctx.stroke()}
  }
}
export function paintMapTerrain(ctx,w,{width,height,scale,ox,oy}) {
  const R=25*scale,dx=SQRT3*25,cols=w.grid.cols,rows=w.grid.rows;
  // The ocean extends beyond the finite source grid. Only shallows and lakes
  // need cell fills, so the boundary of the dataset never becomes a coastline.
  ctx.fillStyle='#315e6b';ctx.fillRect(0,0,width,height);
  const cells=[];
  for(let row=0;row<rows;row++){
    const y=oy+row*37.5*scale;if(y< -R*2||y>height+R*2)continue;
    for(let col=0;col<cols;col++){
      const x=ox+(col+.5*(row&1))*dx*scale;if(x< -R*2||x>width+R*2)continue;
      const i=row*cols+col,o=w.owner[i],water=w.water[i];
      const edge=clamp(Math.min(row,col,rows-1-row,cols-1-col)/9,0,1);
      if(water===1){
        // Depth tint fades at the grid edge, with the same deep-ocean base outside.
        const depth=clamp(-(w.elev[i] ?? -1000)/4500,0,1);
        if(depth>.08&&edge>0){ctx.fillStyle=`rgba(11,37,53,${(.055*depth*edge).toFixed(3)})`;hex(ctx,x,y,R+.35);ctx.fill()}
        continue;
      }
      if(water){ctx.globalAlpha=edge;ctx.fillStyle=water===3?'#6d9fa9':'#4b8089';hex(ctx,x,y,R+.35);ctx.fill();ctx.globalAlpha=1;continue}
      if(o===-2)ctx.globalAlpha=edge;
      ctx.fillStyle=o===-2?'#758873':LAND[w.cover[i]]||LAND[0];hex(ctx,x,y,R+.35);ctx.fill();ctx.globalAlpha=1;
      if(o>=0){
        // Neighbour means give a subdued, data-derived light and shade, not an invented height.
        const elevation=w.elev[i];
        if(elevation!==null){
          const left=col>0&&w.owner[i-1]>=0?w.elev[i-1]:null, right=col+1<cols&&w.owner[i+1]>=0?w.elev[i+1]:null;
          const slope=left!==null&&right!==null?clamp((left-right)/1100,-1,1):0;
          const high=clamp(elevation/3000,0,1);
          if(slope||high){ctx.fillStyle=slope>0?`rgba(245,239,204,${(.08*slope).toFixed(3)})`:`rgba(26,37,32,${(.08* -slope+.08*high).toFixed(3)})`;hex(ctx,x,y,R+.2);ctx.fill()}
        }
        cells.push([i,x,y]);
      }
      if(R>4&&o>=0){ctx.strokeStyle='rgba(34,51,40,.12)';ctx.lineWidth=.5;hex(ctx,x,y,R);ctx.stroke()}
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
      ctx.strokeStyle='rgba(53,70,48,.42)';ctx.lineWidth=Math.max(.7,R*.06);ctx.beginPath();ctx.moveTo(x-R*.55,y+R*.24);ctx.quadraticCurveTo(x-R*.24,y-R*.18,x,y+R*.10);ctx.quadraticCurveTo(x+R*.27,y-R*.10,x+R*.55,y+R*.24);ctx.stroke();
    }
  }
}
