import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
await page.setContent(html);
await page.waitForFunction(() => !!window.game);
await page.waitForTimeout(900);
await page.screenshot({ path: "test/shot-start.png" });
// Command card with a worker selected, now text-only.
await page.evaluate(() => {
  const g = window.game;
  g.start("none");
  const w = g.world;
  const p = w.players.get(1); p.gold = 99999; p.lumber = 99999; p.oil = 9999;
  g.select([w.units().find(u => u.def === "worker" && u.owner === 1).id]);
  g.paused = true;
});
await page.waitForTimeout(500);
await page.screenshot({ path: "test/shot-card2.png" });
await browser.close();
