// Regression checks for the 30 Sept 2026 game audit: free-hall refund, garrison
// supply, double research, gates on manned walls and kingless survivors.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({stdin:{contents:"export {World,Faction} from './src/sim/world';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {World,Faction}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const fresh=()=>{const w=new World(64,64,5,'plains',1,false);w.addPlayer(1,Faction.Human,'blue');w.addPlayer(2,Faction.Human,'red');w.fogEnabled=false;for(let y=0;y<64;y++)for(let x=0;x<64;x++)w.map.set(x,y,0);return w;};
const at=(x,y)=>({x:(x+.5)*64,y:(y+.5)*64});

// A replacement Town Hall is free, so cancelling it must refund nothing.
{const w=fresh(),p=w.players.get(1);w.hallsBuilt.add(1);const king=w.spawnUnit(1,'king',at(20,20));p.gold=p.lumber=0;
 w.applyCommand({type:'build',player:1,units:[king.id],building:'townhall',tx:22,ty:22});
 const site=w.buildings().find(b=>b.def==='townhall');assert(site,'hall placed');
 w.applyCommand({type:'cancelBuild',player:1,building:site.id});assert.equal(p.gold,0);assert.equal(p.lumber,0);}

// Archers in a tower still use supply.
{const w=fresh();const t=w.placeBuilding(1,'tower',30,30,true);const a=w.spawnUnit(1,'archer',at(29,30));const before=w.supply(1).used;
 t.garrison=[{def:'archer',hp:a.hp,maxHp:a.maxHp}];w.removeEntity(a.id);assert.equal(w.supply(1).used,before);}

// The same research can't be bought at two buildings at once.
{const w=fresh(),p=w.players.get(1);p.gold=p.lumber=99999;const a=w.placeBuilding(1,'barracks',10,10,true),b=w.placeBuilding(1,'barracks',20,10,true);
 w.applyCommand({type:'research',player:1,building:a.id,upgrade:'blades'});const g=p.gold;
 w.applyCommand({type:'research',player:1,building:b.id,upgrade:'blades'});assert.equal(b.research,null);assert.equal(p.gold,g);}

// A gate built into a manned wall sends the archers down instead of deleting them.
{const w=fresh(),p=w.players.get(1);p.gold=p.lumber=99999;w.placeBuilding(1,'townhall',10,10,true);const wall=w.placeBuilding(1,'wall',30,30,true);wall.garrison=[{def:'archer',hp:70,maxHp:70}];
 const worker=w.spawnUnit(1,'worker',at(28,28));w.applyCommand({type:'build',player:1,units:[worker.id],building:'gate',tx:30,ty:30});
 assert.equal(w.units().filter(u=>u.owner===1&&u.def==='archer').length,1);}

// Workers with no King, no heir and no buildings don't keep a lost clan in the match.
{const w=fresh();w.placeBuilding(1,'townhall',10,10,true);w.spawnUnit(2,'worker',at(50,50));w.tick=20;w.step([]);for(let i=0;i<40&&w.winner===null;i++)w.step([]);assert.equal(w.winner,1);}

console.log('PASS: free hall refund, garrison supply, single research, gate over manned wall, kingless survivors');
