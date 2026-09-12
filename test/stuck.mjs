import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

const report = await page.evaluate(async () => {
  const g = window.game, w = g.world;
  // Both sides run an AI, so neither is a punching bag and the game keeps going.
  g.start("normal");
  const last = new Map();
  const snaps = [];
  for (let t = 0; t < 9000 && w.winner === null; t++) {
    g.tick();
    if (t % 5 !== 0) continue;
    for (const u of w.units()) {
      const p = last.get(u.id) ?? { x: u.pos.x, y: u.pos.y, still: 0 };
      const moved = Math.abs(u.pos.x - p.x) + Math.abs(u.pos.y - p.y) > 2;
      p.still = moved ? 0 : p.still + 5;
      p.x = u.pos.x; p.y = u.pos.y;
      last.set(u.id, p);
    }
    if (t % 1500 === 0) {
      const rows = {};
      let n = 0;
      for (const u of w.units()) {
        const p = last.get(u.id);
        if (!p || p.still < 300) continue;
        n++;
        const k = `p${u.owner} ${u.def} ${u.task.kind}${u.path.length ? " path" : " nopath"}`;
        rows[k] = (rows[k] ?? 0) + 1;
      }
      snaps.push({ tick: w.tick, units: w.units().length, stuckNow: n, rows });
      await new Promise((r) => setTimeout(r, 1));
    }
  }
  return { snaps, winner: w.winner, endTick: w.tick };
});
for (const s of report.snaps) {
  console.log(`t=${String(s.tick).padStart(5)} units=${String(s.units).padStart(3)} stuck>15s=${String(s.stuckNow).padStart(3)}  ${JSON.stringify(s.rows)}`);
}
console.log("winner:", report.winner, "at", report.endTick);

// The failure this guards against: a unit that has somewhere to be and is not
// getting there. Idle units standing about are fine -- the human player never
// ordered them anywhere -- so only units holding a path count as stuck.
const frozen = report.snaps.flatMap((s) =>
  Object.entries(s.rows).filter(([k]) => k.endsWith(" path")).map(([k, n]) => `${k} x${n} at t=${s.tick}`),
);
if (frozen.length > 0) throw new Error(`units frozen while holding a path:\n  ${frozen.join("\n  ")}`);
console.log("no unit was frozen while holding a path");
await browser.close();
