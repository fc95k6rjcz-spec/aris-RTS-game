/**
 * Night: sleeping men, camp fires, and a country with animals in it.
 *
 * Four things have to hold, and they are deliberately four SEPARATE things
 * because three of them are atmosphere and one of them is economy.
 *
 *   - men lie down at night and are on their feet again the instant they are
 *     given an order or anything hostile comes near. Sleep is drawn, not
 *     simulated: a sleeper must have exactly the same hit points, sight and
 *     reach as a man standing up, or "the men sleep" has quietly become a
 *     mechanic nobody balanced;
 *   - there are fires, they are placed the same way on every machine, and
 *     every seat has one -- a player's first night should not be spent in the
 *     dark while somebody else's camp burns across the valley;
 *   - the wild holds deer, cows, sheep, wolves and bears, the wolves come in
 *     packs, and adding two species did not quietly triple the number of
 *     things that bite;
 *   - and killing the edible ones feeds you.
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
  g.settingsForTest.mapId = "random";
  g.settingsForTest.crowning = false;
  g.settingsForTest.stockade = false;
  g.settingsForTest.edgeScroll = false;
  g.start("none");
  const w = g.world, SUB = 64, DAY = 20 * 240;

  // ── the wild ──
  const counts = {};
  for (const u of w.units()) if (u.owner === 9) counts[u.def] = (counts[u.def] ?? 0) + 1;
  // Wolves in packs: no wolf should be alone in the world.
  const wolves = [...w.units()].filter((u) => u.def === "wolf");
  let lonely = 0;
  for (const a of wolves) {
    const mates = wolves.filter((b) => b !== a && Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) < 8 * SUB).length;
    if (mates === 0) lonely++;
  }

  // ── fires ──
  const fires = w.campfires.length;
  const seats = w.map.starts;
  const seatLit = seats.every((s) =>
    w.campfires.some((f) => Math.hypot(f.x / SUB - s.x, f.y / SUB - s.y) < 10),
  );
  let tooClose = 0;
  for (let i = 0; i < w.campfires.length; i++)
    for (let j = i + 1; j < w.campfires.length; j++) {
      const a = w.campfires[i], b = w.campfires[j];
      // Hearths are laid beside buildings and may legitimately crowd; the
      // camps scattered at generation may not.
      if (a.hearth || b.hearth) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < 8 * SUB) tooClose++;
    }
  const onLand = w.campfires.every((f) => w.map.isWalkable(Math.floor(f.x / SUB), Math.floor(f.y / SUB), "land"));

  return { counts, lonelyWolves: lonely, fires, seatLit, tooClose, onLand };
});

/**
 * Sleep, on an empty map.
 *
 * With the wild switched off, because a wolf pack drifting within earshot of
 * the base keeps the whole garrison on its feet -- which is exactly what it is
 * supposed to do, and which makes "did anybody lie down" a coin toss on a
 * random map. What is being checked here is the sleeping, so everything that
 * could legitimately prevent it is removed and the only things that wake a man
 * are the two the test does on purpose.
 */
const rest = await page.evaluate(() => {
  const g = window.game;
  g.settingsForTest.mapId = "random";
  g.settingsForTest.crowning = false;
  g.settingsForTest.stockade = false;
  g.settingsForTest.wildlife = false;
  g.start("none");
  const w = g.world, SUB = 64, DAY = 20 * 240;

  // Run to the middle of the night with nobody given anything to do.
  const men = [...w.units()].filter((u) => u.owner === 1 && !window.rts.UNITS[u.def].beast);
  /** Tick forward until the clock is inside a given band of the day. */
  const until = (lo, hi) => {
    for (let i = 0; i < DAY * 2; i++) {
      const t = w.tick % DAY;
      if (t >= DAY * lo && t <= DAY * hi) return;
      g.tick();
    }
  };
  until(0.9, 0.99);
  const asleepAtNight = men.filter((m) => w.entities.get(m.id)?.asleep).length;

  // A sleeper is exactly as alive as he was: sleep must cost and pay nothing.
  // Measured per man across five seconds of sleeping, rather than across the
  // whole night -- a bear wandering into the base would otherwise fail this.
  const marked = men
    .map((m) => w.entities.get(m.id))
    .filter((u) => u && u.asleep)
    .map((u) => ({ id: u.id, hp: u.hp }));
  for (let i = 0; i < 20 * 5; i++) g.tick();
  const hpUnchanged = marked.every((s) => {
    const u = w.entities.get(s.id);
    return !u || !u.asleep || u.hp === s.hp;
  });

  // An order wakes a man on the spot.
  const sleeper = men.find((m) => w.entities.get(m.id)?.asleep);
  let wokeOnOrder = null;
  if (sleeper) {
    g.issue({ type: "move", player: 1, units: [sleeper.id], x: sleeper.pos.x + 6 * SUB, y: sleeper.pos.y });
    g.tick();
    wokeOnOrder = w.entities.get(sleeper.id).asleep === false;
  }

  // And so does something hostile turning up.
  const other = men.find((m) => m.id !== sleeper?.id && w.entities.get(m.id)?.asleep);
  let wokeOnThreat = null;
  if (other) {
    const at = w.entities.get(other.id);
    w.spawnUnit(2, "footman", { x: at.pos.x + 6 * SUB, y: at.pos.y });
    for (let i = 0; i < 15; i++) g.tick();
    wokeOnThreat = w.entities.get(other.id).asleep === false;
  }

  // Nobody sleeps in the middle of the day.
  until(0.36, 0.58);
  for (let i = 0; i < 20 * 10; i++) g.tick();
  const asleepAtNoon = [...w.units()].filter((u) => u.asleep).length;

  return { men: men.length, asleepAtNight, hpUnchanged, wokeOnOrder, wokeOnThreat, asleepAtNoon };
});

