import assert from 'node:assert/strict';
import {build} from 'esbuild';
const out=await build({stdin:{contents:"export {World,Faction} from './src/sim/world';export {SkirmishAI} from './src/ai/skirmish';export * from './src/game/saveGame';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {World,Faction,SkirmishAI,encodeSave,decodeSave,packSave,unpackSave}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
for(const mode of ['settled','crowning','coop']){
const w=new World(64,64,81,'plains',1,false);for(const id of mode==='coop'?[1,2,3]:[1,2])w.addPlayer(id,Faction.Human,'blue');if(mode==='coop')w.prepareCoop();
for(const id of w.players.keys()){const home=w.map.starts[id-1];if(mode==='crowning')w.spawnCrowning(id,home.x-1,home.y-1);else w.spawnStart(id,home.x-1,home.y-1);}
const ai=new SkirmishAI(w,mode==='coop'?3:2,'normal');for(let i=0;i<260;i++)w.step(ai.think(w.tick));
const save={version:1,world:w,map:{id:'test',name:'Test',kind:'plains',seed:81,size:64,open:1},player:1,multiplayer:mode==='coop',setup:null,difficulty:'normal',ai:ai.saveState(),camera:{x:10,y:20,zoom:40},selected:[]};
const packed=await packSave(encodeSave(save)),loaded=await unpackSave(packed),r=loaded.world;assert.equal(w.checksum(),r.checksum());assert.deepEqual([...w.map.tiles],[...r.map.tiles]);assert.deepEqual([...w.vision.get(1).explored],[...r.vision.get(1).explored]);const ai2=new SkirmishAI(r,mode==='coop'?3:2,'normal');ai2.restoreState(loaded.ai);
for(let i=0;i<300;i++){const x=ai.think(w.tick),y=ai2.think(r.tick);assert.deepEqual(x,y);w.step(x);r.step(y);assert.equal(w.checksum(),r.checksum(),mode+' resumed tick '+i);assert.equal(w.rng.state,r.rng.state);}
console.log('PASS: '+mode+' save preserves map, fog, resources, orders, RNG and AI across 300 resumed ticks ('+packed.length+' bytes).');}
assert.throws(()=>decodeSave('{"version":99}'));assert.throws(()=>decodeSave('{"__proto__":{}}'));assert.throws(()=>decodeSave('not json'));
