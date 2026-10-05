// A dragon burns a town but cannot be killed, never razes a building, makes
// the townsfolk flee, then goes home -- and the workers go back to work.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {World,Faction,WILD}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const w=new World(64,64,4,'plains',1,false);w.addPlayer(1,Faction.Human,'b');w.addPlayer(WILD,Faction.Human,'#863');w.fogEnabled=false;w.hordeEnabled=false;
for(let y=0;y<64;y++)for(let x=0;x<64;x++)w.map.set(x,y,0);
const hall=w.placeBuilding(1,'townhall',20,20,true);const farm=w.placeBuilding(1,'farm',26,20,true);const tower=w.placeBuilding(1,'tower',20,26,true);
for(let y=20;y<23;y++)for(let x=12;x<15;x++){w.map.set(x,y,4);w.map.amount[w.map.idx(x,y)]=5000;}
const ws=[0,1,2,3].map(i=>w.spawnUnit(1,'worker',{x:(17+i*0.3)*64,y:21*64}));
w.step([{type:'gather',player:1,units:ws.map(u=>u.id),tx:14,ty:21}]);
const d=w.spawnUnit(WILD,'dragon',{x:55*64,y:55*64});w.lairs.set(d.id,{x:55*64,y:55*64});
d.dragon={phase:'raid',target:1,over:{x:23*64,y:22*64},until:w.tick+20*120};
let fled=false,minFrac=1;const hp0=d.hp;
for(let t=0;t<20*150;t++){w.step([]);if(ws.some(u=>u.fear))fled=true;for(const b of [hall,farm,tower])minFrac=Math.min(minFrac,b.hp/b.maxHp);}
console.log('fled',fled,'lowest building',minFrac.toFixed(2),'dragon hp',d.hp,'/',hp0,'phase',d.dragon.phase,'workers',ws.map(u=>u.task.kind).join(','));
assert(fled,'workers fled');assert(minFrac>=0.24&&minFrac<0.9,'buildings burned but not razed');assert.equal(d.hp,hp0,'dragon unhurt');
assert(w.entities.has(hall.id)&&w.entities.has(farm.id)&&w.entities.has(tower.id));
assert(d.dragon.phase!=='raid','dragon left');assert(ws.filter(u=>w.entities.has(u.id)).some(u=>u.task.kind==='gather'),'workers back at work');
console.log('PASS: unstoppable dragon burns, terrifies, spares the town, leaves; work resumes');
