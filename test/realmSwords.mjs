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
console.log('PASS: realm swords crown kingless clans only');
