import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {const page=await browser.newPage({viewport:{width:1440,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent(readFileSync('dist/index.html','utf8'));await page.waitForFunction(()=>window.game&&window.rts);
await page.evaluate(()=>{const g=window.game;Object.assign(g.settingsForTest,{voices:false,crowning:false,stockade:false,wildlife:false,edgeScroll:false});g.start('none');g.tick=()=>{};const w=g.world;w.fogEnabled=false;for(const e of [...w.entities.values()])w.removeEntity(e.id);for(let y=0;y<w.map.height;y++)for(let x=0;x<w.map.width;x++)w.map.set(x,y,0);const k=w.spawnUnit(1,'king',{x:20.5*64,y:24.5*64});const b=w.placeBuilding(1,'townhall',20,20,false);b.progress=220;k.task={kind:'build',building:b.id};w.placeBuilding(1,'torch',26,23,true);w.placeBuilding(1,'shelter',28,21,true);w.placeBuilding(1,'tower',31,18,true);for(let x=26;x<31;x++)w.placeBuilding(1,'wall',x,26,true);g.selected=new Set([k.id]);g.tab='build';g.cam.zoom=54;g.cam.centerOn(25*64,22*64);w.players.get(1).gold=2000;w.players.get(1).lumber=2000;});await page.waitForTimeout(1600);
await page.screenshot({path:'test/artifacts/building-work-before.png'});
const positions=[];for(let frame=0;frame<150;frame++){const pos=await page.evaluate(()=>{const w=window.game.world;w.step([]);const k=w.units().find(u=>u.def==='king');return {...k.pos};});positions.push(pos);await page.waitForTimeout(20);}assert(new Set(positions.map(p=>p.x+','+p.y)).size>=3, 'builder visibly changes position');await page.screenshot({path:'test/artifacts/building-work-after.png'});
await page.screenshot({path:'test/artifacts/camp-cards.png',clip:{x:880,y:760,width:310,height:155}});
assert.deepEqual(errors,[]);console.log('PASS: moving builder browser preview, painted cards, no browser errors');
}finally{await browser.close();}

