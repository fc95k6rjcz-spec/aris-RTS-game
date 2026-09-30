// Every Wars battle builds a playable world, and its goals can be met.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({stdin:{contents:"export * from './src/game/wars.ts'; export * from './src/data/wars.ts'; export {World} from './src/sim/world.ts';",resolveDir:'.',loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',logLevel:'error',define:{'import.meta.env':'{}'}});
globalThis.localStorage={_:{},getItem(k){return this._[k]??null},setItem(k,v){this._[k]=v}};
const M=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
for(const b of M.BATTLES){
  const w=M.buildBattleWorld(b,1);
  assert(w.buildings().some(x=>x.owner===1&&x.def==='townhall'),`battle ${b.id} has a hall`);
  assert(w.levelCap===b.cap&&w.war,`battle ${b.id} rules`);
  if(b.enemy) assert(w.seatAlive(2),`battle ${b.id} has an enemy`);
  for(let i=0;i<200;i++)w.step([]);
  assert.equal(w.winner,null,`battle ${b.id} is not won by default`);
  const st=b.goals.map(g=>M.goalState(w,1,g,10,(b.raids??[]).length));
  assert(!st.every(s=>s.done),`battle ${b.id} not already won: ${st.map(s=>s.text)}`);
}
// battle 1: build a barracks and 3 farms
const b1=M.battle(1);const w=M.buildBattleWorld(b1,1);
const hall=w.buildings().find(x=>x.def==='townhall');
const place=(d)=>{for(let r=5;r<30;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const b=w.placeBuilding(1,d,hall.tx+dx,hall.ty+dy,true);if(b)return b;}throw new Error('no room for '+d)};place('barracks');place('farm');place('farm');place('farm');
assert(b1.goals.every(g=>M.goalState(w,1,g,60,0).done),'battle 1 won once built');
assert(w.placementError(1,'stables',hall.tx+10,hall.ty+10)?.includes('not available'),'no stables in chapter 1');
assert.equal(M.starsFor(b1,100),3);assert.equal(M.starsFor(b1,400),2);assert.equal(M.starsFor(b1,9999),1);
assert(M.battleUnlocked(1)&&!M.battleUnlocked(2));M.saveWarResult(1,2);assert(M.battleUnlocked(2));
// battle 7: scripted scouts arrive and can be cleared
const b7=M.battle(7);const w7=M.buildBattleWorld(b7,1);w7.summonHorde(1,'raid',b7.raids[0].defs,'x');
assert(w7.units().some(u=>u.horde),'orcs arrive');
for(const u of w7.units().filter(u=>u.horde))w7.removeEntity(u.id);
assert(M.goalState(w7,1,b7.goals[0],200,0).done,'cleared');
console.log('PASS: 10 Wars battles build, start unwon, and can be won; caps and unlocks hold');
