// All 100 Wars battles: numbered 1-100, every goal is reachable with what the
// chapter allows, and every battle that needs water or oil has it on its map.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({stdin:{contents:"export * from './src/game/wars.ts'; export * from './src/data/wars.ts'; export {BUILDINGS} from './src/data/buildings.ts'; export {UNITS} from './src/data/units.ts'; export {World} from './src/sim/world.ts';",resolveDir:'.',loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',logLevel:'error',define:{'import.meta.env':'{}'}});
globalThis.localStorage={_:{},getItem(k){return this._[k]??null},setItem(k,v){this._[k]=v}};
const M=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const HALL_NEEDS={2:["farm","barracks"],3:["lumbermill","tower"],4:["church","stables"],5:["foundry","magetower"],6:["shipyard","golddepot"],7:["gryphonaviary"],8:["oilrig","refinery"],9:["airfactory"],10:[]};
assert.equal(M.BATTLES.length,100,'100 battles');
M.BATTLES.forEach((b,i)=>{assert.equal(b.id,i+1,'ids in order');assert.equal(b.chapter,Math.ceil(b.id/10),`battle ${b.id} chapter`);assert.equal(b.cap,b.chapter);});
assert.equal(new Set(M.BATTLES.map(b=>b.seed)).size,100,'unique seeds');
const canReach=(def,allowed)=>{const d=M.BUILDINGS[def];return allowed.includes(def)&&d.requires.every(r=>canReach(r,allowed));};
const trainable=(u,allowed)=>allowed.some(bd=>M.BUILDINGS[bd]?.trains.includes(u)&&canReach(bd,allowed));
for(const b of M.BATTLES){
  for(const g of b.goals){
    if(g.kind==='build') assert(canReach(g.def,b.allowed),`battle ${b.id}: can't build ${g.def}`);
    if(g.kind==='train') assert(trainable(g.def,b.allowed),`battle ${b.id}: can't train ${g.def}`);
    if(g.kind==='hallLevel'){assert(g.level<=b.cap,`battle ${b.id}: hall above cap`);for(let l=2;l<=g.level;l++)for(const d of HALL_NEEDS[l])assert(canReach(d,b.allowed),`battle ${b.id}: hall ${l} needs ${d}`);}
    if(g.kind==='destroy') assert(b.enemy,`battle ${b.id}: destroy with no enemy`);
    if(g.kind==='clearHorde') assert(b.raids?.length,`battle ${b.id}: clearHorde with no raids`);
  }
  for(const u of [...(b.army??[]),...(b.raids??[]).flatMap(r=>r.defs)]) assert(M.UNITS[u],`battle ${b.id}: unknown unit ${u}`);
  const ids=b.goals.map(g=>g.kind==='build'||g.kind==='train'?g.def:g.kind).join(' ');
  if(/shipyard|longboat|transport|battleship|submarine|tanker/.test(ids)||b.goals.some(g=>g.kind==='hallLevel'&&g.level>=6)){
    const w=M.buildBattleWorld(b,1);const hall=w.buildings().find(x=>x.owner===1&&x.def==='townhall');
    let ok=false;for(let ty=1;ty<w.map.height-4&&!ok;ty++)for(let tx=1;tx<w.map.width-4&&!ok;tx++)if(w.map.canPlace(tx,ty,3)&&w.map.touchesWater(tx,ty,3)&&Math.hypot(tx-hall.tx,ty-hall.ty)<40)ok=true;
    assert(ok,`battle ${b.id}: needs a shipyard but has no shore`);
  }
  if(/oilrig/.test(ids)||b.goals.some(g=>g.kind==='hallLevel'&&g.level>=8)){
    const w=M.buildBattleWorld(b,1);let n=0;for(const v of w.map.oil)n+=v;
    assert(n>=9,`battle ${b.id}: needs oil but the map has none`);
  }
}
console.log('PASS: 100 Wars battles, every goal reachable, water and oil where needed');
