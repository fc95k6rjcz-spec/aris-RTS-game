// Workers crowding one mine and one wood line must keep working: none may drop
// to idle while the resource they were sent to still has plenty left.
import {build} from 'esbuild';import assert from 'node:assert/strict';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {World,Faction}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const w=new World(64,64,37,'plains',1,false);w.addPlayer(1,Faction.Human,'#38f');w.fogEnabled=false;
for(let y=0;y<64;y++)for(let x=0;x<64;x++)w.map.set(x,y,0);
w.placeBuilding(1,'townhall',20,20,true);
// a gold mine block and a wood line
for(let y=20;y<23;y++)for(let x=30;x<33;x++){w.map.set(x,y,4);w.map.amount[w.map.idx(x,y)]=100000;}
for(let x=14;x<28;x++){w.map.set(x,14,3);w.map.amount[w.map.idx(x,14)]=100000;w.map.set(x,13,3);w.map.amount[w.map.idx(x,13)]=100000;}
const ws=[];
for(let i=0;i<24;i++){const u=w.spawnUnit(1,'worker',{x:(19+i%8)*64+32,y:(25+Math.floor(i/8))*64+32});ws.push(u);
 const gold=i%2===0;w.step([{type:'gather',player:1,units:[u.id],tx:gold?30:20,ty:gold?21:14}]);}
const before={...w.players.get(1)};let idle=0;const idleAt=[];
for(let t=0;t<6000;t++){w.step([]);if(t%50===0)for(const u of ws){if(u.task.kind==='idle'){idle++;idleAt.push([t,u.id]);u.task={kind:'idle'};}}}
const p=w.players.get(1);
console.log('gold +',p.gold-before.gold,' lumber +',p.lumber-before.lumber,' idle samples',idle, idleAt.slice(0,10));
assert.equal(idle,0,'workers quit gathering');
console.log('PASS: 24 crowded workers never stopped harvesting');
