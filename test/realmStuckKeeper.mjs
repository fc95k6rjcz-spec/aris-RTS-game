// A keeper whose game loop is paused (e.g. a background tab) still sends
// heartbeats but never hands out a copy of the realm. A newcomer must give up
// waiting and play its own copy instead of hanging on the menu forever.
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
// A keeps the realm but its game loop is paused (a background tab): it still
// sends heartbeats, yet never writes a turn or hands out a copy.
const A=computer('A');
assert.equal(await A.net.connect(),'keeper');
A.world=new M.World(64,64,42,'plains',1,false);A.world.realm=true;A.world.addPlayer(M.WILD,'human','#863');A.world.claimSeat(A.net.seat);
// B arrives, asks A for a copy, and must not wait forever.
let alone=false;
const B2={notes:[]};
globalThis.localStorage._['rov-realm-seat']='seat-B2';
B2.net=new M.RealmNet({snapshot:async()=>'',load:async()=>{},checksum:()=>0,claim:()=>{},status:t=>B2.notes.push(t),alone:()=>{alone=true;}},'test');
const t0=Date.now();
assert.equal(await B2.net.connect(),'joining','B sees A and asks to join');
for(let i=0;i<250&&!alone;i++) await sleep(100);
assert(alone,'B gave up waiting and was told to play its own copy');
assert(B2.net.isKeeper,'B keeps the realm itself');
const waited=(Date.now()-t0)/1000;
assert(waited<25,'gave up in reasonable time ('+waited.toFixed(1)+'s)');
console.log('B waited',waited.toFixed(1)+'s; notes:',B2.notes.join(' | '));
A.net.close();B2.net.close();
console.log('PASS: a paused keeper no longer leaves newcomers stuck on the menu');
process.exit(0);
