/**
 * Standing units fight what comes near them.
 *
 * This is the bug that made the opponent look like it was not playing. A unit
 * with nothing to do acquires a target from two and a half tiles further away
 * than any hand weapon can reach -- and then, if that target was not already
 * within arm's reach, it did nothing at all. It recorded the enemy in
 * `engaging` and stood there. Eight footmen would sit in a neat line a tile and
 * a half from an enemy King, every one of them with him acquired, none of them
 * moving, until he chose to walk into one of them.
 *
 * It applied to the player's own army exactly as much as to the opponent's, and
 * the whole watch radius was dead weight for infantry.
 *
 * What has to be true now:
 *   - a standing soldier closes on something that comes inside its watch and
 *     kills it;
 *   - it does NOT follow that something across the map: a chase it started
 *     itself is leashed to the ground it was holding;
 *   - a chase the PLAYER ordered has no leash, because the player meant it;
 *   - and a worker does not abandon his post over it.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

const r = await page.evaluate(() => {
  const g = window.game;
  g.settingsForTest.mapId = "random";
  g.settingsForTest.crowning = false;
  g.settingsForTest.stockade = false;
  g.settingsForTest.wildlife = false;
  g.settingsForTest.edgeScroll = false;
  g.start("none");
  const w = g.world, SUB = 64;
  w.fogEnabled = false;
  w.scheduleDragon(1e9);

  /**
   * A patch of open ground well away from anybody's business.
   *
   * Tested with `isBuildable`, not `isWalkable`. They are different predicates
   * -- buildable is grass or dirt and unoccupied, walkable includes pack ice --
   * so a clearing chosen on walkability sometimes refused a town hall on every
   * tile of itself, and the woodcutter case was skipped on about a third of
   * maps for reasons that had nothing to do with woodcutters.
   */
  const clearing = (() => {
    const s = w.map.starts[0];
    // Sized to what the four cases actually occupy -- the widest is the
    // woodcutter's, which reaches eleven tiles across for hall plus tree --
    // rather than to a round number. An eighteen-square block of pure grass is
    // more than a wooded map reliably has anywhere near a seat.
    for (let r = 8; r < 60; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const tx = s.x + dx, ty = s.y + dy;
          let ok = true;
          for (let j = -1; j <= 11 && ok; j++) for (let i = -1; i <= 13; i++) if (!w.map.isBuildable(tx + i, ty + j)) { ok = false; break; }
          if (ok) return { tx, ty };
        }
    return null;
  })();
  if (!clearing) return { error: "no clearing big enough" };
  const T = (tx, ty) => ({ x: (clearing.tx + tx) * SUB, y: (clearing.ty + ty) * SUB });
  const clear = () => { for (const e of [...w.entities.values()]) w.removeEntity(e.id); };

  // 1. The screenshot: a line of soldiers standing beside an enemy King.
  clear();
  const foes = [];
  for (let i = 0; i < 8; i++) foes.push(w.spawnUnit(2, "footman", T(4 + (i % 4), 6 + Math.floor(i / 4))).id);
  const king = w.spawnUnit(1, "king", T(5, 4));
  let engagedAt = null, kingDeadAt = null;
  for (let i = 0; i < 20 * 60; i++) {
    g.tick();
    if (engagedAt === null && foes.some((id) => w.entities.get(id)?.task.kind === "attack")) engagedAt = i;
    if (kingDeadAt === null && !w.entities.get(king.id)) { kingDeadAt = i; break; }
  }

  // 2. The leash: one soldier holding ground, and a fast enemy running past.
  clear();
  const picket = w.spawnUnit(2, "footman", T(4, 4));
  const post = { x: picket.pos.x, y: picket.pos.y };
  const runner = w.spawnUnit(1, "scout", T(6, 4));
  let strayed = 0;
  for (let i = 0; i < 20 * 60; i++) {
    // Walk the runner steadily away, so the picket is tempted the whole time.
    const rn = w.entities.get(runner.id);
    if (rn && rn.task.kind === "idle") {
      g.issue({ type: "move", player: 1, units: [runner.id], x: rn.pos.x + 20 * SUB, y: rn.pos.y });
    }
    g.tick();
    const p = w.entities.get(picket.id);
    if (p) strayed = Math.max(strayed, Math.hypot(p.pos.x - post.x, p.pos.y - post.y) / SUB);
  }

  // 3. An ordered chase is not leashed.
  clear();
  const hound = w.spawnUnit(2, "knight", T(4, 4));
  const houndPost = { x: hound.pos.x, y: hound.pos.y };
  // A scout, not a worker: a knight runs a worker down in three tiles and the
  // test then measures how quickly it caught him rather than how far it was
  // willing to go.
  const quarry = w.spawnUnit(1, "scout", T(6, 4));
  g.issue({ type: "attack", player: 2, units: [hound.id], target: quarry.id });
  let ordered = 0;
  for (let i = 0; i < 20 * 60; i++) {
    const q = w.entities.get(quarry.id);
    if (!q) break;
    if (q.task.kind === "idle") g.issue({ type: "move", player: 1, units: [quarry.id], x: q.pos.x + 20 * SUB, y: q.pos.y });
    g.tick();
    const h = w.entities.get(hound.id);
    if (h) ordered = Math.max(ordered, Math.hypot(h.pos.x - houndPost.x, h.pos.y - houndPost.y) / SUB);
  }

  // 4. A worker at a tree does not down tools over somebody two tiles away.
  clear();
  // Try a few spots. "Walkable" and "a building may be placed here" are not the
  // same predicate, so the one tile the clearing search happens to return is
  // sometimes refused, and the case was skipped on about one map in three.
  let hall = null;
  for (const [dx, dy] of [[2, 2], [3, 2], [2, 3], [4, 4], [1, 1], [5, 2]]) {
    hall = w.placeBuilding(1, "townhall", clearing.tx + dx, clearing.ty + dy, true);
    if (hall) break;
  }
  // Plant the tree rather than going looking for one. The clearing this runs in
  // is by definition a big patch of open ground, so on some maps the nearest
  // real timber is further away than any sensible search, and the case was
  // skipped -- reported as "could not set up", which is a test that fails for
  // reasons that have nothing to do with the thing it is testing. Tile 3 is
  // Tree; 40 is a full one.
  const tree = hall ? { tx: hall.tx + 6, ty: hall.ty + 1 } : { tx: clearing.tx + 8, ty: clearing.ty + 3 };
  w.map.set(tree.tx, tree.ty, 3);
  w.map.amount[w.map.idx(tree.tx, tree.ty)] = 40;
  let keptWorking = null;
  let why = null;
  if (!hall) why = "town hall would not place";
  if (hall) {
    const hand = w.spawnUnit(1, "worker", { x: (tree.tx + 1.5) * SUB, y: (tree.ty + 0.5) * SUB });
    g.issue({ type: "gather", player: 1, units: [hand.id], tx: tree.tx, ty: tree.ty });
    for (let i = 0; i < 40; i++) g.tick();
    w.spawnUnit(2, "footman", { x: hand.pos.x + 2 * SUB, y: hand.pos.y });
    // Ticks working as a fraction of ticks ALIVE. A footman two tiles away
    // will quite properly come over and kill him, and counting against a
    // fixed window just measures how long that took.
    let gathering = 0;
    let alive = 0;
    for (let i = 0; i < 20 * 20; i++) {
      g.tick();
      const h = w.entities.get(hand.id);
      if (!h) break;
      alive++;
      if (h.task.kind === "gather") gathering++;
    }
    if (alive === 0) why = "the woodcutter was gone before the first tick";
    keptWorking = alive === 0 ? null : Math.round((gathering / alive) * 100);
  }

  return { why, engagedAt, kingDeadAt, strayed: Math.round(strayed * 10) / 10, ordered: Math.round(ordered), keptWorking };
});
await browser.close();

