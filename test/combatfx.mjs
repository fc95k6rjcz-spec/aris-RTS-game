import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

// Two lines of footmen facing each other on cleared ground.
await page.evaluate(() => {
  const g = window.game, SUB = 64;
  g.start("none");
  const w = g.world;
  for (let y = 14; y < 22; y++) for (let x = 10; x < 34; x++) w.map.set(x, y, 0);
  for (let i = 0; i < 4; i++) {
    // One tile apart: within a footman's reach, so they trade blows immediately
    // rather than standing off and only fighting once separation nudges them in.
    w.spawnUnit(1, "footman", { x: 19 * SUB, y: (16 + i) * SUB }).facing = 4;
    w.spawnUnit(2, "footman", { x: 20 * SUB, y: (16 + i) * SUB }).facing = 0;
  }
  w.spawnUnit(1, "archer", { x: 16 * SUB, y: 18 * SUB }).facing = 4;
  g.cam.zoom = 52; g.cam.centerOn(20 * SUB, 18 * SUB);
});

// Collect what the sim reports over a few seconds of fighting.
const seen = await page.evaluate(async () => {
  const g = window.game, kinds = {};
  for (let i = 0; i < 700; i++) {
    g.tick();
    for (const e of g.world.fx) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    if (i % 20 === 0) await new Promise((r) => setTimeout(r, 1));
  }
  return kinds;
});
console.log("sim fx:", JSON.stringify(seen));
for (const need of ["attack", "hit", "death"]) {
  if (!seen[need]) throw new Error(`no ${need} events fired`);
}

// Freeze one frame a couple of ticks after a swing so the lunge and slash show.
await page.evaluate(() => {
  const g = window.game, w = g.world, SUB = 64;
  // The measuring run above fought the first battle to its end, so the frame we
  // want to look at needs fresh combatants.
  for (let i = 0; i < 4; i++) {
    w.spawnUnit(1, "footman", { x: 19 * SUB, y: (16 + i) * SUB }).facing = 4;
    w.spawnUnit(2, "footman", { x: 20 * SUB, y: (16 + i) * SUB }).facing = 0;
  }
  // Step until a melee swing lands, then one more tick: the lunge is near its
  // peak and the arc has not faded. Freezing on an arbitrary tick usually
  // catches everyone on cooldown, which is what a still of a battle should not
  // look like.
  for (let i = 0; i < 400; i++) {
    g.tick();
    if (g.world.fx.some((e) => e.kind === "attack" && !e.ranged)) { g.tick(); break; }
  }
  g.paused = true;
});
await page.waitForTimeout(400);
await page.screenshot({ path: "test/shot-combat.png" });
console.log("(screenshot also shows the rolled damage numbers)");

// Audio must degrade quietly when the browser refuses to start it.
const audioOk = await page.evaluate(() => {
  try { window.game.tick(); return "no throw"; } catch (e) { return "threw: " + e.message; }
});
console.log("audio with no gesture:", audioOk);
await browser.close();
