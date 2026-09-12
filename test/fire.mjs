import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

// Four halls at four levels of damage, so the fire can be seen growing.
await page.evaluate(() => {
  const g = window.game;
  g.settingsForTest.nomad = false;
  g.start("none");
  const w = g.world, SUB = 64;
  for (const b of [...w.buildings()]) w.removeEntity(b.id);
  for (const u of [...w.units()]) w.removeEntity(u.id);
  for (let y = 10; y < 30; y++) for (let x = 6; x < 46; x++) w.map.set(x, y, 0);
  [1, 0.55, 0.3, 0.08].forEach((frac, i) => {
    const b = w.placeBuilding(1, "barracks", 9 + i * 8, 16, true);
    b.hp = Math.max(1, Math.round(b.maxHp * frac));
  });
  g.cam.zoom = 38;
  g.cam.centerOn(21 * SUB, 17 * SUB);
});
await page.waitForTimeout(700);

// The fire is painted, so prove it by counting warm pixels over each building.
const warmth = await page.evaluate(() => {
  const g = window.game, ctx = g.canvas.getContext("2d");
  const out = [];
  for (let i = 0; i < 4; i++) {
    const p = g.cam.toScreen((9 + i * 8) * 64, 16 * 64);
    const d = ctx.getImageData(Math.round(p.x) - 20, Math.round(p.y) - 60, 140, 120).data;
    let hot = 0;
    for (let j = 0; j < d.length; j += 4) {
      // Flame colours: strongly red-dominant and bright.
      if (d[j] > 180 && d[j] > d[j + 2] + 70 && d[j + 1] > 80) hot++;
    }
    out.push(hot);
  }
  return out;
});
console.log(`warm pixels at 100%, 55%, 30%, 8% health: ${warmth.join(", ")}`);
if (warmth[0] > 200) throw new Error("an undamaged building is on fire");
if (warmth[3] <= warmth[1]) throw new Error("a nearly-dead building does not burn harder than a lightly damaged one");
if (warmth[3] < 400) throw new Error("the worst-damaged building is barely alight");

await page.evaluate(() => { window.game.paused = true; });
await page.waitForTimeout(300);
await page.screenshot({ path: "test/shot-fire.png", clip: { x: 0, y: 0, width: 1100, height: 430 } });
await browser.close();
