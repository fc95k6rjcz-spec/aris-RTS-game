// The online realm: a 320-tile ocean world where every newcomer lands on walkable
// ground, and explored ground nobody watches fades back to black.
import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({stdin:{contents:"export {World,Faction,WILD} from './src/sim/world'; export {UNEXPLORED,EXPLORED,VISIBLE} from './src/sim/vision';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const {World,Faction,WILD,UNEXPLORED,EXPLORED,VISIBLE}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const N=320;

// The board: real oceans, one walkable mainland holding every gold seam.
for (const seed of [7927, 424242]) {
  const w=new World(N,N,seed,'realm',1,false);const m=w.map;
  let water=0;for(let i=0;i<N*N;i++)if(m.tiles[i]===2||m.tiles[i]===6)water++;
  assert(water/(N*N)>0.35&&water/(N*N)<0.55,'nearly half the realm is sea');
  const seen=new Uint8Array(N*N),st=[m.starts[0].y*N+m.starts[0].x];seen[st[0]]=1;
  while(st.length){const k=st.pop(),x=k%N,y=(k/N)|0;for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){if(nx<0||ny<0||nx>=N||ny>=N)continue;const j=ny*N+nx;if(!seen[j]&&m.isWalkable(nx,ny,'land')){seen[j]=1;st.push(j);}}}
  let seams=0;for(let i=0;i<N*N;i++){if(m.tiles[i]!==4||m.tiles[i-1]===4||m.tiles[i-N]===4)continue;seams++;const x=i%N,y=(i/N)|0;assert([[-1,0],[0,-1],[3,0],[0,3],[-1,1],[1,-1]].some(([dx,dy])=>seen[(y+dy)*N+x+dx]),'every gold seam can be walked to');}
  assert(seams>=60,'plenty of gold for dozens of towns');
  assert(seen[m.starts[1].y*N+m.starts[1].x],'the two fallback seats share a landmass');
}

// Newcomers: a dozen arrivals all seated on the mainland, none in the sea.
{const w=new World(N,N,7927,'realm',1,false);w.realm=true;w.addPlayer(WILD,Faction.Human,'#8a6b3f');
 for(let i=0;i<12;i++){const id=w.claimSeat('peer'+i);assert(id!==null);const u=w.units().find(u=>u.owner===id);assert(u,'arrival has a man');assert(w.map.isWalkable(Math.floor(u.pos.x/64),Math.floor(u.pos.y/64),'land'),'arrival stands on land');}}

// Fading fog: ground unseen for the memory limit goes black; what is in sight stays lit.
{const w=new World(64,64,5,'plains',1,false);w.addPlayer(1,Faction.Human,'blue');w.fogMemoryMinutes=2;
 const scout=w.spawnUnit(1,'footman',{x:10.5*64,y:10.5*64});w.updateVision(true);const v=w.vision.get(1);
 assert.equal(v.at(10,10),VISIBLE);
 scout.pos={x:50.5*64,y:50.5*64};scout.task={kind:'idle'};
 for(let t=0;t<60*20;t++)w.step([]);
 assert.equal(v.at(10,10),EXPLORED,'remembered for a while');
 for(let t=0;t<2*60*20;t++)w.step([]);
 assert.equal(v.at(10,10),UNEXPLORED,'forgotten after two unwatched minutes');
 assert.equal(v.at(50,50),VISIBLE,'what the scout is looking at is never forgotten');
 // Skirmish worlds (no memory limit) keep what they explored.
 const s=new World(64,64,5,'plains',1,false);s.addPlayer(1,Faction.Human,'blue');const u=s.spawnUnit(1,'footman',{x:10.5*64,y:10.5*64});s.updateVision(true);
 u.pos={x:50.5*64,y:50.5*64};for(let t=0;t<4*60*20;t++)s.step([]);assert.equal(s.vision.get(1).at(10,10),EXPLORED);}

console.log('PASS: 320-tile ocean realm, walkable seams and arrivals, fading fog of war');
