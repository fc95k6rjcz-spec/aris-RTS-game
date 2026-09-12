import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
await page.setContent(html);
await page.waitForFunction(() => !!window.game);
const shot = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: `test/shot-secret-${name}.png` }); };
await page.evaluate(() => {
  const g = window.game, SUB = 64;
  g.start("none");
  const w = g.world;
  const s = w.map.secret;
  g.cam.zoom = 46; g.cam.centerOn((s.x + 1) * SUB, (s.y + 1) * SUB);
  g.paused = true;
});
await shot("before");
await page.evaluate(() => {
  const g = window.game, w = g.world, SUB = 64;
  const s = w.map.secret;
  const u = w.units().find(x => x.def === "worker" && x.owner === 1);
  u.task = { kind: "idle" }; u.path = [];
  u.pos = { x: (s.x + 1) * SUB, y: (s.y + 4) * SUB };
  g.paused = false;
  for (let i = 0; i < 12; i++) g.tick();
  g.paused = true;
});
await shot("after");
await browser.close();
