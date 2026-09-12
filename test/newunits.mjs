import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.setContent(html);
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => {
  const g = window.game, SUB = 64;
  g.start("none");
  const w = g.world;
  const p = w.players.get(1); p.gold = 99999; p.lumber = 99999;
  for (let y = 14; y < 22; y++) for (let x = 10; x < 34; x++) w.map.set(x, y, 0);
  // Archers in each facing, then a pair of ballistae.
  [6, 4, 2, 0].forEach((f, i) => {
    const u = w.spawnUnit(1, "archer", { x: (12 + i * 2.2) * SUB, y: 17 * SUB });
    u.facing = f;
  });
  const b1 = w.spawnUnit(1, "ballista", { x: 22 * SUB, y: 17 * SUB }); b1.facing = 4;
  const b2 = w.spawnUnit(2, "ballista", { x: 26 * SUB, y: 17 * SUB }); b2.facing = 4; b2.path = [[27,17]];
  const e = w.spawnUnit(2, "archer", { x: 30 * SUB, y: 17 * SUB }); e.facing = 6;
  g.cam.zoom = 56; g.cam.centerOn(21 * SUB, 17 * SUB);
  g.paused = true;
});
await page.waitForTimeout(700);
await page.screenshot({ path: "test/shot-newunits.png" });
// And the 3x5 command card with a worker selected.
await page.evaluate(() => {
  const g = window.game, w = g.world;
  g.paused = false;
  g.select([w.units().find(u => u.def === "worker" && u.owner === 1).id]);
  g.paused = true;
});
await page.waitForTimeout(400);
await page.screenshot({ path: "test/shot-card35.png" });
await browser.close();
