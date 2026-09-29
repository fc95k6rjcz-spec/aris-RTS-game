// Everyone eats; without a farm the hunger compounds each minute; a farm settles it.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {World}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const mk=()=>{const w=new World(64,64,3,'plains',1,false);w.addPlayer(1,'human','#36c');for(let y=0;y<64;y++)for(let x=0;x<64;x++)w.map.set(x,y,0);w.placeBuilding(1,'townhall',20,20,true);for(let i=0;i<10;i++)w.spawnUnit(1,'worker',{x:(10+i)*64,y:10*64});return w;};
const a=mk();const p=a.players.get(1);p.food=400;
const eaten=[];let last=400;for(let m=0;m<8;m++){for(let i=0;i<20*60;i++)a.step([]);eaten.push(last-p.food);last=p.food;}
console.log('eaten per minute, no farm:',eaten.join(' '));
assert(eaten[0]>=15&&eaten[0]<=25,'about 2 a minute each at first');assert(eaten[6]>eaten[0]*1.8,'and faster every minute');
const b=mk();b.placeBuilding(1,'farm',30,30,true);const q=b.players.get(1);q.food=400;
for(let i=0;i<20*60*8;i++)b.step([]);console.log('with a farm after 8 min:',q.food);assert(q.food>400,'a farm feeds ten men with room to spare');
const c=mk();const r=c.players.get(1);r.food=0;const hall=c.buildings().find(x=>x.def==='townhall');r.gold=1e4;
c.step([{type:'train',player:1,building:hall.id,unit:'worker'}]);const n=c.units().length;for(let i=0;i<20*60;i++){c.step([]);r.food=0;}
assert.equal(c.units().length,n,'no one trained while starving');
console.log('PASS: hunger grows without farms, farms feed, starving towns train no one');
