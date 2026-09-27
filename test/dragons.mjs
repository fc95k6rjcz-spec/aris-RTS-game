// Dragons must actually turn up: one arrives a few minutes in, roosts in the
// wild, and goes raiding at somebody's buildings.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {World,Faction,WILD}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const w=new World(96,96,5,'plains',1,false);w.addPlayer(1,Faction.Human,'blue');w.addPlayer(2,Faction.Human,'red');w.addPlayer(WILD,Faction.Human,'#863');
const s=w.map.starts;w.spawnStart(1,s[0].x-1,s[0].y-1);w.spawnStart(2,s[1].x-2,s[1].y-2);
let seen=null,raid=false,msgs=new Set();
for(let t=0;t<20*60*10&&!raid;t++){w.step([]);for(const e of w.events)msgs.add(e.text);
 const d=w.units().find(u=>u.def==='dragon');if(d&&seen===null)seen=w.tick;if(d&&d.task.kind==='attackMove')raid=true;}
console.log('first dragon at',(seen/20/60).toFixed(1),'min; raided:',raid,[...msgs].filter(m=>/dragon/i.test(m)));
assert(seen!==null&&seen<=20*60*7,'a dragon arrives by minute 7');assert(raid,'the dragon raids a settlement');
console.log('PASS: dragons arrive and raid');
