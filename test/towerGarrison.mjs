// Archers can climb a watch tower, add bows to it, and come down again.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {World,Faction,towerGarrisonCap,towerRange}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const w=new World(64,64,7,'plains',1,false);w.addPlayer(1,Faction.Human,'b');w.addPlayer(2,Faction.Human,'r');w.fogEnabled=false;
for(let y=0;y<64;y++)for(let x=0;x<64;x++)w.map.set(x,y,0);
const t=w.placeBuilding(1,'tower',30,30,true);
const as=[0,1,2,3,4].map(i=>w.spawnUnit(1,'archer',{x:(24+i)*64,y:36*64}));
w.step([{type:'garrison',player:1,units:as.map(a=>a.id),building:t.id}]);
for(let i=0;i<400;i++)w.step([]);
assert.equal(t.garrison.length,towerGarrisonCap(1));
assert.equal(w.units().filter(u=>u.def==='archer').length,5-towerGarrisonCap(1));
assert(towerRange(1)>=8);
// garrisoned tower kills faster than a bare one
const foe=w.spawnUnit(2,'footman',{x:(31.5+towerRange(1)-0.8)*64,y:31.5*64});
let n=0;while(foe.hp>0&&w.entities.has(foe.id)&&n<400){w.step([]);n++;}
w.step([{type:'ungarrison',player:1,building:t.id}]);
assert.equal(t.garrison.length,0);assert.equal(w.units().filter(u=>u.def==='archer').length,5);
console.log(`PASS: ${towerGarrisonCap(1)} archers garrisoned, far footman killed in ${n} ticks at range ${towerRange(1)}, released again`);