// The same seed must lay the same fires. Two worlds, one map id.
const same = await page.evaluate(() => {
  const g = window.game;
  const key = () => g.world.campfires.map((f) => `${f.x},${f.y},${f.hearth ? 1 : 0}`).join("|");
  g.settingsForTest.mapId = "lakeland-7927";
  g.start("none");
  const a = key();
  g.start("none");
  return { equal: a === key(), n: g.world.campfires.length };
});

// A hearth belongs to its roof: raze the barracks and the fire outside it goes
// out. Otherwise the ruins of a long match end up better lit than the towns.
const razed = await page.evaluate(() => {
  const g = window.game;
  g.settingsForTest.mapId = "random";
  g.settingsForTest.crowning = false;
  g.settingsForTest.nomad = false;
  g.start("none");
  const w = g.world;
  const hall = [...w.buildings()].find((b) => b.owner === 1 && b.def === "townhall");
  if (!hall) return null;
  // One tick first: hearths are laid by stepBuilding, so at tick zero no
  // standing building has lit one yet and the count would be measured too soon.
  g.tick();
  const before = w.campfires.length;
  const mine = w.campfires.filter((f) => f.of === hall.id).length;
  // `damage` is TypeScript-private, which is a compile-time fiction: at runtime
  // it is an ordinary method, and it is the only path that removes a building
  // the way a siege would.
  const foe = w.spawnUnit(2, "footman", { x: hall.tx * 64, y: hall.ty * 64 });
  w.damage(hall, 99999, foe);
  g.tick();
  return { before, mine, after: w.campfires.length };
});

// Noise. The calls go through the sim's own generator and out as fx events, so
// what can be checked headlessly is that they are emitted, that every species
// has a voice, and that a wolf is louder at night than at noon -- which is the
// one thing about them that is a design decision rather than a detail.
const noise = await page.evaluate(() => {
  const g = window.game;
  g.settingsForTest.mapId = "random";
  g.settingsForTest.crowning = false;
  // The settings object is shared and mutable, and the sleep run above turned
  // the wild off. An empty country makes no noise.
  g.settingsForTest.wildlife = true;
  g.start("none");
  const w = g.world, DAY = 20 * 240;
  const listen = (ticks) => {
    const heard = {};
    for (let i = 0; i < ticks; i++) {
      g.tick();
      for (const e of w.fx) if (e.kind === "call") heard[e.def] = (heard[e.def] ?? 0) + 1;
    }
    return heard;
  };
  // Noon first, then the same stretch of night.
  const until = (lo, hi) => {
    for (let i = 0; i < DAY * 2; i++) {
      const t = w.tick % DAY;
      if (t >= DAY * lo && t <= DAY * hi) return;
      g.tick();
    }
  };
  until(0.36, 0.4);
  const byDay = listen(DAY * 0.15);
  until(0.85, 0.89);
  const byNight = listen(DAY * 0.15);
  return { byDay, byNight };
});

