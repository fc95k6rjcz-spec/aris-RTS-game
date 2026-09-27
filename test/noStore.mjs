// A worker told to gather with nowhere to take it refuses and says so.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {World,Faction,NO_STORE_LINE}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const w=new World(64,64,3,'plains',1,false);w.addPlayer(1,Faction.Human,'#38f');w.fogEnabled=false;
for(let y=0;y<64;y++)for(let x=0;x<64;x++)w.map.set(x,y,0);
w.map.set(20,20,3);w.map.amount[w.map.idx(20,20)]=100;
const u=w.spawnUnit(1,'worker',{x:18*64,y:20*64});
w.step([{type:'gather',player:1,units:[u.id],tx:20,ty:20}]);
assert.equal(u.task.kind,'idle');assert(w.events.some(e=>e.text===NO_STORE_LINE));
w.placeBuilding(1,'townhall',10,10,true);
w.step([{type:'gather',player:1,units:[u.id],tx:20,ty:20}]);
assert.equal(u.task.kind,'gather');
console.log('PASS: no store -> refuses with "'+NO_STORE_LINE+'"; with a hall -> gathers');
