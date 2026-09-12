import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
await page.setContent(html);
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => {
  const g = window.game, w = g.world, SUB = 64;
  const p = w.players.get(1); p.gold = 9999; p.lumber = 9999;
  // clear a strip of land and add water under it for the shipyard
  for (let y = 16; y < 24; y++) for (let x = 12; x < 34; x++) { w.map.set(x, y, 0); w.map.occupant[w.map.idx(x,y)] = 0; }
  for (let y = 22; y < 24; y++) for (let x = 26; x < 34; x++) w.map.set(x, y, 2);
  w.placeBuilding(1, "townhall", 13, 17, true);
  w.placeBuilding(1, "lumbermill", 18, 18, true);
  w.placeBuilding(1, "barracks", 22, 18, true);
  const sy = w.placeBuilding(1, "shipyard", 27, 19, true);
  const uc = w.placeBuilding(1, "barracks", 31, 18, false); uc.progress = 20*45*0.55; uc.hp = 400;
  const boat = w.spawnUnit(1, "longboat", { x: 30*SUB+32, y: 22*SUB+32 });
  g.cam.zoom = 44; g.cam.centerOn(23.5*SUB, 20.5*SUB);
  g.select([sy.id]);
});
await page.waitForTimeout(1500);
await page.screenshot({ path: "test/shot-gallery.png" });
await browser.close();