// Meat: hunt one of each edible animal and see the larder fill.
const meat = await page.evaluate(() => {
  const g = window.game;
  g.settingsForTest.mapId = "random";
  g.settingsForTest.wildlife = true;
  g.start("none");
  const w = g.world, SUB = 64;
  const out = {};
  for (const kind of ["deer", "cow", "sheep"]) {
    const p = w.players.get(1);
    const before = p.food;
    const beast = [...w.units()].find((u) => u.def === kind);
    if (!beast) { out[kind] = null; continue; }
    const band = [];
    for (let i = 0; i < 5; i++) {
      band.push(w.spawnUnit(1, "knight", { x: beast.pos.x + (1 + i) * SUB, y: beast.pos.y }).id);
    }
    g.issue({ type: "attack", player: 1, units: band, target: beast.id });
    for (let i = 0; i < 3000 && w.entities.get(beast.id); i++) g.tick();
    out[kind] = w.entities.get(beast.id) ? null : w.players.get(1).food - before;
    for (const id of band) w.entities.delete(id);
  }
  return out;
});
await browser.close();

console.log(`the wild holds: ${Object.entries(r.counts).map(([k, v]) => `${v} ${k}`).join(", ")}`);
console.log(`wolves with no pack around them: ${r.lonelyWolves}`);
console.log(`fires on the map: ${r.fires} (every seat lit: ${r.seatLit}, all on walkable land: ${r.onLand})`);
console.log(`same map, same fires: ${same.equal} (${same.n} of them)`);
console.log(`of ${rest.men} men left alone at night, ${rest.asleepAtNight} lay down; at noon ${rest.asleepAtNoon} did`);
console.log(`woken by an order: ${rest.wokeOnOrder}; woken by an enemy: ${rest.wokeOnThreat}; hit points untouched: ${rest.hpUnchanged}`);
console.log(`meat: deer ${meat.deer}, cow ${meat.cow}, sheep ${meat.sheep}`);
const say = (h) => Object.entries(h).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing";
console.log(`heard by day: ${say(noise.byDay)}`);
console.log(`heard by night: ${say(noise.byNight)}`);

const fail = [];
for (const kind of ["bear", "wolf", "deer", "cow", "sheep"]) {
  if (!r.counts[kind]) fail.push(`no ${kind} was placed anywhere on the map`);
}
if (r.lonelyWolves > 0) fail.push(`${r.lonelyWolves} wolves are hunting alone — the pack is the whole point of them`);
// Teeth on the board: a wolf is worth roughly a third of a bear.
const teeth = (r.counts.bear ?? 0) + (r.counts.wolf ?? 0) / 3;
if (teeth > 18) fail.push(`the wild now carries ${Math.round(teeth)} bears' worth of teeth — variety became lethality`);
if (r.fires < 4) fail.push(`only ${r.fires} fires were laid`);
if (!r.seatLit) fail.push("a seat has no fire near it, so somebody's first night is spent in the dark");
if (r.tooClose > 0) fail.push(`${r.tooClose} pairs of camps are close enough to share one pool of light`);
if (!r.onLand) fail.push("a fire was laid in the water");
if (!same.equal) fail.push("two worlds on the same map laid different fires — that desyncs a network game");
if (rest.asleepAtNight < 1) fail.push("not one man lay down all night");
if (rest.asleepAtNoon > 0) fail.push(`${rest.asleepAtNoon} units were asleep at midday`);
if (rest.wokeOnOrder !== true) fail.push("a sleeping man did not get up when he was given an order");
if (rest.wokeOnThreat !== true) fail.push("a sleeping man did not wake when an enemy walked up to him");
if (!rest.hpUnchanged) fail.push("sleeping changed a man's hit points — it is meant to be a paint job, not a mechanic");
for (const [kind, got] of Object.entries(meat)) {
  if (got === null) fail.push(`could not hunt a ${kind} to see what it paid`);
  else if (got <= 0) fail.push(`killing a ${kind} paid ${got} food`);
}
if (razed) {
  console.log(`hall razed: ${razed.before} fires with it, ${razed.after} without (it owned ${razed.mine})`);
  if (razed.mine !== 1) fail.push(`a town hall owned ${razed.mine} hearths, expected exactly one`);
  else if (razed.after !== razed.before - 1) fail.push("razing a hall left its hearth burning in the ruins");
}

const anyHeard = { ...noise.byDay };
for (const [k, v] of Object.entries(noise.byNight)) anyHeard[k] = (anyHeard[k] ?? 0) + v;
for (const kind of ["bear", "wolf", "deer", "cow", "sheep"]) {
  if (!anyHeard[kind]) fail.push(`a ${kind} never made a sound in two thirds of a day`);
}
if ((noise.byNight.wolf ?? 0) <= (noise.byDay.wolf ?? 0)) {
  fail.push("wolves were no louder at night than at noon — the country after dark is meant to be theirs");
}

if (fail.length) {
  for (const f of fail) console.log("FAIL: " + f);
  process.exit(1);
}
console.log("PASS: the men sleep, the fires burn, and there is something out there making a noise");
