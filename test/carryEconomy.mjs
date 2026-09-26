import {build} from 'esbuild';import assert from 'node:assert/strict';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {World,Faction,START_PURSE}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
for(const [resource,tile,expected] of [['gold',4,50],['lumber',3,25]]){
 const w=new World(64,64,37,'plains',1,false);w.addPlayer(1,Faction.Human,'#38f');w.fogEnabled=false;
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)w.map.set(x,y,0);
 w.placeBuilding(1,'townhall',8,8,true);const u=w.spawnUnit(1,'worker',{x:14.5*64,y:12.5*64});
 w.map.set(15,12,tile);w.map.amount[w.map.idx(15,12)]=resource==='gold'?1000:15;
 w.map.set(15,13,tile);w.map.amount[w.map.idx(15,13)]=40;
 u.task={kind:'gather',resource,tx:15,ty:12,phase:'harvest',timer:1};
 let maximum=0,full=false;const before=w.players.get(1)[resource];
 for(let i=0;i<3000;i++){w.step([]);maximum=Math.max(maximum,u.carrying?.amount??0);if(u.carrying?.amount===expected)full=true;if(w.players.get(1)[resource]>before)break;}
 assert.equal(maximum,expected);assert(full);assert.equal(w.players.get(1)[resource]-before,expected);
}
assert.equal(START_PURSE.gold,1035);assert.equal(START_PURSE.lumber,563);
console.log('PASS: 50 gold, 25 wood across two trees, exact deposits, playable founding budget.');
