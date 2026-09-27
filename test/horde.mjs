// The Orc Horde turns up: scouts find a town and go home, raids attack it.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {World,Faction,WILD}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const w=new World(96,96,11,'plains',1,false);w.addPlayer(1,Faction.Human,'b');w.addPlayer(2,Faction.Human,'r');w.addPlayer(WILD,Faction.Human,'#863');
w.dragonsEnabled=false;
const s=w.map.starts;w.spawnStart(1,s[0].x-1,s[0].y-1);w.spawnStart(2,s[1].x-2,s[1].y-2);
const msgs=[];let scoutSeen=false,raidHit=false,spotted=false;
for(let t=0;t<20*60*13;t++){w.step([]);for(const e of w.events)msgs.push(`${(w.tick/1200).toFixed(1)}m p${e.player}: ${e.text}`);
 if(w.units().some(u=>u.horde?.role==='scout'))scoutSeen=true;
 if(w.units().some(u=>u.horde?.spotted))spotted=true;
 if(w.fx.some(e=>e.kind==='hit'&&e.owner!==WILD&&e.attackerOwner===WILD))raidHit=true;}
console.log(msgs.filter(m=>/orc|horde|war band/i.test(m)).slice(0,8).join('\n'));
assert(scoutSeen,'scouts came');assert(spotted,'scouts reached a town');assert(raidHit,'the Horde drew blood');
console.log('PASS: Orc scouts arrive and spy, war bands attack');
