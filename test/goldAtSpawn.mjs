// Wherever you spawn in the realm there is a gold mine within a short walk:
// for every arrival (even once the realm is crowded and camps fall back to a
// cleared patch), after "Start again", and beside a seam that has been dug out.
// Every computer must lay the same mine, so two copies of the realm must agree.
import assert from "node:assert/strict";
import { build } from "esbuild";
const out = await build({ stdin: { contents: `export * from "./src/sim/world";`, resolveDir: ".", loader: "ts" }, bundle: true, write: false, platform: "node", format: "esm", logLevel: "error" });
const M = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
const { World, WILD } = M;
const GOLD = 4, RADIUS = 11, ENOUGH = 1500;

function goldNear(w, id) {
  const h = w.homes.get(id); const cx = h.x + 1, cy = h.y + 1; let g = 0;
  for (let y = cy - RADIUS; y <= cy + RADIUS; y++) for (let x = cx - RADIUS; x <= cx + RADIUS; x++) {
    if (!w.map.inBounds(x, y) || w.map.get(x, y) !== GOLD || w.map.isHidden(x, y)) continue;
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= RADIUS) g += w.map.amount[w.map.idx(x, y)];
  }
  return g;
}
function realm(seed) {
  const w = new World(96, 96, seed, "plains", 1, false);
  w.realm = true; w.addPlayer(WILD, "human", "#863");
  return w;
}

// A small realm filled until camps have to fall back to cleared patches.
for (const seed of [7, 42, 1234]) {
  const w = realm(seed);
  const ids = [];
  for (let i = 0; i < 9; i++) { const id = w.claimSeat("traveller-" + i); if (id != null) ids.push(id); }
  assert(ids.length >= 6, `seed ${seed}: seated ${ids.length}`);
  for (const id of ids) assert(goldNear(w, id) >= ENOUGH, `seed ${seed}: player ${id} has gold at their camp (${goldNear(w, id)})`);
  console.log(`seed ${seed}: ${ids.length} camps, all with gold:`, ids.map((id) => goldNear(w, id)).join(" "));
}

// Start again beside a seam that has been dug out: a fresh mine appears.
{
  const w = realm(99);
  const id = w.claimSeat("digger");
  const h = w.homes.get(id);
  for (let y = 0; y < w.map.height; y++) for (let x = 0; x < w.map.width; x++) if (w.map.get(x, y) === GOLD && Math.hypot(x - h.x, y - h.y) < 30) w.map.amount[w.map.idx(x, y)] = 10;
  w.restartSeat(id);
  assert(goldNear(w, id) >= ENOUGH, `restart has gold (${goldNear(w, id)})`);
  console.log("start again beside a dug-out seam:", goldNear(w, id));
}

// Two copies of the realm, same arrivals: the same mines, the same world.
{
  const a = realm(5), b = realm(5);
  for (let i = 0; i < 9; i++) { a.claimSeat("p" + i); b.claimSeat("p" + i); }
  assert.equal(a.checksum(), b.checksum(), "both computers lay the same mines");
}
console.log("PASS: every camp in the realm starts with a gold mine within a short walk");
