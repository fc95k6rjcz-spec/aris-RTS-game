import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const result=await build({stdin:{contents:"export {World} from './src/sim/world'; export {LEVELLED} from './src/data/levels'; export {BUILDINGS} from './src/data/buildings';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {World,LEVELLED,BUILDINGS}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const w=new World(160,160,71,'lakeland');w.addPlayer(1,'human','#bd3030');const p=w.players.get(1);p.gold=p.lumber=p.oil=1e9;
for(let y=2;y<150;y++)for(let x=2;x<150;x++){w.map.set(x,y,0);w.map.occupant[w.map.idx(x,y)]=0;}
const buildings=[];for(const [i,id] of Object.keys(BUILDINGS).entries()){const b=w.placeBuilding(1,id,5+(i%5)*20,5+Math.floor(i/5)*20,true);assert.ok(b,id+' placement');buildings.push(b);}
const hall=buildings.find(b=>b.def==='townhall');hall.level=10;
for(const b of buildings){
 const seen=new Set();if(b.def!=='wall'&&b.def!=='gate')assert.equal(LEVELLED[b.def].length,10,b.def+' tier table');
 for(let level=1;level<=10;level++){
   const path=`src/assets/blue-banner-tiers/${b.def}/level-${level}.webp`;assert.ok(existsSync(path),path);seen.add(createHash('sha256').update(readFileSync(path)).digest('hex'));
   if(level===1||b.def==="wall"||b.def==="gate")continue;
   b.level=level-1;b.upgrade=null;b.hp=b.maxHp;
   const before=p.gold;w.applyCommand({type:'upgrade',player:1,building:b.id});
   assert.ok(b.upgrade,b.def+' upgrade '+level);assert.equal(b.upgrade.toLevel,level);assert.equal(before-p.gold,LEVELLED[b.def][level-1].cost.gold);assert.ok(b.upgrade.total>0);
   b.upgrade.remaining=1;w.stepBuilding(b);assert.equal(b.level,level);assert.equal(b.maxHp,LEVELLED[b.def][level-1].hp);assert.equal(b.upgrade,null);
 }
 assert.equal(seen.size,10,b.def+' must have 10 distinct pictures');
 if(b.def!=='wall'&&b.def!=='gate'){const before=p.gold;w.applyCommand({type:'upgrade',player:1,building:b.id});assert.equal(b.upgrade,null);assert.equal(p.gold,before);}
}
const wall=buildings.find(b=>b.def==='wall'),gate=buildings.find(b=>b.def==='gate');
for(let level=2;level<=10;level++){w.applyCommand({type:'upgradeWalls',player:1});assert.equal(w.wallLevel(1),level);assert.equal(wall.level,level);assert.equal(gate.level,level);}
console.log('PASS: 190 unique pictures, 153 timed building upgrades, nine shared wall/gate upgrades and level-10 caps.');
