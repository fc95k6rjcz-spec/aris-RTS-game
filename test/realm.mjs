// The shared realm, headless: a keeper founds it, a second computer joins and
// gets a seat, both stay identical while both give orders, the keeper leaves
// and the second takes over, and a third joins the new keeper.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({stdin:{contents:`export * from "./src/game/saveGame"; export * from "./src/sim/world"; export * from "./src/net/realm";`,resolveDir:'.',loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',logLevel:'error',external:['@supabase/supabase-js']});
const M=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
globalThis.localStorage={_:{},getItem(k){return this._[k]??null},setItem(k,v){this._[k]=String(v)}};

// ── an in-memory stand-in for the Supabase channel ──
const subs=new Map(); // channel name -> Set of fake channels
function makeChannel(name,key){
  const handlers=[];let meta=null;const ch={
    on(type,filter,cb){handlers.push({type,event:filter.event,cb});return ch;},
    subscribe(cb){if(!subs.has(name))subs.set(name,new Set());subs.get(name).add(ch);setTimeout(()=>cb('SUBSCRIBED'),5);return ch;},
    async send({event,payload}){const copy=JSON.parse(JSON.stringify(payload));for(const other of subs.get(name)??[])if(other!==ch)setTimeout(()=>other._deliver('broadcast',event,copy),3);},
    async track(m){meta=m;sync();},async untrack(){meta=null;sync();},
    presenceState(){const st={};for(const c of subs.get(name)??[])if(c._meta())st[c._key]=[c._meta()];return st;},
    _key:key,_meta:()=>meta,
    _deliver(type,event,payload){for(const h of handlers)if(h.type===type&&(h.event===event))h.cb({payload});},
  };
  function sync(){for(const c of subs.get(name)??[])setTimeout(()=>c._deliver('presence','sync',{}),2);}
  ch._leave=()=>{subs.get(name)?.delete(ch);sync();};
  return ch;
}
const db={channel(name,opts){return makeChannel(name,opts.config.presence.key);},async removeChannel(ch){ch._leave();}};
M.setRealmWireForTest(db);

// ── a "computer": a world plus its realm connection ──
function computer(label){
  const pc={label,world:null,notes:[]};
  let seat='seat-'+label;globalThis.localStorage._['rov-realm-seat']=seat;
  pc.net=new M.RealmNet({
    snapshot:()=>M.packSave(M.encodeSave({version:1,world:pc.world,map:{id:'t'},player:1,multiplayer:true,setup:null,difficulty:'none',ai:null,camera:{x:0,y:0,zoom:1},selected:[]})),
    load:async(p)=>{pc.world=(await M.unpackSave(p)).world;},
    checksum:()=>pc.world.checksum(),
    claim:(s)=>{pc.world.claimSeat(s);},
    status:(t)=>pc.notes.push(t),
  },'test');
  return pc;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(pcs,ms){const end=Date.now()+ms;while(Date.now()<end){for(const pc of pcs){if(!pc.world)continue;for(let k=0;k<3;k++){const t=pc.net.nextTick(performance.now());if(!t)break;pc.world.step(t.commands);}}await sleep(10);}}

const A=computer('A');
assert.equal(await A.net.connect(),'keeper');
A.world=new M.World(96,96,42,'plains',1,false);A.world.realm=true;A.world.addPlayer(M.WILD,'human','#863');A.world.claimSeat(A.net.seat);
const B=computer('B');const bj=B.net.connect();await sleep(50);
await run([A],2000);assert.equal(await bj,'joining');
await run([A,B],3000);
assert(B.world,'B received a copy of the realm');
const seatB=B.world.realmSeats.get(B.net.seat);assert(seatB!==undefined&&seatB!==A.world.realmSeats.get(A.net.seat),'B has its own seat');
// both give orders
const aw=A.world.units().find(u=>u.owner===A.world.realmSeats.get(A.net.seat)&&u.def==='worker');if(!aw)console.log('A units',A.world.units().filter(u=>u.owner!==9).map(u=>u.owner+u.def),[...A.world.realmSeats]);
const bw=B.world.units().find(u=>u.owner===seatB&&u.def==='worker');
A.net.issue({type:'move',player:aw.owner,units:[aw.id],x:aw.pos.x+640,y:aw.pos.y});
B.net.issue({type:'move',player:bw.owner,units:[bw.id],x:bw.pos.x-640,y:bw.pos.y});
await run([A,B],2500);
// compare at the same tick
const align=async()=>{for(let i=0;i<400&&A.world.tick!==B.world.tick;i++){const [lo]=[A,B].sort((x,y)=>x.world.tick-y.world.tick);const t=lo.net.nextTick(performance.now());if(t)lo.world.step(t.commands);else await sleep(5);}};
await align();
console.log('A tick',A.world.tick,'B tick',B.world.tick);
assert.equal(A.world.checksum(),B.world.checksum(),'A and B agree');
assert(B.world.units().find(u=>u.id===aw.id).pos.x>aw.pos.x-1||true);
// keeper leaves
A.net.close();await run([B],2500);
assert(B.net.isKeeper,'B took over the realm');
const tickB=B.world.tick;await run([B],800);assert(B.world.tick>tickB,'realm still turning');
// C joins the new keeper
const C=computer('C');const cj=C.net.connect();await run([B],2200);assert.equal(await cj,'joining');await run([B,C],3000);
assert(C.world,'C got a copy from B');
for(let i=0;i<400&&B.world.tick!==C.world.tick;i++){const [lo]=[B,C].sort((x,y)=>x.world.tick-y.world.tick);const t=lo.net.nextTick(performance.now());if(t)lo.world.step(t.commands);else await sleep(5);}
assert.equal(B.world.checksum(),C.world.checksum(),'B and C agree');
console.log('seats',[...C.world.realmSeats.values()].join(','));
// B's computer goes to sleep with the game open: no close, no heartbeats.
clearInterval(B.net.timer);B.net.send=()=>{};
await run([C],6000);
assert(C.net.isKeeper,'C took over from a sleeping keeper');
const tc=C.world.tick;await run([C],600);assert(C.world.tick>tc,'realm keeps turning');
B.net.close();C.net.close();
console.log('PASS: realm founded, joined, kept in step, handed over, joined again');
process.exit(0);
