import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.setContent(readFileSync("dist/index.html", "utf8"));
  await page.waitForFunction(() => window.game && window.rts);
  await page.evaluate(() => {
    const g = window.game;
    g.settingsForTest.crowning = false; g.settingsForTest.wildlife = false;
    g.settingsForTest.stockade = false; g.start("none"); g.tick = () => {};
    const w = g.world;
    w.fogEnabled = false; w.tick = 1200;
    for (const e of [...w.entities.values()]) w.removeEntity(e.id);
    for (let y = 0; y < w.map.height; y++) for (let x = 0; x < w.map.width; x++) w.map.set(x,y,0);
    for (let i = 0; i < 10; i++) {
      const b = w.placeBuilding(1, "gryphonaviary", 8 + (i % 5) * 9, 12 + Math.floor(i / 5) * 14, true);
      b.level = i + 1;
    }
    const worker = w.spawnUnit(1, "worker", { x: 25 * 64, y: 35 * 64 });
    g.selected = new Set([worker.id]); g.tab = "advanced";
    g.cam.zoom = 29; g.cam.centerOn(28 * 64, 20 * 64);
  });
  await page.waitForTimeout(1100);
  const card = await page.locator(".rv-tile").filter({ hasText: "Gryphon Aviary" }).evaluate(el => getComputedStyle(el).backgroundImage);
  assert(card.includes("data:image/png"));
  assert.deepEqual(errors, []);
  mkdirSync("test/artifacts", { recursive: true });
  await page.screenshot({ path: "test/artifacts/gryphon-aviary-tiers.png" });
  console.log("PASS: ten Aviary tiers render and its build card uses the supplied painting");
} finally { await browser.close(); }
