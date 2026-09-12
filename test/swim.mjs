import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
await page.setContent(html);
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => {
  const g = window.game, SUB = 64;
  g.start("none");
  const w = g.world;
  const ws = w.units().filter(u => u.def === "worker" && u.owner === 1);
  // Line several peasants up mid-swim across the lake.
  ws.forEach((u, i) => {
    u.task = { kind: "idle" }; u.path = [];
    u.pos = { x: (26 + i * 2) * SUB, y: (30 + i) * SUB };
    if (i % 2) u.carrying = { resource: i % 4 ? "lumber" : "gold", amount: 10 };
  });
  ws.forEach(u => g.issue({ type: "move", player: 1, units: [u.id], x: 38 * SUB, y: 32 * SUB }));
  for (let i = 0; i < 260; i++) g.tick();
  g.cam.zoom = 52; g.cam.centerOn(32 * SUB, 32 * SUB);
  g.paused = true;
});
await page.waitForTimeout(700);
await page.screenshot({ path: "test/shot-swim.png" });
await browser.close();
