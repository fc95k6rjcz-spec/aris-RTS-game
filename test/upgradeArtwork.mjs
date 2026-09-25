import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
 const p=await browser.newPage({viewport:{width:1440,height:950}}), errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.setContent(readFileSync('dist/index.html','utf8'));
 await p.waitForFunction(()=>window.game);
 await p.evaluate(()=>{const g=window.game;Object.assign(g.settingsForTest,{voices:false,crowning:false,stockade:false,wildlife:false});g.start('none');g.tick=()=>{};g.issue=c=>g.world.applyCommand(c);const w=g.world;w.fogEnabled=false;for(const e of [...w.entities.values()])w.removeEntity(e.id);for(let y=0;y<w.map.height;y++)for(let x=0;x<w.map.width;x++)w.map.set(x,y,0);w.players.get(1).gold=100000;w.players.get(1).lumber=100000;g.cam.zoom=40;g.cam.centerOn(22*64,20*64);});
 const defs=['townhall','farm','lumbermill','barracks','shipyard','church','tower','torch','airfactory','foundry','oilrig','refinery','stables','magetower','gryphonaviary','golddepot','shelter','wall'];
 for(const def of defs){
  await p.evaluate(def=>{const g=window.game,w=g.world;for(const b of w.buildings())w.removeEntity(b.id);const b=w.placeBuilding(1,def,20,19,true);g.selected=new Set([b.id]);g.tab='build';},def);
  await p.waitForTimeout(160);
  const tile=p.locator('.rv-tile.upgrade'); await tile.waitFor();
  assert(await tile.evaluate(e=>e.style.backgroundImage.startsWith('url(')),def+' missing art');
  if(def==='torch') await p.screenshot({path:'test/artifacts/torch-upgrade-art.png'});
  if(def==='barracks') {
   await p.screenshot({path:'test/artifacts/barracks-upgrade-art.png'});
   await tile.click();await p.getByText('Cancel Upgrade',{exact:true}).waitFor();
   assert(await tile.evaluate(e=>e.classList.contains('art')));
   await tile.click();await p.getByText('Upgrade to Level 2',{exact:true}).waitFor();
   await p.evaluate(()=>{window.game.world.buildings()[0].level=10;});
   await p.getByText('Maximum Level',{exact:true}).waitFor();
   assert(await tile.evaluate(e=>e.classList.contains('art')&&e.classList.contains('off')));
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS: artwork on all 18 building upgrade/status cards; upgrade, cancellation and maximum-level states.');
} finally { await browser.close(); }
