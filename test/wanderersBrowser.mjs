import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
  const p=await browser.newPage({viewport:{width:1440,height:950}}), errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
  await p.waitForFunction(()=>window.game&&window.rts);
  const result=await p.evaluate(()=>{
    const g=window.game;
    Object.assign(g.settingsForTest,{voices:false,crowning:false,stockade:false,wildlife:true,edgeScroll:false,mapId:'random'});
    g.start('none'); g.tick=()=>{};
    const w=g.world, bands=w.units().filter(u=>u.recruitBand!==undefined);
    if (!bands.length) throw new Error('No wanderers on generated map');
    w.fogEnabled=false; g.cam.zoom=50; g.cam.centerOn(bands[0].pos.x,bands[0].pos.y);
    return {bands:bands.length};
  });
  await p.waitForTimeout(1200);
  await p.screenshot({path:'test/artifacts/wanderers.png'});
  const joined=await p.evaluate(()=>{
    const w=window.game.world, member=w.units().find(u=>u.recruitBand!==undefined);
    const band=member.recruitBand, king=w.units().find(u=>u.owner===1&&u.def==='king');
    king.pos={...member.pos}; w.tick=20; w.step([]);
    return {count:w.units().filter(u=>u.owner===1&&['footman','archer'].includes(u.def)).length,remaining:w.units().filter(u=>u.recruitBand===band).length};
  });
  assert(joined.count>=2); assert.equal(joined.remaining,0); assert.deepEqual(errors,[]);
  console.log('PASS rendered wanderers and king recruitment',result,joined);
} finally {await browser.close();}
