// Adapted from usaciv's MIT trailer storyboard. All displayed measurements are read from the payloads.
import { titleCard, endCard, caption, chip, lensLegend, cityPanel, pulseRing, vignette, darken, win, smooth, lerp, clamp01 } from './overlays.js';
export const CONFIG = { title: 'CANADA', subtitle: 'as a strategy game — built from real public data', url: 'shawnpang.xyz/canada-civ' };
export const FPS = 30, W = 1920, H = 1080;
const FADE = .45;
const money = v => v >= 1e12 ? `$${(v/1e12).toFixed(2)} trillion` : v >= 1e9 ? `$${(v/1e9).toFixed(1)} billion` : `$${(v/1e6).toFixed(0)} million`;
const moneyShort = v => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : `$${(v/1e6).toFixed(0)}M`;
const people = v => v >= 1e6 ? `${(v/1e6).toFixed(1)} million` : `${Math.round(v/1000)}K`;
const integer = v => Math.round(v).toLocaleString('en-CA');
function camAt(a,b,k) { return { x:lerp(a.x,b.x,k), y:lerp(a.y,b.y,k), rpx:Math.exp(lerp(Math.log(a.rpx),Math.log(b.rpx),k)) }; }
function camZoom(a,b,k) { const rpx=Math.exp(lerp(Math.log(a.rpx),Math.log(b.rpx),k)); const d=1/b.rpx-1/a.rpx; const u=Math.abs(d)<1e-9?k:(1/rpx-1/a.rpx)/d; return {x:lerp(a.x,b.x,u),y:lerp(a.y,b.y,u),rpx}; }
const glide = k => .35*clamp01(k)+.65*smooth(k);
const easeOutQ = k => 1-(1-clamp01(k)**1.15)**3;

