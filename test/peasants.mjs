import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
await page.setContent(html);
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => {
  const g = window.game, SUB = 64;
  g.start("none");
  const w = g.world; g.paused = true;
  for (let y = 14; y < 20; y++) for (let x = 12; x < 32; x++) { w.map.set(x, y, 0); w.map.occupant[w.map.idx(x,y)] = 0; }
  const mk = (owner, def, tx, opts = {}) => { const u = w.spawnUnit(owner, def, { x: tx*SUB+32, y: 17*SUB+32 }); Object.assign(u, opts); return u; };
  mk(1, "worker", 13);                                                                 // classic idle
  mk(1, "worker", 15, { task: { kind: "move", target: {x:0,y:0} }, path: [[16,17]], facing: 4 });   // villager walking right
  mk(1, "worker", 17, { task: { kind: "gather", tx:0, ty:0, resource: "lumber", phase: "harvest", timer: 9 } }); // woodcutter
  mk(1, "worker", 19, { task: { kind: "gather", tx:0, ty:0, resource: "gold", phase: "harvest", timer: 9 } });   // farmhand
  mk(1, "worker", 21, { task: { kind: "gather", tx:0, ty:0, resource: "gold", phase: "toDrop", timer: 0 }, carrying: {resource:"gold",amount:10}, path: [[20,17]], facing: 0 }); // cart
  mk(1, "worker", 23, { task: { kind: "build", building: 1 } });                         // builder
  mk(1, "worker", 25, { task: { kind: "move", target: {x:0,y:0} }, path: [[25,16]], facing: 2 }); // back view walking up
  mk(2, "worker", 27);                                                                 // enemy tint
  mk(2, "worker", 29, { task: { kind: "build", building: 1 } });
  g.cam.zoom = 56; g.cam.centerOn(21*SUB, 17*SUB);
  g.select([w.units().find(u => u.pos.x > 12*SUB).id]);
});
await page.waitForTimeout(800);
await page.screenshot({ path: "test/shot-peasants.png" });
await browser.close();
