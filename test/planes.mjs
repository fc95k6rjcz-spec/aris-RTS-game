import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1200, height: 620 } });
await page.setContent(html);
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => {
  const g = window.game, SUB = 64;
  g.start("none");
  const w = g.world; g.paused = true;
  for (const u of [...w.units()]) w.entities.delete(u.id);
  for (const b of [...w.buildings()]) w.removeEntity(b.id);
  // A strip of grass, forest and water so the planes visibly cross all three.
  for (let y = 14; y < 22; y++) for (let x = 8; x < 34; x++) w.map.set(x, y, x < 16 ? 0 : x < 22 ? 3 : 2);
  const mk = (owner, def, tx, facing) => { const u = w.spawnUnit(owner, def, { x: tx*SUB+32, y: 18*SUB }); u.facing = facing; u.path=[[tx+1,18]]; return u; };
  mk(1, "scout", 10, 4); mk(1, "bomber", 14, 4);
  mk(1, "scout", 19, 2); mk(2, "bomber", 24, 0);
  mk(2, "scout", 29, 6);
  g.cam.zoom = 60; g.cam.centerOn(20*SUB, 18*SUB);
});
await page.waitForTimeout(900);
await page.screenshot({ path: "test/shot-planes.png" });
await browser.close();
