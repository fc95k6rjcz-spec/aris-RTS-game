import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ stdin: { contents: "export { World, Faction, WILD } from './src/sim/world'; export { encodeSave, decodeSave } from './src/game/saveGame'; export { SkirmishAI } from './src/ai/skirmish';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { World, Faction, WILD, encodeSave, decodeSave, SkirmishAI } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
function make() {
  const w = new World(64,64,81,'plains',1,false);
  for (const id of [1,2,3,WILD]) w.addPlayer(id,Faction.Human,'#aaa');
  return w;
}
const w = make();
const a = w.spawnUnit(1,'footman',{x:1000,y:1000});
const b = w.spawnUnit(2,'footman',{x:1064,y:1000});
a.task = {kind:'attack',target:b.id}; b.task = {kind:'attack',target:a.id};
a.engaging=b.id; b.engaging=a.id;
w.applyCommand({type:'alliance',player:1,target:2,allied:true});
assert(w.allied(1,2)); assert(!w.allied(1,3));
assert.equal(a.task.kind,'idle'); assert.equal(b.task.kind,'idle');
assert.equal(a.engaging,null); assert.equal(b.engaging,null);
const hp=b.hp; w.dealDamage(b,100,1); assert.equal(b.hp,hp);
const ai = new SkirmishAI(w,2,'normal');
const orders=[]; ai.defend(orders); assert.equal(orders.length,0,'AI does not defend against its ally');
w.applyCommand({type:'alliance',player:1,target:2,allied:false});
assert(!w.allied(1,2)); assert(!w.allied(2,3),'fresh team cannot collide with player 3');
w.applyCommand({type:'alliance',player:1,target:2,allied:true});
const restored=decodeSave(encodeSave({version:1,world:w,player:1,map:{id:'test'},selected:[]})).world;
assert(restored.allied(1,2)); assert.equal(restored.checksum(),w.checksum());
w.applyCommand({type:'alliance',player:1,target:WILD,allied:true}); assert(!w.allied(1,WILD));
const left=make(),right=make();
for(const allied of [true,false,true]) {
  const command={type:'alliance',player:1,target:2,allied};
  left.applyCommand(command); right.applyCommand(command);
  assert.equal(left.checksum(),right.checksum(),'identical commands preserve multiplayer state');
}
console.log('PASS: alliances, separation, attack cancellation, AI, save round-trip, wildlife exclusion and deterministic commands');
