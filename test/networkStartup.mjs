import {build} from 'esbuild';
import assert from 'node:assert/strict';
const channels=new Set();let droppedTurn=false,droppedAck=false;
globalThis.__roomTestClient={channel(name){const c={name,handlers:[],active:false,on(_,filter,fn){this.handlers.push([filter.event,fn]);return this;},subscribe(fn){this.active=true;queueMicrotask(()=>fn('SUBSCRIBED'));return this;},async send({event,payload}){if(event==='orders'&&payload.turn===1&&!droppedTurn){droppedTurn=true;return 'ok';}if(event==='ordersAck'&&!droppedAck){droppedAck=true;return 'ok';}for(const other of channels)if(other!==this&&other.active&&other.name===name)for(const [kind,fn] of other.handlers)if(kind===event)queueMicrotask(()=>{if(other.active)fn({payload});});return 'ok';}};channels.add(c);return c;},async removeChannel(c){c.active=false;channels.delete(c);}};

const out=await build({stdin:{contents:"export {RoomTransport} from './src/net/room'; export {Lockstep} from './src/net/lockstep'; export {World,Faction} from './src/sim/world';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {RoomTransport,Lockstep,World,Faction}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const db=globalThis.__roomTestClient,a=db.channel('startup'),b=db.channel('startup');
const ta=new RoomTransport(0,a,db),tb=new RoomTransport(1,b,db);a.subscribe(()=>{});b.subscribe(()=>{});
const make=()=>{const w=new World(64,64,123,'plains',1,false);w.addPlayer(1,Faction.Human,'blue');w.addPlayer(2,Faction.Human,'red');for(let y=0;y<64;y++)for(let x=0;x<64;x++)w.map.set(x,y,0);w.spawnUnit(1,'worker',{x:15*64,y:15*64});w.spawnUnit(2,'worker',{x:25*64,y:25*64});w.updateVision(true);return w;};
const wa=make(),wb=make();assert(wb.canSee(2,25*64,25*64),'guest starts with visible terrain before tick zero');
const la=new Lockstep(ta);la.start();la.nextTick(1,()=>wa.checksum());
await new Promise(r=>setTimeout(r,100)); // Host publishes before guest installs the scheduler.
const lb=new Lockstep(tb);lb.start();
la.issue({type:'move',player:1,units:[wa.units()[0].id],x:18*64,y:15*64});lb.issue({type:'move',player:2,units:[wb.units()[1].id],x:28*64,y:25*64});
try{const deadline=Date.now()+5000;while((wa.tick<48||wb.tick<48)&&Date.now()<deadline){for(const [l,w] of [[la,wa],[lb,wb]])if(w.tick<48){const next=l.nextTick(Date.now(),()=>w.checksum());if(next)w.step(next.commands);}await new Promise(r=>setTimeout(r,3));}assert.equal(wa.tick,48);assert.equal(wb.tick,48);assert.equal(wa.checksum(),wb.checksum());assert(wa.units()[0].pos.x>15*64);assert(wb.units()[1].pos.x>25*64);assert(droppedTurn&&droppedAck);console.log('PASS: delayed guest startup, lost turn, lost acknowledgement, both players move, matching worlds, initial visibility.');}finally{ta.close();tb.close();}
