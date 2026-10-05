import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundled=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {World,Faction}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
function setup(){const w=new World(64,64,123,'plains',1,false);w.addPlayer(1,Faction.Human,'#38f');w.fogEnabled=false;for(let y=0;y<64;y++)for(let x=0;x<64;x++)w.map.set(x,y,0);const k=w.spawnUnit(1,'king',{x:20.5*64,y:24.5*64});const b=w.placeBuilding(1,'townhall',20,20,false);k.task={kind:'build',building:b.id};return {w,k,b};}
function run(){const {w,k,b}=setup();const stops=new Set();let walking=0,working=0,maxStep=0;for(let i=0;i<3000&&!b.complete;i++){const p={...k.pos},before=b.progress;w.step([]);const distance=Math.hypot(k.pos.x-p.x,k.pos.y-p.y);maxStep=Math.max(maxStep,distance);if(distance>0)walking++;if(b.progress>before){working++;stops.add(Math.floor(k.pos.x/64)+','+Math.floor(k.pos.y/64));assert.equal(distance,0,'hammering happens at a work spot');}assert(w.map.isWalkable(Math.floor(k.pos.x/64),Math.floor(k.pos.y/64),'land'),'builder stays outside the footprint');}assert(b.complete);assert(stops.size>=3);assert(walking>20&&working>100);assert(maxStep<16,'no teleporting between work spots');return {stops:[...stops],walking,working,maxStep,checksum:w.checksum()};}
const a=run(),b=run();assert.deepEqual(a,b,'movement remains deterministic');
const blocked=setup();for(let y=19;y<=24;y++)for(let x=19;x<=24;x++)if(!(x===20&&y===24)&&!(x>=20&&x<24&&y>=20&&y<24))blocked.w.map.set(x,y,2);for(let i=0;i<3000&&!blocked.b.complete;i++)blocked.w.step([]);assert(blocked.b.complete,'a single accessible work spot cannot stall construction');
console.log('PASS: builders walk, face work, pause, complete blocked sites and remain deterministic',a);

