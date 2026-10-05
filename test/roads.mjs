/**
 * Roads between buildings.
 *
 * Left to itself the ground only ever showed where feet had happened to fall,
 * which is a record of traffic rather than a plan -- so a base read as
 * buildings dropped on a lawn. Every finished building now sends one road to
 * whichever of its owner's buildings is nearest, so the network grows as a tree
 * and ends up looking laid out without anybody laying it out.
 *
 * What has to be true:
 *   - the first building of a base has nothing to join, and lays nothing;
 *   - the second joins the first, and the road actually runs between them;
 *   - roads are pathfound, so they go round water and round the buildings
 *     already standing rather than through them;
 *   - they do NOT grow over, which is the whole difference between a road and
 *     a worn track;
 *   - and they are built on the wear system, so a road moves people at the
 *     speed hard ground moves them.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

const r = await page.evaluate(() => {
  const g = window.game;
  g.settingsForTest.mapId = "plains-7925";
  g.settingsForTest.crowning = false;
  g.settingsForTest.stockade = false;
  g.settingsForTest.wildlife = false;
  g.start("none");
  const w = g.world, SUB = 64;
  w.fogEnabled = false;
  w.scheduleDragon(1e9);
  const count = () => { let n = 0; for (const v of w.map.road) if (v) n++; return n; };

  // A clear patch to build on.
  const clearing = (() => {
    const s = w.map.starts[0];
    for (let r = 10; r < 60; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const tx = s.x + dx, ty = s.y + dy;
          let ok = true;
          for (let j = -1; j <= 15 && ok; j++) for (let i = -1; i <= 15; i++) if (!w.map.isBuildable(tx + i, ty + j)) { ok = false; break; }
          if (ok) return { tx, ty };
        }
    return null;
  })();
  if (!clearing) return { error: "no clearing" };
  for (const e of [...w.entities.values()]) w.removeEntity(e.id);
  const before = count();

  // One building on its own: nothing to join.
  const a = w.placeBuilding(1, "townhall", clearing.tx, clearing.ty, true);
  g.tick();
  const afterOne = count();

  // A second, eight tiles off: a road should run between them.
  const b = w.placeBuilding(1, "barracks", clearing.tx + 8, clearing.ty + 1, true);
  g.tick();
  const afterTwo = count();

  // Does the road actually join them? Walk from one doorstep to the other and
  // check the route is road all the way.
  const aEdge = { x: a.tx + a.size, y: a.ty + 1 };
  const bEdge = { x: b.tx - 1, y: b.ty + 1 };
  let joined = 0, gap = 0;
  for (let x = aEdge.x; x <= bEdge.x; x++) {
    let hit = false;
    for (let y = aEdge.y - 3; y <= aEdge.y + 3; y++) if (w.map.inBounds(x, y) && w.map.road[w.map.idx(x, y)]) hit = true;
    if (hit) joined++; else gap++;
  }

  // Roads never sit on water or timber.
  let onBadGround = 0;
  for (let y = 0; y < w.map.height; y++)
    for (let x = 0; x < w.map.width; x++) {
      if (!w.map.road[w.map.idx(x, y)]) continue;
      const t = w.map.get(x, y);
      if (t !== 0 && t !== 1) onBadGround++;
    }

  // And they do not grow over. Ten minutes with nobody on them.
  const sample = [];
  for (let y = 0; y < w.map.height && sample.length < 20; y++)
    for (let x = 0; x < w.map.width && sample.length < 20; x++) {
      const i = w.map.idx(x, y);
      if (w.map.road[i]) sample.push(i);
    }
  const wear0 = sample.map((i) => w.map.wear[i]);
  for (let i = 0; i < 20 * 600; i++) g.tick();
  const faded = sample.filter((i, k) => w.map.wear[i] < wear0[k]).length;
  const hardGround = sample.every((i) => w.map.wear[i] >= 200);

  return { before, afterOne, afterTwo, joined, gap, onBadGround, samples: sample.length, faded, hardGround };
});
await browser.close();

if (r.error) { console.log("FAIL: " + r.error); process.exit(1); }
console.log(`road tiles: ${r.before} with no buildings, ${r.afterOne} with one, ${r.afterTwo} with two`);
console.log(`the gap between them: ${r.joined} columns carry road, ${r.gap} do not`);
console.log(`road tiles on water or timber: ${r.onBadGround}`);
console.log(`of ${r.samples} road tiles, ${r.faded} grew over in ten idle minutes (all still hard ground: ${r.hardGround})`);

const fail = [];
if (r.afterOne !== r.before) fail.push(`a lone building laid ${r.afterOne - r.before} tiles of road to nothing`);
if (r.afterTwo <= r.afterOne) fail.push("a second building laid no road to the first");
if (r.gap > 0) fail.push(`${r.gap} columns between the two buildings have no road — it does not join them`);
if (r.onBadGround > 0) fail.push(`${r.onBadGround} road tiles are on water or standing timber`);
if (r.samples < 5) fail.push("too few road tiles to tell whether they last");
if (r.faded > 0) fail.push(`${r.faded} road tiles grew over — a road is built, not worn`);
if (!r.hardGround) fail.push("a road is not carrying the wear that makes it quick to walk");
if (fail.length) {
  for (const f of fail) console.log("FAIL: " + f);
  process.exit(1);
}
console.log("PASS: buildings join themselves up, round what is in the way, and the roads stay");
