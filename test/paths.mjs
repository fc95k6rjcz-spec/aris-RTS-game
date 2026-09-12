/**
 * Paths appear under traffic, and they make the traffic quicker.
 *
 * Wear is part of the simulation, not the picture -- it changes how fast a unit
 * moves, so two machines in a network game must agree about it exactly. This
 * asserts the three things that matter: walking wears ground down, disuse grows
 * it back, and a worn tile is genuinely faster to cross than a raw one.
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
  g.settingsForTest.mapId = "lakeland-7927";
  g.start("none");
  const w = g.world, SUB = 32;
  const idx = (x, y) => w.map.idx(x, y);

  // Send a worker back and forth over a fixed lane of open ground.
  const u = [...w.entities.values()].find((e) => e.kind === "unit" && e.def === "worker");
  const y = Math.floor(u.pos.y / SUB);
  let x = Math.floor(u.pos.x / SUB);
  // Find a clear run of grass to walk up and down.
  let lane = null;
  for (let sx = 4; sx < w.map.width - 14; sx++) {
    let ok = true;
    // Grass or dirt specifically: a worker is amphibious, so "walkable" also
    // means open water, and you cannot beat a path into a lake.
    for (let i = 0; i < 10; i++) {
      const t = w.map.get(sx + i, y);
      if ((t !== 0 && t !== 1) || w.map.occupant[w.map.idx(sx + i, y)] !== 0) { ok = false; break; }
    }
    if (ok) { lane = sx; break; }
  }
  if (lane === null) return { error: "no clear lane" };
  // Total wear over the whole map: the worker's exact route is the pathfinder's
  // business, and sampling one tile only tests whether we guessed it right.
  const sum = () => w.map.wear.reduce((a, b) => a + b, 0);
  const wearBefore = sum();

  // Walk it several times.
  for (let trip = 0; trip < 8; trip++) {
    const to = trip % 2 === 0 ? lane + 9 : lane;
    g.issue({ type: "move", player: 1, units: [u.id], x: (to + 0.5) * SUB, y: (y + 0.5) * SUB });
    // The order is only picked up on the first tick, so tick before testing
    // whether there is still a path to walk.
    for (let i = 0; i < 600; i++) {
      g.tick();
      if (i > 2 && u.path.length === 0) break;
    }
  }
  const wearAfter = sum();

  // A worn tile must actually be quicker to cross than a raw one. Measured as
  // distance covered in a fixed number of ticks along a row set to a known
  // wear, rather than as a race: a race depends on the route the pathfinder
  // picks, and the route is not what is under test.
  const runFor = (wear, ticks) => {
    // The whole map, not just the lane: the pathfinder is free to route off the
    // row, and tiles off it still carry the wear laid down by the trips above,
    // which made the "raw" run quietly run on worn ground too.
    w.map.wear.fill(wear);
    u.pos.x = (lane + 0.5) * SUB;
    u.pos.y = (y + 0.5) * SUB;
    u.task = { kind: "idle" };
    u.path = [];
    g.issue({ type: "move", player: 1, units: [u.id], x: (lane + 11.5) * SUB, y: (y + 0.5) * SUB });
    // Distance actually covered, not displacement along x: the pathfinder is
    // entitled to route diagonally, and a diagonal step moves a unit its full
    // speed while moving it less than that in x. Measuring x alone reported a
    // faster unit as no faster at all.
    let travelled = 0;
    let px = u.pos.x;
    let py = u.pos.y;
    for (let i = 0; i < ticks; i++) {
      g.tick();
      travelled += Math.hypot(u.pos.x - px, u.pos.y - py);
      px = u.pos.x;
      py = u.pos.y;
      // Hold it steady: walking wears the ground, which would otherwise change
      // the thing being measured while it is being measured.
      w.map.wear.fill(wear);
    }
    return Math.round(travelled);
  };
  const distWorn = runFor(255, 30);
  const distRaw = runFor(0, 30);

  // And disuse must grow a path back.
  for (let i = 0; i < 10; i++) w.map.wear[idx(lane + i, y)] = 255;
  const decayFrom = w.map.wear[idx(lane + 5, y)];
  u.task = { kind: "idle" };
  u.path = [];
  for (let i = 0; i < 20 * 300; i++) g.tick();
  const decayTo = w.map.wear[idx(lane + 5, y)];

  return { wearBefore, wearAfter, distWorn, distRaw, decayFrom, decayTo };
});
await browser.close();

console.log(JSON.stringify(r, null, 2));
const fail = [];
if (r.error) fail.push(r.error);
else {
  if (!(r.wearAfter > r.wearBefore)) fail.push(`walking did not wear the ground (${r.wearBefore} -> ${r.wearAfter})`);
  if (!(r.decayTo < r.decayFrom)) fail.push(`a disused path did not grow back (${r.decayFrom} -> ${r.decayTo})`);
  if (!(r.distWorn > r.distRaw)) fail.push(`a worn path was no quicker (${r.distWorn} sub-units in 30 ticks vs ${r.distRaw} on raw ground)`);
}
if (fail.length) {
  console.log("FAIL: " + fail.join("; "));
  process.exit(1);
}
console.log(`PASS: paths form under traffic, grow back without it, and carry ${Math.round((r.distWorn / r.distRaw - 1) * 100)}% more ground per tick`);
