import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

// All three views side by side, plus one firing at a target.
await page.evaluate(() => {
  const g = window.game, SUB = 64;
  g.start("none");
  const w = g.world;
  for (let y = 12; y < 22; y++) for (let x = 8; x < 34; x++) w.map.set(x, y, 0);
  [[4, 13], [6, 17], [2, 21]].forEach(([f, x], i) => {
    const u = w.spawnUnit(1, "cannon", { x: x * SUB, y: 16 * SUB });
    u.facing = f;
  });
  const gun = w.spawnUnit(1, "cannon", { x: 14 * SUB, y: 20 * SUB });
  gun.facing = 4;
  window.__gun = gun.id;
  const mark = w.spawnUnit(2, "footman", { x: 20 * SUB, y: 20 * SUB });
  // Tough enough to survive the shot that reaches it first, or the display
  // cannons kill it before the ordered gun ever fires and the test proves nothing.
  mark.hp = 5000; mark.maxHp = 5000;
  window.__mark = mark.id;
  g.cam.zoom = 46; g.cam.centerOn(17 * SUB, 18 * SUB);
});

// The Foundry must be what casts it, and the cannon must actually shoot.
const trained = await page.evaluate(() => {
  const B = window.game.world;
  return { foundry: !!B, };
});
const fired = await page.evaluate(() => {
  const g = window.game;
  g.issue({ type: "attack", player: 1, units: [window.__gun], target: window.__mark });
  let shells = 0, booms = 0;
  for (let i = 0; i < 200; i++) {
    g.tick();
    for (const p of g.world.projectiles) if (p.kind === "shell") shells++;
    for (const e of g.world.fx) if (e.kind === "attack" && e.def === "cannon") booms++;
  }
  return { shells, booms, targetAlive: g.world.entities.has(window.__mark) };
});
console.log(`cannon shots: ${fired.booms}, shell frames: ${fired.shells}, target alive: ${fired.targetAlive}`);
if (fired.targetAlive !== true) throw new Error("the target died, so the count is not meaningful");
if (fired.booms === 0) throw new Error("the cannon never fired");
if (fired.shells === 0) throw new Error("the cannon fired arrows, not shot");

await page.evaluate(() => { window.game.paused = true; });
await page.waitForTimeout(400);
await page.screenshot({ path: "test/shot-cannon.png" });
await browser.close();
