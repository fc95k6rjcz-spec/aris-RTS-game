import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1200, height: 720 } });
await page.setContent(html);
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => {
  const g = window.game;
  // Plain ground: this test plants a mill on fixed tiles.
  g.settingsForTest.stockade = false;
  g.start("none");
  const w = g.world;
  const p = w.players.get(1); p.gold = 99999; p.lumber = 99999;
  // Find open ground near the seat rather than trusting fixed tiles: the board
  // is 160 tiles now and the old spot is under the Town Hall.
  const seat = w.map.starts[0];
  let mill = null;
  for (let r = 3; r < 9 && !mill; r++)
    for (let dy = -r; dy <= r && !mill; dy++)
      for (let dx = -r; dx <= r && !mill; dx++) mill = w.placeBuilding(1, "lumbermill", seat.x + dx, seat.y + dy, true);
  g.issue({ type: "research", player: 1, building: mill.id, upgrade: "barding" });
  for (let i = 0; i < 300; i++) g.tick();
  g.select([mill.id]);
  g.cam.zoom = 40; g.cam.centerOn(15 * 64, 13 * 64);
  g.paused = true;
});
await page.waitForTimeout(600);
await page.screenshot({ path: "test/shot-research.png" });
await browser.close();
