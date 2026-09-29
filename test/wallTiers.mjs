// Ten tiers of wall; each upgrade doubles every wall and gate you own, and
// new walls are built at the current tier. The walls can't outgrow the hall.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {World}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const w=new World(64,64,3,'plains',1,false);w.addPlayer(1,'human','#36c');const p=w.players.get(1);p.gold=1e6;p.lumber=1e6;
const hall=w.placeBuilding(1,'townhall',20,20,true);const wall=w.placeBuilding(1,'wall',10,10,true);const base=wall.maxHp;
w.step([{type:'upgradeWalls',player:1}]);assert.equal(w.wallLevel(1),1,'blocked by a level 1 hall');
hall.level=3;w.step([{type:'upgradeWalls',player:1}]);assert.equal(w.wallLevel(1),2);assert.equal(wall.maxHp,base*2);
wall.hp=wall.maxHp/2;w.step([{type:'upgradeWalls',player:1}]);assert.equal(w.wallLevel(1),3);assert.equal(wall.maxHp,base*4);assert.equal(wall.hp,base*2,'keeps its damage share');
const fresh=w.placeBuilding(1,'wall',12,10,true);assert.equal(fresh.maxHp,base*4,'new walls at the current tier');
console.log('PASS: wall tiers double every wall, carry to new walls, wait on the hall');
