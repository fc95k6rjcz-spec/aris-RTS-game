// Runs the AI unattended for ten simulated minutes and reports what it built.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);
const out = await page.evaluate(() => {
  const g = window.game;
  g.start("normal");
  const w = g.world;
  const snap = [];
  for (let m = 1; m <= 20; m++) {
    for (let i = 0; i < 20 * 60; i++) g.tick();
    const b = {}, u = {};
    for (const e of w.entities.values()) {
      if (e.owner !== 2) continue;
      if (e.kind === "building") b[e.def] = (b[e.def] || 0) + 1;
      else u[e.def] = (u[e.def] || 0) + 1;
    }
    const p = w.players.get(2);
    const mine = w.buildings().filter(x => x.owner === 1).length;
    const hurt = w.buildings().filter(x => x.owner === 1 && x.hp < x.maxHp).length;
    const attacking = w.units().filter(x => x.owner === 2 && (x.task.kind === "attackMove" || x.task.kind === "attack")).length;
    snap.push({ min: m, gold: p.gold, b, u, mine, hurt, attacking, winner: w.winner });
  }
  return snap;
});
for (const s of out) {
  console.log(`t=${String(s.min).padStart(2)}m  aiUnits ${JSON.stringify(s.u)}  attacking ${s.attacking}  playerBuildings ${s.mine} (${s.hurt} damaged)  winner ${s.winner}`);
}
if (errs.length) { console.error("ERRORS", errs.slice(0, 3)); process.exit(1); }
await browser.close();
