import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.setContent(html);
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => {
  const g = window.game, SUB = 64;
  g.start("none");
  const w = g.world;
  const p = w.players.get(1); p.gold = 99999; p.lumber = 99999;
  // Depot placed a short haul from the starting mine, with workers on the ore.
  const depot = w.placeBuilding(1, "golddepot", 8, 14, true);
  const ws = w.units().filter(u => u.def === "worker" && u.owner === 1);
  ws.forEach(u => g.issue({ type: "gather", player: 1, units: [u.id], tx: 5, ty: 10 }));
  for (let i = 0; i < 600; i++) g.tick();
  g.cam.zoom = 40; g.cam.centerOn(7 * SUB, 12 * SUB);
});
await page.waitForTimeout(700);
await page.screenshot({ path: "test/shot-rail.png" });
await browser.close();
