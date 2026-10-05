import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{const p=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setContent(readFileSync('dist/index.html','utf8'));await p.waitForFunction(()=>window.game);
await p.evaluate(()=>{const g=window.game;Object.assign(g.settingsForTest,{voices:false,crowning:false,stockade:false,wildlife:false});g.start('none');g.tick=()=>{};const w=g.world;w.fogEnabled=false;for(const e of [...w.entities.values()])w.removeEntity(e.id);for(let y=0;y<w.map.height;y++)for(let x=0;x<w.map.width;x++)w.map.set(x,y,0);for(let x=18;x<27;x+=3){w.map.set(x,20,3);w.map.amount[w.map.idx(x,20)]=40;}for(const [x,y] of [[18.5,19.7],[21.5,21.5],[24.5,19.7]]){const u=w.spawnUnit(1,'worker',{x:x*64,y:y*64});u.facing=4;g.selected.add(u.id);}g.cam.zoom=65;g.cam.centerOn(22*64,20.5*64);});await p.waitForTimeout(1500);await p.screenshot({path:'test/artifacts/forest-depth.png'});assert.deepEqual(errors,[]);console.log('PASS: forest depth rendering and relaxed worker poses without browser errors');}finally{await browser.close();}

