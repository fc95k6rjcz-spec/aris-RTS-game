// A wooden watch tower (3 archers) must beat six footmen who attack it, and
// every upgrade must put another archer on the platform.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {World,Faction,towerArchers}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
assert.equal(towerArchers(1),3);for(let l=2;l<=9;l++)assert.equal(towerArchers(l),towerArchers(l-1)+1);
function fight(level,n,seed){
 const w=new World(64,64,seed,'plains',1,false);w.addPlayer(1,Faction.Human,'blue');w.addPlayer(2,Faction.Human,'red');w.fogEnabled=false;
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)w.map.set(x,y,0);
 const tower=w.placeBuilding(1,'tower',30,30,true);tower.level=level;
 const men=[];for(let i=0;i<n;i++)men.push(w.spawnUnit(2,'footman',{x:(40+(i%3))*64+32,y:(30+Math.floor(i/3))*64+32}));
 w.step([{type:'attack',player:2,units:men.map(m=>m.id),target:tower.id}]);
 for(let t=0;t<4000;t++){w.step([]);if(tower.hp<=0||!w.entities.has(tower.id))return {won:false,hp:0};if(men.every(m=>m.hp<=0||!w.entities.has(m.id)))return {won:true,hp:tower.hp/tower.maxHp};}
 return {won:false,hp:tower.hp/tower.maxHp,timeout:true};
}
let wins=0;const res=[];for(let s=1;s<=10;s++){const r=fight(1,6,s);res.push(r);if(r.won)wins++;}
console.log('L1 vs 6 footmen:',res.map(r=>r.won?`won ${(r.hp*100|0)}%`:'lost').join(', '));
assert(wins===10,'wooden tower should beat six footmen');
const r8=fight(1,9,3);console.log('L1 vs 9 footmen:',r8.won?'won':'lost (fine: it has limits)');
console.log('PASS: tower archers scale with level; 3 archers beat 6 footmen');
