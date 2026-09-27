// A gold mine drains as one seam: every ounce, including the centre tile nobody
// can stand beside, comes out; then the whole mine collapses to open ground.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {World,Faction}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const w=new World(64,64,5,'plains',1,false);w.addPlayer(1,Faction.Human,'b');w.fogEnabled=false;
for(let y=0;y<64;y++)for(let x=0;x<64;x++)w.map.set(x,y,0);
w.placeBuilding(1,'townhall',20,20,true);
for(let y=20;y<23;y++)for(let x=28;x<31;x++){w.map.set(x,y,4);w.map.amount[w.map.idx(x,y)]=300;}
const u=w.spawnUnit(1,'worker',{x:27*64,y:21*64});
const g0=w.players.get(1).gold;
w.step([{type:'gather',player:1,units:[u.id],tx:28,ty:21}]);
const ev=[];for(let i=0;i<40000;i++){w.step([]);for(const e of w.events)ev.push(e.text);let left=0;for(let y=20;y<23;y++)for(let x=28;x<31;x++)if(w.map.get(x,y)===4)left++;if(!left&&!u.carrying)break;}
let gold=0,rock=0;for(let y=20;y<23;y++)for(let x=28;x<31;x++){if(w.map.get(x,y)===4)gold++;if(w.map.get(x,y)===5)rock++;}
const got=w.players.get(1).gold-g0;
console.log('gold delivered',got,'tiles left gold',gold,'rock',rock);
assert.equal(gold,0);assert.equal(rock,0);assert(got>=2700,'all 2700 gold came out');const warned=[];
assert(ev.some(t=>/trouble producing gold/.test(t)),'miners warned');assert(ev.some(t=>/run dry/.test(t)));console.log('PASS: miners warned, whole seam mined, mine collapsed to open ground');
