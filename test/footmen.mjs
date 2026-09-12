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
  const w = g.world;
  for (let y = 14; y < 22; y++) for (let x = 10; x < 34; x++) w.map.set(x, y, 0);
  // One of each facing, plus a red enemy pair for the tint.
  const facings = [6, 4, 2, 0, 5, 3];
  facings.forEach((f, i) => {
    const u = w.spawnUnit(1, "footman", { x: (12 + i * 2.4) * SUB, y: 18 * SUB });
    u.facing = f;
    if (i % 2) u.path = [[13 + i * 2, 18]];
  });
  const e1 = w.spawnUnit(2, "footman", { x: 27 * SUB, y: 18 * SUB }); e1.facing = 6;
  const e2 = w.spawnUnit(2, "footman", { x: 29.5 * SUB, y: 18 * SUB }); e2.facing = 4;
  g.cam.zoom = 56; g.cam.centerOn(21 * SUB, 18 * SUB);
  g.paused = true;
});
await page.waitForTimeout(700);
await page.screenshot({ path: "test/shot-footmen.png" });
await browser.close();
