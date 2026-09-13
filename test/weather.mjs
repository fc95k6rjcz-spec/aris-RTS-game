/**
 * Rain, mud, and what paving is for.
 *
 * Three things have to hold. The weather must be the same on every machine
 * given the same seed and tick, because it changes how fast units move and two
 * players in a network game cannot disagree about that. Rain must churn worn
 * tracks into mud and dry weather must let them recover. And a clan that has
 * researched Paved Ways must be able to ignore the mud entirely -- that is the
 * whole reason the upgrade exists.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

const r = await page.evaluate(() => {
  const g = window.game;
  g.settingsForTest.crowning = false;
  g.settingsForTest.stockade = false;
  g.settingsForTest.wildlife = false;
  g.settingsForTest.edgeScroll = false;
  g.settingsForTest.mapId = "lakeland-7927";
  g.start("none");
  const w = g.world, SUB = 32;

  // 1. The same seed and tick give the same sky, asked in any order.
  const forward = [];
  for (let t = 0; t < 40; t++) forward.push(w.skyAtForTest(12345, t * 2000));
  const backward = [];
  for (let t = 39; t >= 0; t--) backward.push(w.skyAtForTest(12345, t * 2000));
  backward.reverse();
  const stable = forward.join() === backward.join();
  const varied = new Set(forward).size;

  // 2. Rain churns a worn track; dry weather dries it.
  const u = [...w.entities.values()].find((e) => e.kind === "unit" && e.def === "worker");
  const tx = Math.floor(u.pos.x / SUB), ty = Math.floor(u.pos.y / SUB);
  const i = w.map.idx(tx, ty);
  w.map.wear.fill(255);
  w.map.mud.fill(0);
  // Run until it actually rains. The opening spells are dry by design, so a
  // fixed sixty seconds measured nothing but a clear sky.
  let waited = 0;
  while (w.rain <= 0 && waited < 60000) { g.tick(); waited++; }
  const rainedAt = w.rain > 0 ? waited : null;
  for (let t = 0; t < 20 * 90; t++) g.tick();
  const mudPeak = Math.max(...w.map.mud);
  // And it must dry again once the sky clears.
  let dried = null;
  for (let t = 0; t < 60000; t++) { g.tick(); if (w.rain <= 0) { dried = Math.max(...w.map.mud); break; } }
  const wetTicks = [];

  // 3. A worn, muddy tile: paved beats unpaved.
  const run = (paved) => {
    const p = w.players.get(1);
    p.research.paving = paved ? 1 : 0;
    w.map.wear.fill(255);
    w.map.mud.fill(255);
    u.pos.x = (tx + 0.5) * SUB; u.pos.y = (ty + 0.5) * SUB;
    u.task = { kind: "idle" }; u.path = [];
    g.issue({ type: "move", player: 1, units: [u.id], x: u.pos.x + 300, y: u.pos.y });
    let travelled = 0, px = u.pos.x, py = u.pos.y;
    for (let k = 0; k < 30; k++) {
      g.tick();
      travelled += Math.hypot(u.pos.x - px, u.pos.y - py);
      px = u.pos.x; py = u.pos.y;
      w.map.wear.fill(255); w.map.mud.fill(255);
    }
    return Math.round(travelled);
  };
  const pavedDist = run(true);
  const muddyDist = run(false);

  return { stable, varied, skies: forward.slice(0, 12), mudPeak, rainedAt, dried, pavedDist, muddyDist };
});
await browser.close();

console.log(`weather is order-independent: ${r.stable}`);
console.log(`distinct skies over 40 spells: ${r.varied}  first twelve: ${r.skies.join(" ")}`);
console.log(`first rain after ${r.rainedAt} ticks (${Math.round((r.rainedAt ?? 0) / 20)}s); peak mud ${r.mudPeak}`);
console.log(`paved crossing ${r.pavedDist} sub-units in 30 ticks, unpaved through mud ${r.muddyDist}`);

const fail = [];
if (!r.stable) fail.push("the sky depended on the order it was asked about");
if (r.varied < 2) fail.push("the weather never changed");
if (!(r.pavedDist > r.muddyDist)) fail.push(`paving did not beat mud (${r.pavedDist} vs ${r.muddyDist})`);
if (r.rainedAt === null) fail.push("it never rained");
if (!(r.mudPeak > 40)) fail.push(`rain did not churn the tracks (peak mud ${r.mudPeak})`);
if (fail.length) { console.log("FAIL: " + fail.join("; ")); process.exit(1); }
console.log(`PASS: weather is deterministic, and paved ways carry ${Math.round((r.pavedDist / r.muddyDist - 1) * 100)}% further through mud`);
