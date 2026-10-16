// The realm: a newcomer can arrive as an Orc (red), and starting again may change sides.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {World,WILD}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const w=new World(96,96,42,'plains',1,false);w.realm=true;w.addPlayer(WILD,'human','#863');
// Two arrivals through the ledger command, one per side.
w.step([{type:'joinRealm',player:0,peer:'H',faction:'human'},{type:'joinRealm',player:0,peer:'O',faction:'orc'}]);
const h=w.realmSeats.get('H'),o=w.realmSeats.get('O');
assert.equal(w.players.get(h).faction,'human');assert.equal(w.players.get(o).faction,'orc');
assert.equal(w.players.get(o).color,'#dc2626','Orcs fly red');
assert.notEqual(w.players.get(h).color,'#ef4444','Humans never take the Orc red');
// An old client with no side in its hello arrives Human.
w.step([{type:'joinRealm',player:0,peer:'Old'}]);assert.equal(w.players.get(w.realmSeats.get('Old')).faction,'human');
// A town still standing keeps its side, even if its player now picks the other one.
w.step([{type:'joinRealm',player:0,peer:'O',faction:'human'}]);assert.equal(w.players.get(o).faction,'orc');
// Starting again is the moment to switch.
w.step([{type:'restartSeat',player:o,faction:'human'}]);assert.equal(w.players.get(o).faction,'human');
w.step([{type:'restartSeat',player:o}]);assert.equal(w.players.get(o).faction,'human','no side given keeps the side');
console.log('PASS realm orcs');
