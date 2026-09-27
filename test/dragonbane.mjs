// A Dragonbane on a tower: dragons avoid the town it covers, and one that
// strays into reach is driven off before it can burn anything.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {World,Faction,WILD}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const w=new World(64,64,4,'plains',1,false);w.addPlayer(1,Faction.Human,'b');w.addPlayer(WILD,Faction.Human,'#863');w.fogEnabled=false;w.hordeEnabled=false;
for(let y=0;y<64;y++)for(let x=0;x<64;x++)w.map.set(x,y,0);
const hall=w.placeBuilding(1,'townhall',20,20,true);const tower=w.placeBuilding(1,'tower',25,20,true);
const p=w.players.get(1);p.gold=5000;p.lumber=5000;
w.step([{type:'dragonbane',player:1,building:tower.id}]);assert(tower.dragonbane);
const d=w.spawnUnit(WILD,'dragon',{x:55*64,y:55*64});w.lairs.set(d.id,{x:55*64,y:55*64});
d.dragon={phase:'raid',target:1,over:{x:22*64,y:22*64},until:w.tick+20*120};
const ev=[];for(let t=0;t<20*90;t++){w.step([]);for(const e of w.events)ev.push(e.text);}
console.log('phase',d.dragon.phase,'hall',hall.hp,'/',hall.maxHp,ev.filter(e=>/Dragonbane/.test(e)));
assert(d.dragon.phase!=='raid','driven off');assert.equal(hall.hp,hall.maxHp,'nothing burned');
console.log('PASS: Dragonbane drives the dragon off');
