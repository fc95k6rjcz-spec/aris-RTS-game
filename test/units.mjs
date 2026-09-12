import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
await page.setContent(html);
await page.waitForFunction(() => !!window.game);
await page.screenshot({ path: "test/shot-menu.png" });
await page.evaluate(() => {
  const g = window.game, SUB = 64;
  g.start("none");
  const w = g.world;
  // Line up: peon idle, peon walking, peon w/ gold, peon w/ lumber, peasant (enemy colour), grunt, spearthrower
  for (let y = 14; y < 20; y++) for (let x = 14; x < 30; x++) { w.map.set(x, y, 0); w.map.occupant[w.map.idx(x,y)] = 0; }
  const mk = (owner, def, tx, opts = {}) => { const u = w.spawnUnit(owner, def, { x: tx*SUB+32, y: 17*SUB+32 }); Object.assign(u, opts); return u; };
  mk(1, "worker", 15);
  mk(1, "worker", 17, { path: [[18,17]], facing: 4 });
  mk(1, "worker", 19, { carrying: { resource: "gold", amount: 10 }, facing: 0 });
  mk(1, "worker", 21, { carrying: { resource: "lumber", amount: 10 } });
  mk(2, "worker", 23);
  mk(1, "footman", 25);
  mk(1, "archer", 27);
  g.cam.zoom = 64; g.cam.centerOn(21*SUB, 17*SUB);
  g.select([w.units().find(u => u.def === "worker" && u.owner === 1).id]);
});
await page.waitForTimeout(400);
await page.screenshot({ path: "test/shot-units.png" });
await browser.close();