/** Facts are serialisable for an accompanying provenance report. */
export function gatherFacts(stage) {
  const d=stage.data, world=stage.w || stage.world, R=stage.R;
  const {cols,rows}=world.grid; let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
    if(world.owner[row*cols+col]<0) continue;
    const x=R*Math.sqrt(3)*(col+.5*(row&1)), y=R*1.5*row;
    x0=Math.min(x0,x); x1=Math.max(x1,x); y0=Math.min(y0,y); y1=Math.max(y1,y);
  }
  const land={x0,y0,x1,y1,cx:(x0+x1)/2,cy:(y0+y1)/2};
  const homeRpx=Math.min(W*.94/(x1-x0+2*R),H*.90/(y1-y0+2*R))*R;
  const city=id=>d.cities.find(c=>c.id===id);
  const toronto=city('535'), vancouver=city('933');
  return {land,homeRpx,toronto,vancouver,lensCount:d.lenses.lenses.length,sourceCount:d.sources.length,
    disasterEvents:d.disasters.summary.mapped_distinct_event_ids,cropCells:d.resources.crops.cells.length,
    towns:d.towns.towns.length,ridings:Object.keys(d.election2025.ridings).length,
    vancouverDistricts:d.districts.cities['933'].districts,
    roads:d.infrastructure.roads.length,rail:d.infrastructure.rail.length};
}
export function buildStoryboard(stage,cfg=CONFIG) {
  const d=stage.data, F=gatherFacts(stage), {land,homeRpx,toronto:to,vancouver:van}=F;
  const populationYear=Math.max(...Object.keys(to.pop_series).map(Number));
  const censusYear=(d.districts.vintage.match(/\d{4}/)||[])[0];
  const infrastructureYear=(d.infrastructure.vintage.match(/\d{4}/)||[])[0];
  const electionDate=new Date(`${d.election2025.vintage}T00:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  const shots=[]; const shot=s=>shots.push(s); const wide={banners:false,resources:false,labels:false};
  const T_ROCK=3.1,T_NY=5.8,T_LENS=9.8,T_IMP=15.3,T_CITY=19.9,T_TRADE=24.6,T_END=27.4,T_OUT=30;
  shot({id:'title',t0:0,t1:T_ROCK+.2,render:t=>[{view:{...camAt({x:land.cx,y:land.cy,rpx:homeRpx*.98},{x:land.cx+40,y:land.cy-10,rpx:homeRpx*1.10},t/3.3),...wide}}],
    overlay(ctx,t){darken(ctx,W,H,.42);vignette(ctx,W,H,.85);titleCard(ctx,W,H,cfg,win(t,-.5,T_ROCK+.15,.9,.4),clamp01((t+.4)/1.6));}});
  const ROCK_T=T_NY-T_ROCK;
  shot({id:'rockies',t0:T_ROCK,t1:T_NY,trans:'dip',render:t=>[{view:camAt({x:1010,y:3290,rpx:30},{x:1130,y:3355,rpx:37},glide(t/(ROCK_T+.2)))}],
    overlay(ctx,t){caption(ctx,W,H,{kicker:'Terrain',title:'Every hex from real data',sub:'Elevation and land cover paint the map',source:'NRCan MRDEM-30 · NRCan 2020 Land Cover (NALCMS)'},win(t,.45,ROCK_T+.05,.45,.3),clamp01((t-.45)/.6));}});
  const NY_T=T_LENS-T_NY, nyEnd={x:to.x-110,y:to.y,rpx:52};
  const nyCam=t=>camAt({x:to.x-220,y:to.y-80,rpx:26},nyEnd,smooth(t/NY_T));
  shot({id:'cities',t0:T_NY,t1:T_LENS,trans:'punch',render:t=>[{view:nyCam(t)}],overlay(ctx,t,frame){
    const a=win(t,1.3,NY_T-.05,.5,.4),[x,y]=frame.toScreen(to.x,to.y);pulseRing(ctx,x,y,frame.cam.scale*stage.R*3.3,a,t);
    caption(ctx,W,H,{kicker:'Cities',title:to.name.en,sub:`${money(to.gdp)} GDP · ${people(to.population)} people`,source:`Statistics Canada GDP ${to.gdp_year} · July ${populationYear} population estimates`},a,clamp01((t-1.3)/.6));}});
  const lenses=['income','density','election2025'].map(id=>d.lenses.lenses.find(l=>l.id===id));
  const fmt=v=>Number.isInteger(v)?integer(v):String(v);
  const legend=l=>({name:l.name.en,unit:l.unit.en,ramp:l.ramp,categories:l.categories,lo:l.categories?'Liberal     Conservative     Bloc':l.format==='cad'?`$${integer(l.domain[0])}`:fmt(l.domain[0]),hi:l.categories?'NDP     Green':l.format==='cad'?`$${integer(l.domain[1])}`:fmt(l.domain[1])});
  const LENS_T=T_IMP-T_LENS,ZO=1,LD=(LENS_T-ZO)/lenses.length,LK=.4;
  const lensA={x:land.cx-150,y:land.cy+20,rpx:homeRpx*1.04},lensB={x:land.cx+150,y:land.cy,rpx:homeRpx*1.14};
  const lensCam=t=>t>=ZO?camAt(lensA,lensB,clamp01((t-ZO)/(LENS_T-ZO))):camZoom(nyEnd,lensA,smooth(t/ZO));
  const lensAt=t=>{const u=Math.max(0,t-ZO),i=Math.min(lenses.length-1,Math.floor(u/LD));return {i,k:i<lenses.length-1?smooth((u-(i+1)*LD+LK)/LK):0};};
  shot({id:'lenses',t0:T_LENS,t1:T_IMP,trans:'cut',cues:lenses.map((_,i)=>i===0?.1:ZO+i*LD-LK/2),render(t){const cam=lensCam(t);if(t<ZO)return [{view:cam},{view:{...cam,lens:lenses[0].id,...wide},alpha:smooth((t-.1)/(ZO-.2))}];const {i,k}=lensAt(t),out=[{view:{...cam,lens:lenses[i].id,...wide}}];if(k>0)out.push({view:{...cam,lens:lenses[i+1].id,...wide},alpha:k});return out;},
    overlay(ctx,t){vignette(ctx,W,H,.5*smooth(t/ZO));const {i,k}=lensAt(t),a=win(t,.55,LENS_T-.05,.4,.3),cur=lenses[k>.5?i+1:i];lensLegend(ctx,W,H,legend(lenses[i]),a,k>0?legend(lenses[i+1]):null,k);caption(ctx,W,H,{kicker:'Lenses',title:`${F.lensCount} lenses`,sub:'Colour the map by income, density, education, the election…',source:cur.id==='election2025'?`Elections Canada · ${electionDate}`:`Statistics Canada · ${censusYear} Census; division-level values`},a,clamp01((t-.55)/.6));}});
  const IMP_T=T_CITY-T_IMP,ZI=1;
  const stages=[
    {at:1.05,on:{roads:true,rail:true},chip:{label:'Roads & railways',sub:`Atlas of Canada · ${infrastructureYear}`}},
    {at:1.75,on:{},chip:{label:`${integer(F.disasterEvents)} recorded disaster events`,sub:'Canadian Disaster Database · mapped events'}},
    {at:2.45,on:{crops:true},chip:{label:`Crop symbols on ${integer(F.cropCells)} hexes`,sub:`Census of Agriculture ${d.resources.crops.vintage} · schematic`}},
    {at:3.15,on:{towns:true},chip:{label:`${integer(F.towns)} towns`,sub:`Statistics Canada · July ${populationYear} estimates`}}];
  const layersAt=n=>Object.assign({towns:false},...stages.slice(0,n).map(s=>s.on));
  const impA={x:van.x+15,y:van.y+10,rpx:43},impB={x:van.x+70,y:van.y+5,rpx:52};
  const impCam=t=>t>=ZI?camAt(impA,impB,glide((t-ZI)/(IMP_T-ZI+.35))):camZoom(lensB,impA,smooth(t/ZI));
  shot({id:'improvements',t0:T_IMP,t1:T_CITY,trans:'cut',cues:stages.map(s=>s.at+.1),render(t){const cam=impCam(t);if(t<ZI)return [{view:cam},{view:{...cam,lens:'election2025',...wide},alpha:1-smooth((t-.15)/.7)}];let n=0;while(n<stages.length&&t>=stages[n].at+.45)n++;const view=n=>({...cam,layers:layersAt(n),resources:n>=3});const out=[{view:view(n)}];if(n<stages.length&&t>stages[n].at)out.push({view:view(n+1),alpha:smooth((t-stages[n].at)/.45)});return out;},overlay(ctx,t){vignette(ctx,W,H,.5*(1-smooth(t/(ZI*.8))));let y=70;for(const s of stages){const a=win(t,s.at,IMP_T-.1,.4,.3);if(a>0)chip(ctx,80-(1-smooth((t-s.at)/.4))*40,y,s.chip,a,{size:.9});y+=86;}}});
  const typeById=new Map(d.districts.types.map(x=>[x.id,x]));
  const panel={name:van.name.en,full:van.full.en,badge:{label:typeById.get(d.districts.cities[van.id].badge).name.en},stats:[[people(van.population),'people'],[moneyShort(van.gdp),`GDP ${van.gdp_year}`],[`$${integer(van.median_income)}`,'median income']],districts:F.vancouverDistricts.map(x=>({name:typeById.get(x.type).name.en,line:`${x.lq.toFixed(2)}× the Canadian share of employed residents`})),source:`Statistics Canada · ${censusYear} Census districts and income · GDP ${van.gdp_year} · population July ${populationYear}`};
  const CITY_T=T_TRADE-T_CITY, cityA={x:van.x+150,y:van.y,rpx:45},cityB={x:van.x+125,y:van.y,rpx:51};
  shot({id:'city',t0:T_CITY,t1:T_TRADE,trans:'cut',cues:[.5,1.3],render(t){const cam=t<1.2?camAt(impCam(IMP_T),cityA,smooth(t/1.2)):camAt(cityA,cityB,glide((t-1.2)/(CITY_T-1.2)));return [{view:{...cam,city:van.id,cityAnimMs:Math.max(0,t-.5)*1000,labels:false}}];},overlay(ctx,t){cityPanel(ctx,W,H,panel,win(t,1.3,CITY_T+.3,.3,.4),clamp01((t-1.3)/.7),t-.8);}});
  const TRADE_T=T_END-T_TRADE,tradeA={x:to.x-40,y:to.y-40,rpx:36},endB={x:land.cx+10,y:land.cy+5,rpx:homeRpx*.98};
  const tradeCam=t=>{const k=easeOutQ(t/(T_OUT-T_TRADE)),a=camZoom(tradeA,endB,k),b=camAt(tradeA,endB,k);return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,rpx:a.rpx};};
  shot({id:'trade',t0:T_TRADE,t1:T_END,trans:'punch',render:t=>[{view:{...tradeCam(t),lens:'election2025',...wide}}],overlay(ctx,t){caption(ctx,W,H,{kicker:'Election',title:`${integer(F.ridings)} federal ridings`,sub:'Elected candidates’ parties, assigned to hexes',source:`Elections Canada · General Election · ${electionDate}`},win(t,.45,TRADE_T-.05,.45,.3),clamp01((t-.45)/.6));}});
  shot({id:'end',t0:T_END,t1:T_OUT,trans:'cut',render:t=>[{view:{...tradeCam(TRADE_T+t),...wide}},{view:{...tradeCam(TRADE_T+t),lens:'election2025',...wide},alpha:1-.8*smooth(t/.9)}],overlay(ctx,t){darken(ctx,W,H,.55*smooth(t/.5));vignette(ctx,W,H,.9*smooth(t/.5));endCard(ctx,W,H,cfg,{facts:`${F.sourceCount} public data sources · every number traceable`},smooth((t-.1)/.5),clamp01((t-.15)/.6));}});
  return {shots,duration:T_OUT,fps:FPS,frames:T_OUT*FPS,fade:FADE,cfg,facts:F,panel};
}
const DIP=.6,PUNCH=.4;
export const fadeOf=(sb,s)=>s.fade??({dip:DIP,punch:PUNCH,cut:0}[s.trans]??sb.fade);
export function activeShots(sb,T){const out=[];sb.shots.forEach((s,i)=>{const next=sb.shots[i+1],end=next?Math.max(s.t1,next.t0+fadeOf(sb,next)):s.t1;if(T<s.t0||T>=end)return;const f=fadeOf(sb,s),alpha=i===0||f<=0?1:clamp01((T-s.t0)/f);out.push({shot:s,alpha:s.trans?alpha:smooth(alpha),sec:T-s.t0});});let k=out.length-1;while(k>0&&out[k].alpha<1)k--;return out.slice(k);}
