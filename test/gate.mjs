// A gate lets its own side through a wall and nobody else; raiders hack at it.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {World,Faction,WILD}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const w=new World(64,64,3,'plains',1,false);w.addPlayer(1,Faction.Human,'b');w.addPlayer(2,Faction.Human,'r');w.fogEnabled=false;
for(let y=0;y<64;y++)for(let x=0;x<64;x++)w.map.set(x,y,0);
w.placeBuilding(1,'townhall',4,4,true);
// A wall right across the map at x=30, with one gate at y=32.
for(let y=0;y<64;y++){const b=w.placeBuilding(1,'wall',30,y,true);}
const p=w.players.get(1);p.gold=1000;p.lumber=1000;
const worker=w.spawnUnit(1,'worker',{x:25*64,y:32*64});
w.step([{type:'build',player:1,units:[worker.id],building:'gate',tx:30,ty:32}]);
for(let i=0;i<600;i++)w.step([]);
const gate=w.buildings().find(b=>b.def==='gate');assert(gate&&gate.complete,'gate built on the wall');
const mine=w.spawnUnit(1,'footman',{x:25*64,y:20*64});const foe=w.spawnUnit(2,'footman',{x:25*64,y:44*64});
w.step([{type:'move',player:1,units:[mine.id],x:40*64,y:20*64},{type:'move',player:2,units:[foe.id],x:40*64,y:44*64}]);
for(let i=0;i<1200;i++)w.step([]);
console.log('own footman x',(mine.pos.x/64).toFixed(1),' enemy footman x',(foe.pos.x/64).toFixed(1));
assert(mine.pos.x/64>31,'own unit passed through its gate');assert(foe.pos.x/64<30,'enemy held by the wall');
assert(BigInt(1)&&w.map.gateOwner[w.map.idx(30,32)]===1);
console.log('PASS: gates open for their own side only; walls cheap',JSON.stringify((await import('data:text/javascript;base64,'+Buffer.from((await build({entryPoints:['src/data/buildings.ts'],bundle:true,write:false,platform:'node',format:'esm'})).outputFiles[0].text).toString('base64'))).BUILDINGS.wall.cost));
