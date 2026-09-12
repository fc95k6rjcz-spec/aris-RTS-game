import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.setContent(html);
await page.waitForFunction(() => !!window.game);
await page.evaluate(async () => {
  const g = window.game, SUB = 64;
  g.start("none");
  const w = g.world;
  const p = w.players.get(1); p.gold = 99999; p.lumber = 99999; p.oil = 9999;
  const ws = w.units().filter(u => u.def === "worker" && u.owner === 1);
  // A believable base near the start position.
  const place = (def, tx, ty, lvl) => { const b = w.placeBuilding(1, def, tx, ty, true); if (b && lvl) b.level = lvl; return b; };
  place("farm", 6, 14, 2); place("barracks", 14, 9, 3); place("lumbermill", 5, 6, 2);
  place("church", 15, 14, 2); place("tower", 13, 6, 3);
  for (let i = 0; i < 6; i++) w.spawnUnit(1, "footman", { x: (13 + i * 0.8) * SUB, y: 13 * SUB });
  w.spawnUnit(1, "knight", { x: 12 * SUB, y: 15 * SUB });
  // Workers actually gathering.
  g.issue({ type: "gather", player: 1, units: [ws[0].id, ws[1].id], tx: 5, ty: 10 });
  for (let i = 0; i < 400; i++) g.tick();
  g.cam.zoom = 40; g.cam.centerOn(11 * SUB, 11 * SUB);
});
await page.waitForTimeout(600);
await page.screenshot({ path: "test/shot-look.png" });
await page.evaluate(() => { window.game.cam.zoom = 26; });
await page.waitForTimeout(400);
await page.screenshot({ path: "test/shot-look-far.png" });
await browser.close();
