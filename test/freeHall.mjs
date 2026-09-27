// Everyone pays for their first hall; a clan whose hall is destroyed raises the next one free.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {World,WILD}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const w=new World(96,96,42,'plains',1,false);w.realm=true;w.addPlayer(WILD,'human','#863');
const a=w.claimSeat('A');assert(w.buildCost(a,'townhall').gold>0,'first hall is paid for');
const h=w.homes.get(a);const hall=w.placeBuilding(a,'townhall',h.x+4,h.y+4,true);assert(w.buildCost(a,'townhall').gold>0);
w.removeEntity(hall.id);assert.equal(w.buildCost(a,'townhall').gold,0,'rebuilding a lost hall is free');
console.log('PASS: free hall after losing one');
