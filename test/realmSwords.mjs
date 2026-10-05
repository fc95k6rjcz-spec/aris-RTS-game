// Swords lie all over the realm; any clan without a King can claim one with
// any of its people, and a clan that has a King walks straight past them.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {World,WILD}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const w=new World(96,96,42,'plains',1,false);w.realm=true;w.addPlayer(WILD,'human','#863');w.scatterSwords(8);
const a=w.claimSeat('A');const man=w.units().find(u=>u.owner===a);assert.equal(man.def,'worker');
const sword=w.relicFor(a);assert(sword&&sword.owner===0,'a realm sword to look for');
const before=w.relics.filter(r=>!r.taken).length;
man.pos={x:(sword.x+0.5)*64,y:(sword.y+0.5)*64};for(let i=0;i<10;i++)w.step([]);
assert.equal(man.def,'king','crowned by a realm sword');assert(sword.taken);
assert.equal(w.relics.filter(r=>!r.taken).length,before,'another sword appears somewhere');
assert.equal(w.relicFor(a),null,'a crowned clan seeks no sword');
// a follower of the king stepping on another sword is not crowned
const other=w.relics.find(r=>!r.taken);const f=w.units().find(u=>u.owner===a&&u.def==='worker');
if(f){f.pos={x:(other.x+0.5)*64,y:(other.y+0.5)*64};for(let i=0;i<10;i++)w.step([]);assert.equal(f.def,'worker');assert(!other.taken);}
// a sword lying by a crowned clan's town wanders off elsewhere
const k=w.units().find(u=>u.owner===a&&u.def==='king');const tx=Math.floor(k.pos.x/64),ty=Math.floor(k.pos.y/64);
let hall=null;for(let d=3;d<20&&!hall;d++)for(const [dx,dy] of [[d,0],[-d,0],[0,d],[0,-d]]){hall=w.placeBuilding(a,'townhall',tx+dx,ty+dy,true);if(hall)break;}
assert(hall,'a hall to test with');
w.relics.push({owner:0,faction:0,x:hall.tx+hall.size+2,y:hall.ty,taken:false});const count=w.relics.filter(r=>!r.taken&&r.owner===0).length;
for(let i=0;i<120;i++)w.step([]);
const nearHall=w.relics.filter(r=>!r.taken&&r.owner===0&&Math.hypot(r.x-hall.tx,r.y-hall.ty)<15);
assert.equal(nearHall.length,0,'no sword left by the town');assert.equal(w.relics.filter(r=>!r.taken&&r.owner===0).length,count,'it went somewhere else');
console.log('PASS: realm swords crown kingless clans only');
{ // starting again forgets the map
  const v=w.vision.get(a);v.explored.fill(1);w.restartSeat(a);
  const seen=v.explored.reduce((n,x)=>n+x,0);assert(seen>0&&seen<v.explored.length/4,'only the new camp is known: '+seen);
  console.log('PASS: starting again forgets the old map');
}
