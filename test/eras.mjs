// Eras: the Town Hall's level is your era. Each era unlocks its buildings and
// units, aeroplanes come only at the end, the hall can always climb to the top
// (no era needs something a later era unlocks), and Wars battles keep their own rosters.
import assert from "node:assert/strict";
import { build } from "esbuild";
const out = await build({ stdin: { contents: `export * from "./src/sim/world"; export * from "./src/data/eras"; export {BUILDINGS} from "./src/data/buildings"; export {UNITS} from "./src/data/units";`, resolveDir: ".", loader: "ts" }, bundle: true, write: false, platform: "node", format: "esm", logLevel: "error", loader: { ".webp": "empty", ".png": "empty", ".mp3": "empty", ".ogg": "empty" } });
const M = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
const { World, ERAS, eraOf, BUILDINGS, UNITS } = M;

// Every gated thing is a real building or unit, listed once.
const seen = new Set();
for (const e of ERAS) for (const id of [...e.buildings, ...e.units]) { assert(BUILDINGS[id] || UNITS[id], `${id} exists`); assert(!seen.has(id), `${id} listed once`); seen.add(id); }
// Every trainable non-royal unit and every building that needs something has an era.
for (const b of Object.values(BUILDINGS)) for (const u of b.trains) if (!UNITS[u].royal && u !== "worker") assert(eraOf(u), `${u} has an era`);
// Aeroplanes are the very last thing.
for (const id of ["airfactory", "scout", "bomber"]) assert.equal(eraOf(id).n, ERAS.length, `${id} is last-era`);
for (const id of ["footman", "archer", "barracks"]) assert.equal(eraOf(id).n, 1, `${id} is first-era`);

// A town to test in.
const w = new World(96, 96, 42, "plains", 1, false);
w.addPlayer(1, "human", "#36c");
const p = w.players.get(1); p.gold = p.lumber = p.oil = 1e7;
// Open ground everywhere, so placement never fails for reasons beside the point.
const flatten = (world) => { for (let y = 0; y < world.map.height; y++) for (let x = 0; x < world.map.width; x++) { world.map.set(x, y, 0); world.map.amount[world.map.idx(x, y)] = 0; } };
flatten(w);
const hall = w.placeBuilding(1, "townhall", 4, 4, true);
let spot = 0; const nextSpot = () => { spot++; return [14 + (spot % 10) * 7, 4 + Math.floor(spot / 10) * 7]; };
// The shipyard wants a shoreline and the oil rig oil ground: make both where they will go.
const prepare = (def, x, y) => {
  const d = BUILDINGS[def];
  if (d.coastal) for (let i = -1; i <= d.size; i++) { w.map.set(x + i, y - 1, 2); }
  if (d.oilGround) for (let j = 0; j < d.size; j++) for (let i = 0; i < d.size; i++) w.map.oil[w.map.idx(x + i, y + j)] = 1;
};
const can = (def) => { for (let i = 0; i < 60; i++) { const [x, y] = nextSpot(); prepare(def, x, y); const err = w.placementError(1, def, x, y); if (err === null) return { ok: true, x, y }; if (/Era|era|Requires/.test(err)) return { ok: false, err }; } return { ok: false, err: "no room" }; };

// Village Era: barracks yes, stables no, airfactory no.
assert.equal(w.hallLevel(1), 1);
assert.equal(w.eraBlock(1, "barracks"), null);
assert.match(w.eraBlock(1, "stables"), /Castle Era: raise your Town Hall to level 3/);
assert.match(w.eraBlock(1, "airfactory"), /Age of Flight/);
assert.match(w.eraBlock(1, "knight"), /Castle Era/);

// Climb the whole hall, building whatever each level asks for, using only what the era allows.
for (let to = 2; to <= 10; to++) {
  for (let guard = 0; guard < 12; guard++) {
    const why = w.upgradeBlocked(1, hall);
    if (why === null) break;
    const names = why.replace(/.*need: /, "").split(", ");
    for (const nm of names) {
      const def = Object.values(BUILDINGS).find((b) => b.name === nm).id;
      assert.equal(w.eraBlock(1, def), null, `hall ${hall.level}→${to} needs ${def}, which its era must already allow (dead end otherwise)`);
      for (const r of BUILDINGS[def].requires) if (!w.hasBuilding(1, r)) { const s = can(r); assert(s.ok, `${r}: ${s.err}`); w.placeBuilding(1, r, s.x, s.y, true); }
      const s = can(def); assert(s.ok, `${def}: ${s.err}`); w.placeBuilding(1, def, s.x, s.y, true);
    }
  }
  assert.equal(w.upgradeBlocked(1, hall), null, `hall can reach level ${to}`);
  hall.level = to;
  const era = M.eraForHall(to);
  for (const id of era.buildings) assert.equal(w.eraBlock(1, id), null, `${id} open at hall ${to}`);
}
assert.equal(w.eraBlock(1, "bomber"), null, "planes open at the top");

// Training is refused out of era, even from a building that already stands.
const w2 = new World(64, 64, 9, "plains", 1, false);
w2.addPlayer(1, "human", "#36c"); flatten(w2); const p2 = w2.players.get(1); p2.gold = p2.lumber = 1e6;
w2.placeBuilding(1, "townhall", 5, 5, true);
const fac = w2.placeBuilding(1, "airfactory", 20, 20, true); // e.g. left over in an old realm
w2.step([{ type: "train", player: 1, building: fac.id, unit: "bomber" }]);
assert.equal(fac.queue.length, 0, "no bombers in the Village Era");
assert(w2.events.some((e) => /Age of Flight/.test(e.text)), "player is told why");

// Wars battles keep their own rosters: no era gating there.
w2.allowed = ["airfactory", "barracks"];
assert.equal(w2.eraBlock(1, "airfactory"), null);
console.log("PASS: eras gate buildings and units by Town Hall level, planes last, no dead ends, battles untouched");
