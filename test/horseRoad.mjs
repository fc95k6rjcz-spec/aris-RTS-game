// Screenshot: the dirt cart road and horse-drawn ore wagon between a mine and a Gold Depot.
import { chromium } from "playwright";import { pathToFileURL } from "node:url";import { resolve } from "node:path";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(pathToFileURL(resolve("dist/index.html")).href);
await page.waitForFunction(() => !!window.game);
await page.evaluate(([t, z]) => { window.__ticks = t; window.__zoom = z; }, [Number(process.argv[3] ?? 500), Number(process.env.ZOOM ?? 56)]);
const info=await page.evaluate(() => {
  const g = window.game, SUB = 64;
  Object.assign(g.settingsForTest,{crowning:false,nomad:false,stockade:false,wildlife:false});
  g.start("none");
  const w = g.world; const p = w.players.get(1); p.gold = 99999; p.lumber = 99999;
  const seam=w.map.goldSeams()[0]; const hall=w.buildings().find(b=>b.owner===1&&b.def==='townhall');
  const seams=w.map.goldSeams().sort((a,b)=>Math.hypot(a.x0-hall.tx,a.y0-hall.ty)-Math.hypot(b.x0-hall.tx,b.y0-hall.ty));const s=seams[0];
  let depot=null;for(let r=5;r<14&&!depot;r++)for(let dy=-r;dy<=r&&!depot;dy++)for(let dx=-r;dx<=r&&!depot;dx++){if(Math.abs(dx)<r&&Math.abs(dy)<r)continue;depot=w.placeBuilding(1,'golddepot',s.x0+dx,s.y0+dy,true);}
  const ws = w.units().filter(u => u.def === "worker" && u.owner === 1);
  ws.forEach(u => g.issue({ type: "gather", player: 1, units: [u.id], tx: s.x0, ty: s.y0 }));
  for (let i = 0; i < (window.__ticks ?? 500); i++) g.tick();
  g.cam.zoom = window.__zoom ?? 56; g.cam.centerOn(((s.x0+depot.tx+2)/2) * SUB, ((s.y0+depot.ty+2)/2) * SUB);
  return {s:[s.x0,s.y0],d:[depot.tx,depot.ty],mining:w.units().filter(u=>u.task.kind==='gather').length};
});
await page.waitForTimeout(900);
await page.screenshot({ path: process.argv[2] ?? "test/shot-horse-road.png" });
console.log(JSON.stringify(info), errors);
await browser.close();
