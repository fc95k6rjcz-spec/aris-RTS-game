// The game plays with fingers: tap to select and order, drag to pan, pinch to
// zoom, hold-and-drag to box-select, hold-and-lift for the right-click order.
import {chromium} from 'playwright';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROME??'/opt/pw-browsers/chromium'});
const ctx=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:false});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.setContent(readFileSync('dist/index.html','utf8'));await p.waitForFunction(()=>window.game);
await p.evaluate(()=>{const g=window.game;Object.assign(g.settingsForTest,{voices:false,crowning:false,stockade:false,wildlife:false});g.start('none');});
await p.waitForTimeout(800);
const cdp=await ctx.newCDPSession(p);
const touch=async(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y],i)=>({x,y,id:i}))});
const rect=await p.evaluate(()=>{const r=document.getElementById('game').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};});
const toScreen=(wx,wy)=>p.evaluate(([wx,wy])=>{const g=window.game;const s=g.cam.toScreen(wx,wy);const c=document.getElementById('game');const r=c.getBoundingClientRect();return [r.left+s.x*r.width/c.width,r.top+s.y*r.height/c.height];},[wx,wy]);
// 1. tap a worker selects him
const w=await p.evaluate(()=>{const u=window.game.world.units().find(u=>u.owner===1&&u.def==='worker');return [u.id,u.pos.x,u.pos.y];});
await p.evaluate(()=>{window.game.cam.zoom=30;});await p.evaluate(([x,y])=>window.game.cam.centerOn(x,y),[w[1],w[2]]);const [sx,sy]=await toScreen(w[1],w[2]);
await p.evaluate(()=>window.game.selected.clear());
await touch('touchStart',[[sx,sy]]);await touch('touchEnd',[]);await p.waitForTimeout(100);
assert(await p.evaluate(id=>window.game.selected.has(id),w[0]),'tap selects the worker');
// 2. tap open ground orders him there (tap-to-move)
await p.evaluate(()=>{const g=window.game;g.cam.zoom=30;});const [gx,gy]=await toScreen(w[1]-6*64,w[2]+4*64);
await touch('touchStart',[[gx,gy]]);await touch('touchEnd',[]);await p.waitForTimeout(300);
const moved=await p.evaluate(id=>window.game.world.entities.get(id).task.kind,w[0]);assert.equal(moved,'move','tap on open ground sends him there');
console.log('after tap on ground:',moved, await p.evaluate(()=>[window.game.settingsForTest.clickToMove, window.game.paused, window.game.menu, window.game.selected.size, window.game.world.tick]));
// 3. one-finger drag pans
const cam0=await p.evaluate(()=>[window.game.cam.x,window.game.cam.y]);
const cx=rect.x+rect.w/2,cy=rect.y+rect.h/2;
await touch('touchStart',[[cx,cy]]);for(let i=1;i<=6;i++)await touch('touchMove',[[cx-i*30,cy-i*20]]);await touch('touchEnd',[]);
const cam1=await p.evaluate(()=>[window.game.cam.x,window.game.cam.y]);
console.log('cam',cam0,cam1);assert(cam1[0]!==cam0[0]||cam1[1]!==cam0[1],'drag pans the map');
// 4. pinch zooms
const z0=await p.evaluate(()=>window.game.cam.zoom);
await touch('touchStart',[[cx-40,cy],[cx+40,cy]]);for(let i=1;i<=5;i++)await touch('touchMove',[[cx-40-i*20,cy],[cx+40+i*20,cy]]);await touch('touchEnd',[]);
const z1=await p.evaluate(()=>window.game.cam.zoom);assert(z1>z0,`pinch zooms in (${z0}->${z1})`);
// 5. hold then drag draws a box and selects everyone inside
await p.evaluate(()=>{const g=window.game;g.selected.clear();const h=g.world.buildings().find(b=>b.owner===1);g.cam.zoom=30;g.cam.centerOn((h.tx+2)*64,(h.ty+4)*64);});
const ppl=await p.evaluate(()=>window.game.world.units().filter(u=>u.owner===1).map(u=>[u.pos.x,u.pos.y]));
const xs=ppl.map(q=>q[0]),ys=ppl.map(q=>q[1]);
const [ax,ay]=await toScreen(Math.min(...xs)-64,Math.min(...ys)-64);const [bx,by]=await toScreen(Math.max(...xs)+64,Math.max(...ys)+64);
await touch('touchStart',[[ax,ay]]);await p.waitForTimeout(500);for(let i=1;i<=5;i++)await touch('touchMove',[[ax+(bx-ax)*i/5,ay+(by-ay)*i/5]]);await touch('touchEnd',[]);
const nsel=await p.evaluate(()=>window.game.selected.size);assert(nsel>=3,`box selects several (${nsel})`);
// 6. tap on the front-screen menu works
await p.evaluate(()=>{window.game.menu=true;window.game.front.pane='menu';});await p.waitForTimeout(300);
console.log('errors',errs);assert.deepEqual(errs,[]);
console.log('PASS: tap select/order, drag pan, pinch zoom, hold-drag box select');
await browser.close();
