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
{ // archers on the wall walk from tier 5
  const w2=new World(64,64,3,'plains',1,false);w2.addPlayer(1,'human','#36c');w2.addPlayer(2,'human','#c33');w2.fogEnabled=false;for(let y=0;y<64;y++)for(let x=0;x<64;x++)w2.map.set(x,y,0);
  const h=w2.placeBuilding(1,'townhall',30,30,true);h.level=10;const P=w2.players.get(1);P.gold=1e7;P.lumber=1e7;
  const wall=w2.placeBuilding(1,'wall',20,20,true);const a=w2.spawnUnit(1,'archer',{x:20.5*64,y:21.6*64});
  w2.step([{type:'garrison',player:1,units:[a.id],building:wall.id}]);for(let i=0;i<40;i++)w2.step([]);
  assert(!(wall.garrison?.length),'no wall walk below tier 5');
  for(let i=0;i<4;i++)w2.step([{type:'upgradeWalls',player:1}]);assert.equal(w2.wallLevel(1),5);
  w2.step([{type:'garrison',player:1,units:[a.id],building:wall.id}]);for(let i=0;i<60&&!wall.garrison?.length;i++)w2.step([]);
  assert.equal(wall.garrison?.length,1,'archer up on the wall');
  const foe=w2.spawnUnit(2,'footman',{x:20.5*64,y:26*64});const hp=foe.hp;for(let i=0;i<60;i++)w2.step([]);
  assert(foe.hp<hp||!w2.entities.has(foe.id),'he shoots from the wall');
  console.log('PASS: archers man the wall walk from the Rampart on');
}
