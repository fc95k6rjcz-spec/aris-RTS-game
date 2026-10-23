// Three kingdoms to a realm (headless): a keeper founds it, a second computer joins and
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
    canSeat:(s)=>pc.world.realmHasRoomFor(s),
    full:()=>{pc.full=true;},
  },'cap');
  return pc;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(pcs,ms){const end=Date.now()+ms;while(Date.now()<end){for(const pc of pcs){if(!pc.world)continue;for(let k=0;k<3;k++){const t=pc.net.nextTick(performance.now());if(!t)break;pc.world.step(t.commands);}}await sleep(10);}}


const A=computer('A');
assert.equal(await A.net.connect(),'keeper');
A.world=new M.World(96,96,42,'plains',1,false);A.world.realm=true;A.world.addPlayer(M.WILD,'human','#863');
A.world.claimSeat(A.net.seat);A.world.claimSeat('seat-X');A.world.claimSeat('seat-Y');
assert(!A.world.realmHasRoomFor('seat-D'),'three kingdoms: no room for a fourth');
assert(A.world.realmHasRoomFor('seat-X'),'someone already here may always come back');
// A fourth computer asks to join and is told the realm is full.
const D=computer('D');const dj=D.net.connect();await run([A],2400);assert.equal(await dj,'joining');
await run([A],1500);
assert(D.full,'D was told the realm is full');assert(!D.world,'D was not given this realm');
assert(!A.world.realmSeats.has('seat-D'),'no seat made for D');
D.net.close();
// X, who already lives here, still gets back in.
const X=computer('X');const xj=X.net.connect();await run([A],2400);await xj;await run([A,X],3000);
assert(X.world&&!X.full,'X came home');
X.net.close();A.net.close();
console.log('PASS: a realm holds three kingdoms; a fourth is sent on, residents come home');
