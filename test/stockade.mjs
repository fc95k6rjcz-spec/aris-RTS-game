/**
 * Walled in by forest.
 *
 * Two things have to be true, and they pull against each other. The ring must
 * actually seal -- if one tile of grass is left open, the whole idea evaporates
 * and the game plays as before. And it must be only wood, so that cutting a gate
 * opens it: a wall you cannot get through is a different bug from no wall at all.
 *
 * The seal is checked by flooding outward from the Town Hall across walkable
 * land and confirming the flood never reaches the far side of the map, then
 * felling one arc of the ring and confirming that it does.
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
  g.settingsForTest.mapId = "random";
  g.settingsForTest.nomad = false;
  g.settingsForTest.crowning = false;
  g.settingsForTest.wildlife = false;
  g.settingsForTest.stockade = true;
  g.start("none");
  const w = g.world;
  const map = w.map;
  const SUB = 64;
  const seat = map.starts[0];

  // How much wall is there?
  let ringTrees = 0;
  for (let y = -15; y <= 15; y++)
    for (let x = -15; x <= 15; x++) {
      const d = Math.hypot(x, y);
      if (d < 9.5 || d > 15) continue;
      const px = seat.x + x;
      const py = seat.y + y;
      if (map.inBounds(px, py) && map.get(px, py) === 3) ringTrees++;
    }

  // The wall is a toll now, not a cage: time a man walking out through it, then
  // fell a lane and time him again. Both must finish; the first must cost more.
  // Somewhere open to stand, and somewhere open to walk to: the seat itself is
  // under the Town Hall, and twenty-four tiles east can easily be a lake.
  let from = null;
  for (let rad = 2; rad < 8 && !from; rad++)
    for (let dy = -rad; dy <= rad && !from; dy++)
      for (let dx = -rad; dx <= rad && !from; dx++) {
        const px = seat.x + dx;
        const py = seat.y + dy;
        if (map.inBounds(px, py) && map.get(px, py) === 0 && map.occupant[map.idx(px, py)] === 0) from = { x: px, y: py };
      }
  let goal = null;
  for (let d = 24; d >= 17 && !goal; d--)
    for (const [gx, gy] of [[d, 0], [0, d], [-d, 0], [0, -d], [d, d], [-d, -d]]) {
      const px = seat.x + gx;
      const py = seat.y + gy;
      if (map.inBounds(px, py) && map.isWalkable(px, py, "land") && map.get(px, py) !== 3) {
        goal = { x: px, y: py };
        break;
      }
    }

  const walkOut = () => {
    const u = w.spawnUnit(1, "footman", { x: (from.x + 0.5) * SUB, y: (from.y + 0.5) * SUB });
    g.issue({ type: "move", player: 1, units: [u.id], x: goal.x * SUB, y: goal.y * SUB });
    let t = 0;
    for (; t < 6000; t++) {
      g.tick();
      if (Math.hypot(u.pos.x / SUB - goal.x, u.pos.y / SUB - goal.y) < 2) break;
    }
    u.hp = 0;
    for (let i = 0; i < 2; i++) g.tick();
    return t;
  };

  const throughWood = walkOut();
  // Fell everything in a wide lane along the line he actually walks.
  {
    const dx = goal.x - from.x;
    const dy = goal.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    for (let step = 0; step <= len + 2; step++)
      for (let off = -2; off <= 2; off++) {
        const px = Math.round(from.x + (dx / len) * step - (dy / len) * off);
        const py = Math.round(from.y + (dy / len) * step + (dx / len) * off);
        if (map.inBounds(px, py) && map.get(px, py) === 3) map.set(px, py, 0);
      }
  }
  const throughGate = walkOut();

  return { ringTrees, throughWood, throughGate, size: map.width, from, goal };
});
await browser.close();

console.log(`ring: ${r.ringTrees} trees; walked from ${r.from?.x},${r.from?.y} to ${r.goal?.x},${r.goal?.y}`);
console.log(`walking out through the wood: ${r.throughWood} ticks`);
console.log(`walking out through a cut gate: ${r.throughGate} ticks`);

const fail = [];
if (r.ringTrees < 80) fail.push("the ring is too thin to be a wall");
if (r.throughWood >= 6000) fail.push("the wood was impassable: a wall of trees is meant to cost time, not seal you in");
if (r.throughGate >= r.throughWood) fail.push("cutting a gate did not save any time, so the wall costs nothing");
if (fail.length) {
  for (const f of fail) console.log("FAIL: " + f);
  process.exit(1);
}

// And the opponent, fenced in exactly the same way, has to get itself out.
const page2 = await (await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })).newPage({ viewport: { width: 1000, height: 700 } });
await page2.setContent(html);
await page2.waitForFunction(() => !!window.game);
const ai = await page2.evaluate(() => {
  const g = window.game;
  g.settingsForTest.mapId = "random";
  g.settingsForTest.stockade = true;
  g.settingsForTest.crowning = false;
  g.settingsForTest.wildlife = false;
  g.start("normal");
  const w = g.world;
  const seat = w.map.starts[1];
  let when = -1;
  for (let i = 0; i < 8000; i++) {
    g.tick();
    if (when < 0)
      for (const u of w.units())
        if (u.owner === 2 && Math.hypot(u.pos.x / 64 - seat.x, u.pos.y / 64 - seat.y) > 16) {
          when = i;
          break;
        }
  }
  let out = 0;
  for (const u of w.units()) if (u.owner === 2 && Math.hypot(u.pos.x / 64 - seat.x, u.pos.y / 64 - seat.y) > 16) out++;
  return { when, out };
});
await page2.context().browser().close();
console.log(`opponent broke out at tick ${ai.when}, ${ai.out} of its people outside the ring`);
if (ai.when < 0) {
  console.log("FAIL: the opponent never cut its way out, so it can never attack");
  process.exit(1);
}

console.log("PASS: the wood costs you time, and an axe buys it back");
