import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('dist-web');
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}const file=(await stat(path)).isDirectory()?resolve(path,'index.html'):path;const mime={'.html':'text/html','.js':'text/javascript','.webp':'image/webp','.png':'image/png','.css':'text/css','.json':'application/json'};res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const local='http://127.0.0.1:'+server.address().port;const base=process.env.GAME_URL??local;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/building-upgrades.html');await page.selectOption('#building','all');await page.evaluate(()=>{for(const im of document.images)im.loading='eager';});await page.waitForFunction(()=>document.images.length===190&&[...document.images].every(im=>im.complete&&im.naturalWidth>0));
 const sources=await page.evaluate(()=>[...document.images].map(im=>im.src));assert.equal(new Set(sources).size,190,'Each tier must have a different image URL');assert.equal(await page.locator('section').count(),19);
 for(const id of ['townhall','farm','barracks','church','foundry','airfactory','wall','gate','shelter']){await page.selectOption('#building',id);await page.waitForTimeout(100);await page.screenshot({path:`test/artifacts/royal-tiers-${id}.png`});}
 await page.goto(base+'/');await page.waitForFunction(()=>window.game);
 const state=await page.evaluate(()=>{const g=window.game;Object.assign(g.settingsForTest,{voices:false,crowning:false,stockade:false,wildlife:false});g.start('none');g.tick=()=>{};const w=g.world;w.fogEnabled=false;for(const e of [...w.entities.values()])w.removeEntity(e.id);for(let y=0;y<w.map.height;y++)for(let x=0;x<w.map.width;x++)w.map.set(x,y,0);const ids=['townhall','tower','farm','golddepot','lumbermill','barracks','shipyard','church','oilrig','refinery','stables','magetower','gryphonaviary','foundry','airfactory','torch','wall','gate','shelter'];let count=0;for(let i=0;i<ids.length;i++)for(let j=0;j<3;j++){const b=w.placeBuilding(1,ids[i],7+(i%4)*24+j*6,7+Math.floor(i/4)*12,true);if(b){b.level=[1,5,10][j];count++;}}g.cam.zoom=16;g.cam.centerOn(50*64,32*64);g.selected=new Set([w.buildings().find(b=>b.def==='tower'&&b.level===1).id]);return {count};});
 assert.equal(state.count,57);await page.waitForTimeout(2500);await page.screenshot({path:'test/artifacts/royal-buildings-in-game.png'});
 await page.evaluate(()=>{const g=window.game;const b=g.world.buildings().find(b=>b.def==='tower'&&b.level===1);b.upgrade={toLevel:2,total:100,remaining:50};});await page.waitForTimeout(250);await page.screenshot({path:'test/artifacts/royal-upgrade-in-progress.png'});
 assert.deepEqual(errors,[]);console.log('PASS: 190 distinct gallery sprites, 19 building types at levels 1/5/10, selection and upgrade rendering; no page errors.');
}finally{await browser.close();await new Promise(done=>server.close(done));}
