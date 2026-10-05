// Up to ten can wait in a building's line; those the purse can't cover yet are
// paid for, in order, as the gold comes in -- and cost nothing if cancelled.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {World}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const w=new World(64,64,3,'plains',1,false);w.addPlayer(1,'human','#36c');
const hall=w.placeBuilding(1,'townhall',20,20,true);const p=w.players.get(1);
p.gold=200;p.lumber=0;p.food=400;
for(let i=0;i<12;i++)w.step([{type:'train',player:1,building:hall.id,unit:'worker'}]);
assert.equal(hall.queue.length,10,'ten in line, no more');
const paid=hall.queue.filter(j=>j.paid!==false).length;assert(paid>=1&&paid<10,'some paid, the rest waiting: '+paid);
const goldAfter=p.gold;w.step([{type:'cancelTrain',player:1,building:hall.id,index:9}]);assert.equal(p.gold,goldAfter,'cancelling an unpaid order refunds nothing');
p.gold=100000;for(let i=0;i<20*400&&hall.queue.length;i++){w.step([]);w.players.get(1).food=400;}
assert.equal(hall.queue.length,0,'the whole line trained once the gold came in');
console.log('PASS: a line of ten, paid for as the gold comes in');
