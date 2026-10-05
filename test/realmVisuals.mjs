import {chromium} from 'playwright';import {readFileSync,mkdirSync} from 'node:fs';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROME});
try{const p=await browser.newPage({viewport:{width:1440,height:950}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setContent(readFileSync('dist/index.html','utf8'));await p.waitForFunction(()=>window.game&&window.rts);
await p.evaluate(()=>{const g=window.game;g.settingsForTest.voices=false;g.settingsForTest.crowning=false;g.settingsForTest.wildlife=false;g.settingsForTest.stockade=false;g.settingsForTest.edgeScroll=false;g.start('none');g.tick=()=>{};const w=g.world;w.fogEnabled=false;w.tick=1200;for(const e of [...w.entities.values()])w.removeEntity(e.id);for(let y=0;y<w.map.height;y++)for(let x=0;x<w.map.width;x++)w.map.set(x,y,0);
const k=w.spawnUnit(1,'king',{x:20*64,y:20*64});g.selected=new Set([k.id]);
w.placeBuilding(1,'torch',18,19,true);w.placeBuilding(1,'shelter',22,18,true);w.placeBuilding(1,'tower',27,17,true);for(let i=0;i<5;i++)w.placeBuilding(1,'wall',26+i,22,true);
for(let i=0;i<3;i++){const b=w.placeBuilding(1,'farm',12+i*6,11,false);b.progress=window.rts.BUILDINGS.farm.buildTime*[.25,.55,.85][i];b.builders=1;}
const b=w.placeBuilding(1,'townhall',12,20,false);b.progress=window.rts.BUILDINGS.townhall.buildTime*.45;b.builders=1;
for(let i=0;i<3;i++)w.spawnUnit(1,'footman',{x:(20+i)*64,y:22*64});w.applyCommand({type:'battleRally',player:1,units:[k.id]});g.cam.zoom=32;g.cam.centerOn(21*64,18*64);g.tab='build';});
await p.waitForTimeout(1600);mkdirSync('test/artifacts',{recursive:true});await p.screenshot({path:'test/artifacts/realm-life-preview.png'});
await p.evaluate(()=>{const g=window.game;g.buildMode='farm';g.mouse={x:720,y:300,inside:true};const a=g.cam.toWorld(720,300);const tx=Math.floor(a.x/64-.5),ty=Math.floor(a.y/64-.5);g.world.map.set(tx,ty,2);});await p.waitForTimeout(200);await p.screenshot({path:'test/artifacts/red-placement.png'});
await p.evaluate(()=>{const g=window.game;g.buildMode=null;g.settingsForTest.crowning=true;g.settingsForTest.stockade=true;g.start('none');g.tick=()=>{};g.world.fogEnabled=false;g.world.tick=1200;const r=g.world.relics[0];g.cam.centerOn((r.x+.5)*64,(r.y+.5)*64);});
for(const zoom of [40,24,19,16,40]){await p.evaluate(z=>{const g=window.game;g.cam.zoom=z;const r=g.world.relics[0];g.cam.centerOn((r.x+.5)*64,(r.y+.5)*64);},zoom);await p.waitForTimeout(700);await p.screenshot({path:`test/artifacts/zoom-${zoom}.png`});}
assert.deepEqual(errors,[]);console.log('PASS: construction, campfire, shelter, king rally, invalid placement and zoom screenshots; no browser errors');
}finally{await browser.close();}

