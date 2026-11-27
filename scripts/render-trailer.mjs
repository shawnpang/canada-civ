// Local-only trailer renderer. Uses the installed Chrome and its DevTools protocol; no npm dependencies.
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve('web');
const out = process.env.TRAILER_OUT || '/workspace/demo-video';
await mkdir(path.join(out, 'review'), {recursive:true});
const mime = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg'};
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && url.pathname.startsWith('/__trailer__/')) {
      const name = path.basename(url.pathname);
      if (!/^(trailer\.mp4|trailer_audio\.wav|frame_\d+\.jpg)$/.test(name)) throw Error('invalid name');
      const parts=[]; for await (const p of req) parts.push(p);
      await writeFile(path.join(out,name), Buffer.concat(parts));
      res.writeHead(200, {'Content-Type':'text/plain'}).end('ok'); return;
    }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) throw Error('invalid path');
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});
    createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const profile=await mkdtemp(path.join(tmpdir(),'canada-trailer-chrome-'));
const chrome=spawn('/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--hide-scrollbars','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--window-size=1920,1080',`http://127.0.0.1:${port}/dev/trailer.html?save=1`],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
try {
  let debugPort;
  for(let i=0;i<150;i++){try{debugPort=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await sleep(200)}}
  if(!debugPort) throw Error('Chrome did not start');
  let target;
  for(let i=0;i<150;i++){const list=await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json(); target=list.find(x=>x.type==='page' && x.url.includes('/dev/trailer.html')); if(target)break; await sleep(200)}
  if(!target) throw Error('Chrome page missing');
  ws=new WebSocket(target.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  let next=0; const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id && pending.has(m.id)){const [resolve,reject]=pending.get(m.id);pending.delete(m.id);m.error?reject(Error(m.error.message)):resolve(m.result)}};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,[resolve,reject]);ws.send(JSON.stringify({id,method,params}))});
  const evaluate=async expression=>{const v=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(v.exceptionDetails) throw Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text);return v.result.value};
  await call('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  for(let i=0;i<300;i++){const state=await evaluate('window.__trailer?.state');if(state?.phase==='error')throw Error(state.error);if(state?.phase==='ready')break;await sleep(200)}
  const test=await evaluate('window.__trailer.selfTest()'); if(!test.ok)throw Error(JSON.stringify(test)); console.log(`Muxer self-test: ${test.checks} checks passed`);
  const facts=await evaluate('window.__trailer.facts'); await writeFile(path.join(out,'trailer-facts.json'),JSON.stringify(facts,null,2));
  const frames=[[0,'00-opening'],[1,'01-title'],[3.5,'02-rockies'],[5,'02-rockies-late'],[7,'03-toronto'],[9,'03-toronto-late'],[11,'04-income'],[13,'04-density'],[15,'04-election-lens'],[17,'05-improvements'],[19,'05-improvements-late'],[22,'06-city'],[24,'06-city-late'],[26,'07-election'],[28,'08-end'],[29,'08-end-late']];
  for(const [seconds,name] of frames){
    const png=await evaluate(`window.__trailer.preview(${Math.round(seconds*30)}); document.querySelector('#preview').toDataURL('image/png').split(',')[1]`);
    await writeFile(path.join(out,'review',`${name}.png`),Buffer.from(png,'base64')); console.log(`Preview ${seconds}s`);
  }
  await writeFile(path.join(out,'canada-civ-trailer-poster.png'),await readFile(path.join(out,'review','01-title.png')));
  if(process.argv.includes('--preview-only')) process.exitCode=0;
  else {
    const aac = await evaluate(`AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:2,bitrate:192000}).then(x => x.supported).catch(() => false)`);
    if (!aac) {
      console.log('Chrome AAC encoder unavailable; synthesising WAV for FFmpeg AAC.');
      const stats = await evaluate('window.__trailer.audio({save:true})');
      console.log('Score:', JSON.stringify(stats));
    }
    await evaluate(`window.__trailer.render({save:true,sound:${aac}}); true`);
    let last=-1;
    while(true){const state=await evaluate('window.__trailer.state');if(state.phase==='error')throw Error(state.error);if(state.phase==='done'){console.log('Render complete',JSON.stringify(state));break;}if(state.frame!==last){last=state.frame; console.log(`Rendering ${state.frame || 0}/900`)}await sleep(5000)}
    execFileSync('ffmpeg',['-y','-loglevel','error','-i',path.join(out,'trailer.mp4'),...(aac ? [] : ['-i',path.join(out,'trailer_audio.wav')]),'-c:v','libx264','-preset','medium','-b:v','5600k','-vf','scale=in_range=full:out_range=tv,format=yuv420p','-color_range','tv','-r','30','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-movflags','+faststart',path.join(out,'canada-civ-trailer.mp4')],{stdio:'inherit'});
    console.log('Final:',path.join(out,'canada-civ-trailer.mp4'));
  }
} finally { if(ws)ws.close(); chrome.kill('SIGTERM'); await new Promise(r=>chrome.once('exit',r)); server.close(); await rm(profile,{recursive:true,force:true}); }
