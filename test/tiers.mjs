import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1400, height: 720 } });
await page.setContent(html);
await page.waitForFunction(() => !!window.game);
const DEF = process.env.DEF || "townhall";
await page.evaluate((DEF) => {
  const g = window.game, SUB = 64;
  g.start("none");
  const w = g.world; g.paused = true;
  for (let y = 10; y < 30; y++) for (let x = 4; x < 60; x++) { w.map.set(x, y, 0); w.map.occupant[w.map.idx(x,y)] = 0; }
  for (const u of [...w.units()]) w.entities.delete(u.id);
  for (const b of [...w.buildings()]) w.removeEntity(b.id);
  // Two rows of five halls, levels 1..10
  const def = DEF;
  let lvl = 1;
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 5; c++) {
      const b = w.placeBuilding(1, def, 8 + c * 6, 13 + r * 7, true);
      b.level = lvl; b.maxHp = 9999; b.hp = 9999; lvl++;
    }
  g.cam.zoom = 40; g.cam.centerOn(22 * SUB, 19.2 * SUB);
}, DEF);
await page.waitForTimeout(900);
await page.screenshot({ path: `test/shot-tiers-${process.env.DEF || "townhall"}.png` });
// Close-up of a level 10 hall with the upgrade UI
await page.evaluate(() => {
  const g = window.game, w = g.world, SUB = 64;
  const b = w.buildings().find(b => b.level === 8);
  g.cam.zoom = 64; g.cam.centerOn((b.tx + 2) * SUB, (b.ty + 2) * SUB);
  g.select([b.id]);
});
await page.waitForTimeout(500);
await page.screenshot({ path: `test/shot-tier-ui-${process.env.DEF || "townhall"}.png` });
await browser.close();
