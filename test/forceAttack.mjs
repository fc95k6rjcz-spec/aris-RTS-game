// Ordered to (Ctrl + right-click, or Attack then click), your soldiers will
// knock down your own buildings; left alone they never touch them.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {World}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const w=new World(64,64,3,'plains',1,false);w.addPlayer(1,'human','#36c');
const farm=w.placeBuilding(1,'farm',20,20,true);const f=w.spawnUnit(1,'footman',{x:18*64,y:21*64});
const hp=farm.hp;w.step([{type:'attack',player:1,units:[f.id],target:farm.id}]);for(let i=0;i<100;i++)w.step([]);
assert.equal(farm.hp,hp,'a plain attack order on your own does nothing');
w.step([{type:'attack',player:1,units:[f.id],target:farm.id,force:true}]);for(let i=0;i<20*120&&w.entities.has(farm.id);i++)w.step([]);
assert(!w.entities.has(farm.id),'forced: the farm comes down');
console.log('PASS: you can knock down your own buildings when you mean to');
