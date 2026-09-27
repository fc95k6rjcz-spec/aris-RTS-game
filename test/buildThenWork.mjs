// Workers who finish a building go back to harvesting, not stand about.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {World,Faction}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const w=new World(64,64,3,'plains',1,false);w.addPlayer(1,Faction.Human,'b');w.fogEnabled=false;
for(let y=0;y<64;y++)for(let x=0;x<64;x++)w.map.set(x,y,0);
w.placeBuilding(1,'townhall',20,20,true);
for(let y=20;y<23;y++)for(let x=30;x<33;x++){w.map.set(x,y,4);w.map.amount[w.map.idx(x,y)]=5000;}
const p=w.players.get(1);p.gold=5000;p.lumber=5000;
const ws=[0,1].map(i=>w.spawnUnit(1,'worker',{x:(28+i)*64,y:24*64}));
w.step([{type:'gather',player:1,units:ws.map(u=>u.id),tx:30,ty:21}]);
for(let i=0;i<200;i++)w.step([]);
w.step([{type:'build',player:1,units:ws.map(u=>u.id),building:'farm',tx:14,ty:28}]);
for(let i=0;i<3000;i++){w.step([]);const f=w.buildings().find(b=>b.def==='farm');if(f?.complete&&i>0){for(let j=0;j<40;j++)w.step([]);break;}}
console.log(ws.map(u=>u.task.kind+(u.task.resource?':'+u.task.resource:'')).join(', '));
assert(ws.every(u=>u.task.kind==='gather'&&u.task.resource==='gold'),'both builders went back to the gold');
console.log('PASS: builders return to harvesting');
