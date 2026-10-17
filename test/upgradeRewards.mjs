// Upgrades must be felt: a levelled Barracks trains stronger soldiers, faster,
// and towers reach visibly further with every level.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result=await build({stdin:{contents:"export {World,Faction,towerRange,rankMultiplier,levelGains,researchGains} from './src/sim/world';export {UNITS} from './src/data/units';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {World,Faction,towerRange,rankMultiplier,levelGains,researchGains,UNITS}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));

function trainFootman(level){
  const w=new World(48,48,7,'plains',1,false);for(let y=0;y<48;y++)for(let x=0;x<48;x++)w.map.set(x,y,0);w.allowed=true;w.addPlayer(1,Faction.Human,'blue');
  const p=w.players.get(1);p.gold=99999;p.lumber=99999;p.food=999;
  w.placeBuilding(1,'townhall',4,4,true);w.placeBuilding(1,'farm',12,4,true);
  const b=w.placeBuilding(1,'barracks',20,20,true);b.level=level;
  w.applyCommand({type:'train',player:1,building:b.id,unit:'footman'});
  let ticks=0;
  while(!w.units().some(u=>u.def==='footman')&&ticks<20*200){w.step([]);ticks++;}
  return {w,u:w.units().find(u=>u.def==='footman'),ticks};
}
const one=trainFootman(1),five=trainFootman(5);
assert(one.u&&five.u,'both barracks train a footman');
assert.equal(five.u.rank,5);
assert.equal(five.u.maxHp,Math.round(UNITS.footman.hp*rankMultiplier(5)));
assert(five.u.maxHp>one.u.maxHp*1.35,'level 5 footman is clearly tougher');
assert(five.w.stats(five.u).damage>one.w.stats(one.u).damage*1.35,'and hits clearly harder');
assert(five.ticks<one.ticks*0.7,'and trains clearly faster');
assert.equal(towerRange(1),10);assert.equal(towerRange(10),28);
assert(levelGains('barracks',1,2).some(g=>g.includes('+10% health and damage')));
assert(levelGains('tower',3,4).some(g=>g.includes('14 → 16')));
assert(researchGains('blades',1).includes('+3 damage'));
console.log('PASS: ranked units, faster training, longer tower reach, gains described');
