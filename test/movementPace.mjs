import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result=await build({stdin:{contents:"export {World,Faction,MOVE_SCALE} from './src/sim/world';export {UNITS} from './src/data/units';export {encodeSave,decodeSave} from './src/game/saveGame';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {World,Faction,MOVE_SCALE,UNITS,encodeSave,decodeSave}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
function measure(tile,mud=0,diagonal=false){
  const w=new World(64,64,81,'plains',1,false);w.addPlayer(1,Faction.Human,'blue');
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){w.map.set(x,y,tile);w.map.mud[w.map.idx(x,y)]=mud;}
  const u=w.spawnUnit(1,'worker',{x:10.5*64,y:10.5*64});
  u.path=[[40,diagonal?40:10]];
  for(let i=0;i<100;i++){w.map.wear.fill(0);w.followPath(u);}
  return {w,u,distance:Math.hypot(u.pos.x-10.5*64,u.pos.y-10.5*64)};
}
const open=measure(0),diagonal=measure(0,0,true),forest=measure(3),mud=measure(0,255);
const expected=UNITS.worker.speed*MOVE_SCALE*100;
assert(Math.abs(open.distance-expected)<2,'walking follows reduced pace');
assert(Math.abs(diagonal.distance-open.distance)<2,'diagonal does not round up or stall');
assert(forest.distance>0 && forest.distance<open.distance*.5,'forest still allows slow movement');
assert(mud.distance>0 && mud.distance<open.distance*.7,'mud still allows slow movement');
const save={version:1,world:forest.w,player:1,map:{id:'test'},selected:[]};
const restored=decodeSave(encodeSave(save)).world;
assert.equal(restored.checksum(),forest.w.checksum());
const copy=restored.entities.get(forest.u.id);
for(let i=0;i<100;i++){forest.w.followPath(forest.u);restored.followPath(copy);}
assert.deepEqual(copy.pos,forest.u.pos);assert.equal(restored.checksum(),forest.w.checksum());
const shore=new World(64,64,81,'plains',1,false);shore.addPlayer(1,Faction.Human,'blue');
for(let y=0;y<64;y++)for(let x=0;x<64;x++)shore.map.set(x,y,x>=12&&x<=13?2:0);
const swimmer=shore.spawnUnit(1,'worker',{x:10.5*64,y:10.5*64});
shore.applyCommand({type:'move',player:1,units:[swimmer.id],x:16.5*64,y:10.5*64});
let crossedWater=false;
for(let i=0;i<2400;i++){shore.tick++;shore.stepUnit(swimmer);crossedWater ||= shore.isAfloat(swimmer);}
assert(crossedWater,'worker crosses the water');
assert(swimmer.pos.x>=16*64,'worker reaches land on the other side without sticking');
console.log('PASS: adjusted walking pace, diagonals, forest/mud progress, saved fractional motion and shoreline crossing');
