import assert from 'node:assert/strict';
import { build } from 'esbuild';
const out=await build({entryPoints:['src/sim/world.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {World,Faction,WILD}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
function fresh(){const w=new World(64,64,7927,'lakeland',1,false);w.addPlayer(1,Faction.Human,'#369');w.addPlayer(2,Faction.Human,'#933');w.addPlayer(WILD,Faction.Human,'#963');for(let y=0;y<64;y++)for(let x=0;x<64;x++)w.map.set(x,y,0);w.fogEnabled=false;return w;}
const w=fresh(), king=w.spawnUnit(1,'king',{x:640,y:640}), archer=w.spawnUnit(1,'archer',{x:720,y:640}), far=w.spawnUnit(1,'footman',{x:2200,y:2200}), foe=w.spawnUnit(2,'footman',{x:740,y:640});
const base=w.stats(archer).damage;
w.applyCommand({type:'battleRally',player:1,units:[king.id]});assert.equal(w.stats(archer).damage,base*1.25);assert.equal(foe.ralliedUntil,undefined);assert.equal(far.ralliedUntil,undefined);
const ready=king.rallyReadyAt;w.tick=10;w.applyCommand({type:'battleRally',player:1,units:[king.id]});assert.equal(king.rallyReadyAt,ready);w.tick=241;assert.equal(w.stats(archer).damage,base);
assert.equal(w.placementError(1,'tower',15,15,true),null);assert.match(w.placementError(1,'tower',15,15,false),/Requires/);
const wall=w.placeBuilding(1,'wall',11,10,false);king.task={kind:'build',building:wall.id};w.step([]);assert.equal(wall.progress,1.5);
wall.complete=true;wall.hp=100;king.task={kind:'repair',building:wall.id};w.step([]);assert.equal(wall.hp,102);
const shelter=w.placeBuilding(1,'shelter',20,20,true), guest=w.spawnUnit(1,'worker',{x:19*64,y:21*64});guest.hp=10;
Object.defineProperty(w,'rain',{get:()=>1});w.tick=260;w.stepShelters();assert.equal(guest.hp,11);guest.task={kind:'move',target:{x:2000,y:2000}};w.tick=280;w.stepShelters();assert.equal(guest.hp,11);
const bear=w.spawnUnit(WILD,'bear',{x:800,y:640});bear.hp=bear.maxHp=100000;let crit=0;for(let i=0;i<200;i++){w.fx=[];w.damage(bear,base,archer);crit+=w.fx.filter(e=>e.kind==='hit'&&e.crit).length;}assert(crit>0&&crit<100);
function bands(){const p=fresh();p.patrolsEnabled=true;p.tick=1799;p.stepPatrols();assert.equal(p.units().length,0);p.tick=1800;p.stepPatrols();assert.equal(p.units().length,2);assert(p.units().every(u=>p.map.starts.every(s=>Math.hypot(u.pos.x/64-s.x,u.pos.y/64-s.y)>17)));p.tick=4800;p.stepPatrols();assert.equal(p.units().length,6);for(let i=2;i<12;i++){p.tick=1800+i*3000;p.stepPatrols();}assert(p.units().length<=24);return p.checksum();}assert.equal(bands(),bands());
console.log('PASS: rally range/cooldown/expiry, royal building/repair, shelter healing, archer critical hits, deterministic escalating patrols and cap');