if (r.error) { console.log("FAIL: " + r.error); process.exit(1); }
console.log(`eight footmen beside an enemy King: engaged after ${r.engagedAt} ticks, he was dead after ${r.kingDeadAt}`);
console.log(`a picket baited by a runner strayed ${r.strayed} tiles from its post`);
console.log(`a knight ORDERED to chase went ${r.ordered} tiles`);
console.log(`a woodcutter with an enemy two tiles off spent ${r.keptWorking}% of his remaining life still gathering`);

const fail = [];
if (r.engagedAt === null) fail.push("eight soldiers stood beside an enemy King and never engaged him");
else if (r.engagedAt > 20) fail.push(`it took ${r.engagedAt} ticks for anybody to react`);
if (r.kingDeadAt === null) fail.push("eight footmen could not kill a King they were standing next to");
// The leash is six tiles. Fourteen, not seven, because there is one legitimate
// way to exceed it: the picket chases its six, gives up, and -- once the runner
// is out of its watch entirely -- settles and takes the ground it is now
// standing on as its post. If the runner then loops back it gets one more
// leash from there. That ratchet is bounded and needs the enemy to leave and
// return; what the assertion is really for is the unbounded version, and the
// runner in this test ends up sixty tiles away.
if (r.strayed > 14) fail.push(`a picket chased ${r.strayed} tiles from its post — the leash is not holding`);
if (r.ordered < 10) fail.push(`a knight told to chase only went ${r.ordered} tiles — an ordered attack must not be leashed`);
if (r.keptWorking === null) fail.push(`could not set up the woodcutter case: ${r.why}`);
else if (r.keptWorking < 90) fail.push(`a woodcutter downed tools over a passer-by (gathering only ${r.keptWorking}% of the time)`);
if (fail.length) {
  for (const f of fail) console.log("FAIL: " + f);
  process.exit(1);
}
console.log("PASS: they fight what comes to them, and they do not wander off doing it");
