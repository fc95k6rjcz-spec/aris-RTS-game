// In the realm, a beaten player starts again as a new camp, keeping their banner.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {World,WILD}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const w=new World(96,96,42,'plains',1,false);w.realm=true;w.addPlayer(WILD,'human','#863');
const a=w.claimSeat('A'),b=w.claimSeat('B');
const king=w.units().find(u=>u.owner===b&&u.def==='king');const h=w.homes.get(b);w.placeBuilding(b,'townhall',h.x,h.y,true);
assert(w.buildings().some(x=>x.owner===b),'B founded a hall');
// B is wiped out
for(const e of [...w.entities.values()])if(e.owner===b)w.removeEntity(e.id);
assert(!w.seatAlive(b));
w.step([{type:'restartSeat',player:b}]);
assert(w.seatAlive(b));assert.equal(w.realmSeats.get('B'),b);
assert.equal(w.units().filter(u=>u.owner===b).length,1);assert(w.relicFor(b),'a sword to find');assert(!w.buildings().some(x=>x.owner===b));
// a returning player's claim does not reset a living kingdom
assert.equal(w.claimSeat('B'),b);assert.equal(w.units().filter(u=>u.owner===b).length,1);assert(w.relicFor(b),'a sword to find');
console.log('PASS: fallen player restarts with the same banner as a new camp');
