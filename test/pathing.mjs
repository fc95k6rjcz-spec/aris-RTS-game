import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

/**
 * Walk a footman across the map past a wall of real buildings and report how
 * close it got. Buildings, not rock tiles: a building is what a player actually
 * packs together, and it is placed through the same call the build order uses.
 */
async function crossing(name, gap) {
  return await page.evaluate(({ gap }) => {
    const g = window.game, SUB = 64;
    g.start("none");
    const w = g.world;
    // A clear field, then a wall of Watch Towers down the middle with one gap.
    // Clear the WHOLE board: leaving the outer ring forested lets a unit stroll
    // around the end of the wall, which is not what this test is about.
    for (let y = 0; y < w.map.height; y++) for (let x = 0; x < w.map.width; x++) w.map.set(x, y, 0);
    for (const u of [...w.units()]) w.removeEntity(u.id);
    for (const b of [...w.buildings()]) w.removeEntity(b.id);
    for (let y = 0; y < w.map.height - 1; y += 2) {
      if (gap !== null && y >= gap && y < gap + 2) continue;
      w.placeBuilding(2, "tower", 30, y, true);
    }
    const u = w.spawnUnit(1, "footman", { x: 10 * SUB, y: 30 * SUB });
    g.issue({ type: "move", player: 1, units: [u.id], x: 50 * SUB, y: 30 * SUB });
    let moved = 0, lastX = u.pos.x;
    for (let i = 0; i < 3000; i++) {
      g.tick();
      if (Math.abs(u.pos.x - lastX) > 1) moved++;
      lastX = u.pos.x;
      if (u.pos.x > 48 * SUB) break;
    }
    return {
      crossed: u.pos.x > 48 * SUB,
      endTile: Math.floor(u.pos.x / SUB),
      ticksMoving: moved,
      pathLeft: u.path.length,
    };
  }, { gap });
}

const wide = await crossing("gap at the far end", 56);
console.log(`wall with a gap 20 tiles off the direct line: crossed=${wide.crossed} endTile=${wide.endTile} (started 10, target 50)`);
if (!wide.crossed) throw new Error("could not find its way round a walled line with a gap in it");

const sealed = await crossing("no gap", null);
console.log(`sealed wall: crossed=${sealed.crossed} endTile=${sealed.endTile} movingTicks=${sealed.ticksMoving}`);
if (sealed.crossed) throw new Error("walked through a solid wall");
if (sealed.endTile < 25) throw new Error(`gave up at tile ${sealed.endTile} instead of walking up to the wall`);

// A one-tile corridor between two blocks: units must fit through a tight build.
const squeeze = await page.evaluate(() => {
  const g = window.game, SUB = 64;
  g.start("none");
  const w = g.world;
  for (let y = 0; y < w.map.height; y++) for (let x = 0; x < w.map.width; x++) w.map.set(x, y, 0);
  for (const u of [...w.units()]) w.removeEntity(u.id);
  for (const b of [...w.buildings()]) w.removeEntity(b.id);
  // Two blocks of Barracks running to both edges, with exactly one walkable
  // tile between them at y=33.
  for (let y = 0; y < 33; y += 3) w.placeBuilding(2, "barracks", 28, y, true);
  for (let y = 34; y < w.map.height - 2; y += 3) w.placeBuilding(2, "barracks", 28, y, true);
  const u = w.spawnUnit(1, "footman", { x: 15 * SUB, y: 32 * SUB });
  g.issue({ type: "move", player: 1, units: [u.id], x: 45 * SUB, y: 32 * SUB });
  for (let i = 0; i < 3000; i++) {
    g.tick();
    if (u.pos.x > 43 * SUB) break;
  }
  return { through: u.pos.x > 43 * SUB, endTile: Math.floor(u.pos.x / SUB) };
});
console.log(`one-tile gap between two blocks of barracks: through=${squeeze.through} endTile=${squeeze.endTile}`);
if (!squeeze.through) throw new Error("could not squeeze through a one-tile gap");


// The case that actually bites: a whole squad through one tight gap at once.
// One unit fits easily; eight jostling for the same tile is where separation and
// pathing fight each other.
const crowd = await page.evaluate(() => {
  const g = window.game, SUB = 64;
  g.start("none");
  const w = g.world;
  for (let y = 0; y < w.map.height; y++) for (let x = 0; x < w.map.width; x++) w.map.set(x, y, 0);
  for (const u of [...w.units()]) w.removeEntity(u.id);
  for (const b of [...w.buildings()]) w.removeEntity(b.id);
  for (let y = 0; y < 33; y += 3) w.placeBuilding(2, "barracks", 28, y, true);
  for (let y = 34; y < w.map.height - 2; y += 3) w.placeBuilding(2, "barracks", 28, y, true);
  const squad = [];
  for (let i = 0; i < 8; i++) squad.push(w.spawnUnit(1, "footman", { x: (14 + (i % 4)) * SUB, y: (31 + Math.floor(i / 4)) * SUB }));
  g.issue({ type: "move", player: 1, units: squad.map((u) => u.id), x: 45 * SUB, y: 32 * SUB });
  for (let i = 0; i < 4000; i++) g.tick();
  const through = squad.filter((u) => w.entities.has(u.id) && u.pos.x > 40 * SUB).length;
  const tiles = squad.map((u) => Math.floor(u.pos.x / SUB)).sort((a, b) => a - b);
  return { through, of: squad.length, tiles };
});
console.log(`squad of ${crowd.of} through the one-tile gap: ${crowd.through} made it — end columns ${crowd.tiles.join(",")}`);
if (crowd.through < crowd.of) throw new Error(`${crowd.of - crowd.through} of the squad jammed at the gap`);
await browser.close();
