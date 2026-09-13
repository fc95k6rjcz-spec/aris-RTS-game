/**
 * The Blackrock.
 *
 * They are a race you meet, not a race you play, and the difference is the
 * whole specification. What has to be true:
 *
 *   - there are camps, they are laid the same way on every machine, and they
 *     are nowhere near anybody's seat -- a war camp on your doorstep at tick
 *     zero is a map you lost before you looked at it;
 *   - a camp is a stronghold, some huts and a garrison that holds its ground
 *     rather than joining the war on turn one;
 *   - it kills what walks into it, and clearing one pays;
 *   - it replaces what it loses, so clearing one is a job you finish;
 *   - left alone long enough it sends a warband at somebody -- that is the bill
 *     for ignoring it;
 *   - and none of it decides the match: orcs are not a third player, they do
 *     not win, and a human cannot build their huts.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

const MARAUDER = 8;

// 1. The camps, as laid.
const camps = await page.evaluate((MARAUDER) => {
  const g = window.game;
  g.settingsForTest.mapId = "random";
  g.settingsForTest.crowning = false;
  g.settingsForTest.stockade = false;
  g.start("none");
  const w = g.world, SUB = 64;
  w.scheduleDragon(1e9);
  const halls = [...w.buildings()].filter((b) => b.def === "stronghold");
  const huts = [...w.buildings()].filter((b) => b.def === "warhut");
  const orcs = [...w.units()].filter((u) => u.owner === MARAUDER);
  let nearestSeat = Infinity;
  for (const h of halls) for (const s of w.map.starts) nearestSeat = Math.min(nearestSeat, Math.hypot(h.tx - s.x, h.ty - s.y));
  // Every camp should have somebody in it, and huts near it.
  let emptiest = Infinity, hutless = 0;
  for (const h of halls) {
    const c = { x: (h.tx + 2) * SUB, y: (h.ty + 2) * SUB };
    emptiest = Math.min(emptiest, orcs.filter((u) => Math.hypot(u.pos.x - c.x, u.pos.y - c.y) < 12 * SUB).length);
    if (!huts.some((b) => Math.hypot((b.tx + 1) * SUB - c.x, (b.ty + 1) * SUB - c.y) < 12 * SUB)) hutless++;
  }
  const kinds = {};
  for (const u of orcs) kinds[u.def] = (kinds[u.def] ?? 0) + 1;
  return { halls: halls.length, huts: huts.length, orcs: orcs.length, kinds,
           nearestSeat: Math.round(nearestSeat), emptiest, hutless };
}, MARAUDER);

// 2. The same map lays the same camps.
const same = await page.evaluate(() => {
  const g = window.game;
  g.settingsForTest.mapId = "lakeland-7927";
  const key = () => [...g.world.buildings()].filter((b) => b.owner === 8).map((b) => `${b.def}@${b.tx},${b.ty}`).sort().join("|");
  g.start("none");
  const a = key();
  g.start("none");
  return { equal: a === key(), n: a.split("|").length };
});

// 3. They hold their ground, kill what comes in, and pay for it.
const fight = await page.evaluate((MARAUDER) => {
  const g = window.game;
  g.settingsForTest.mapId = "random";
  g.start("none");
  const w = g.world, SUB = 64;
  w.scheduleDragon(1e9);
  const hall = [...w.buildings()].find((b) => b.def === "stronghold");
  const c = { x: (hall.tx + 2) * SUB, y: (hall.ty + 2) * SUB };
  // This camp's orcs only. Measuring every orc on the map against one camp's
  // middle just measures how far apart the camps are.
  const homeBefore = [...w.units()]
    .filter((u) => u.owner === MARAUDER && Math.hypot(u.pos.x - c.x, u.pos.y - c.y) < 12 * SUB)
    .map((u) => ({ id: u.id, x: u.pos.x, y: u.pos.y }));

  // Left alone for two minutes, do they stay home?
  for (let i = 0; i < 20 * 120; i++) g.tick();
  let drift = 0;
  for (const h of homeBefore) {
    const u = w.entities.get(h.id);
    if (u) drift = Math.max(drift, Math.hypot(u.pos.x - c.x, u.pos.y - c.y) / SUB);
  }

  // One peasant wanders in.
  const man = w.spawnUnit(1, "worker", { x: c.x + 3 * SUB, y: c.y });
  let manDead = false;
  for (let i = 0; i < 20 * 90; i++) { g.tick(); if (!w.entities.get(man.id)) { manDead = true; break; } }

  // And a proper warband comes to clear it.
  const gold = w.players.get(1).gold;
  const army = [];
  for (let i = 0; i < 14; i++) army.push(w.spawnUnit(1, "knight", { x: c.x + (6 + (i % 7)) * SUB, y: c.y + Math.floor(i / 7) * SUB }).id);
  // Attack-move, which is how a camp is actually cleared: ordering the army
  // straight at the stronghold makes it walk past every orc in the place
  // without swinging at one, so the hall comes down and nobody gets paid.
  g.issue({ type: "attackMove", player: 1, units: army, x: c.x, y: c.y });
  let hallDown = false;
  for (let i = 0; i < 20 * 400; i++) { g.tick(); if (!w.entities.get(hall.id)) { hallDown = true; break; } }
  const paid = w.players.get(1).gold - gold;

  // And the exact figure, on one orc, because the number above is "whatever
  // happened to die before the hall fell" and makes a poor assertion.
  const lone = [...w.units()].find((u) => u.owner === MARAUDER && u.def === "grunt");
  let perGrunt = null;
  if (lone) {
    const before = w.players.get(1).gold;
    const killer = w.spawnUnit(1, "knight", { x: lone.pos.x + SUB, y: lone.pos.y });
    g.issue({ type: "attack", player: 1, units: [killer.id], target: lone.id });
    for (let i = 0; i < 20 * 90 && w.entities.get(lone.id); i++) g.tick();
    if (!w.entities.get(lone.id)) perGrunt = w.players.get(1).gold - before;
  }
  return { drift: Math.round(drift), manDead, hallDown, paid, perGrunt };
}, MARAUDER);

// 4. A camp replaces what it loses.
const regrow = await page.evaluate((MARAUDER) => {
  const g = window.game;
  g.start("none");
  const w = g.world, SUB = 64;
  w.scheduleDragon(1e9);
  const hall = [...w.buildings()].find((b) => b.def === "stronghold");
  const c = { x: (hall.tx + 2) * SUB, y: (hall.ty + 2) * SUB };
  const near = () => [...w.units()].filter((u) => u.owner === MARAUDER && Math.hypot(u.pos.x - c.x, u.pos.y - c.y) < 12 * SUB).length;
  // Kill the garrison outright and see whether the camp fills up again.
  for (const u of [...w.units()]) if (u.owner === MARAUDER) w.entities.delete(u.id);
  const emptied = near();
  for (let i = 0; i < 20 * 600; i++) g.tick();
  return { emptied, after: near() };
}, MARAUDER);

// 5. Raids, and the things that must never happen.
const raid = await page.evaluate((MARAUDER) => {
  const g = window.game;
  g.settingsForTest.mapId = "random";
  g.start("none");
  const w = g.world, SUB = 64;
  w.scheduleDragon(1e9);
  const homes = new Map();
  for (const b of w.buildings()) if (b.owner === MARAUDER && b.def === "stronghold") homes.set(b.id, { x: (b.tx + 2) * SUB, y: (b.ty + 2) * SUB });
  let raiders = 0, warned = 0, firstAt = null;
  for (let i = 0; i < 20 * 60 * 30; i++) {
    g.tick();
    for (const e of w.events) if (e.text.includes("left their camp")) { warned++; firstAt ??= w.tick; }
  }
  // Anybody a long way from every camp is on the road.
  for (const u of w.units()) {
    if (u.owner !== MARAUDER) continue;
    let d = Infinity;
    for (const h of homes.values()) d = Math.min(d, Math.hypot(u.pos.x - h.x, u.pos.y - h.y) / SUB);
    if (d > 20) raiders++;
  }
  return { warned, firstAt, raiders, winner: w.winner };
}, MARAUDER);

const rules = await page.evaluate(() => {
  const menu = window.rts.BUILDINGS;
  return {
    inMenu: ["stronghold", "warhut"].filter((id) => window.game.buildMenuForTest?.includes?.(id) ?? false),
    defined: ["stronghold", "warhut"].every((id) => !!menu[id]),
  };
});
await browser.close();

console.log(`camps: ${camps.halls} strongholds, ${camps.huts} huts, ${camps.orcs} orcs (${Object.entries(camps.kinds).map(([k, v]) => `${v} ${k}`).join(", ")})`);
console.log(`nearest camp to a seat: ${camps.nearestSeat} tiles; emptiest camp holds ${camps.emptiest}; camps with no hut: ${camps.hutless}`);
console.log(`same map, same camps: ${same.equal} (${same.n} buildings)`);
console.log(`garrison drift over two minutes: ${fight.drift} tiles`);
console.log(`one peasant walking into a camp: ${fight.manDead ? "killed" : "survived"}`);
console.log(`fourteen knights sent to clear it: stronghold ${fight.hallDown ? "pulled down" : "still standing"}, paid ${fight.paid} gold on the way`);
console.log(`one grunt, killed on its own: ${fight.perGrunt} gold`);
console.log(`garrison wiped to ${regrow.emptied}, back to ${regrow.after} after five minutes`);
console.log(`over thirty minutes: ${raid.warned} raids called, first at tick ${raid.firstAt}, ${raid.raiders} orcs out on the road`);

const fail = [];
if (camps.halls < 1) fail.push("no war camp was placed anywhere");
if (camps.huts < camps.halls) fail.push(`${camps.halls} strongholds but only ${camps.huts} huts`);
if (camps.hutless > 0) fail.push(`${camps.hutless} camps have no hut near them`);
if (camps.nearestSeat < 20) fail.push(`a camp sits ${camps.nearestSeat} tiles from a seat`);
if (camps.emptiest < 3) fail.push(`a camp was garrisoned by only ${camps.emptiest} orcs`);
if (!camps.kinds.grunt) fail.push("no grunts anywhere");
if (!same.equal) fail.push("two worlds on the same map laid different camps — that desyncs a network game");
if (fight.drift > 16) fail.push(`a garrison wandered ${fight.drift} tiles from its camp — that is an army, not a garrison`);
if (!fight.manDead) fail.push("a lone peasant walked into a war camp and lived");
if (!fight.hallDown) fail.push("fourteen knights could not pull down one stronghold");
if (fight.hallDown && fight.paid <= 0) fail.push("taking a camp apart paid nothing at all");
if (fight.perGrunt === null) fail.push("could not kill a single grunt to see what it paid");
else if (fight.perGrunt < 15) fail.push(`killing a grunt paid ${fight.perGrunt} gold, not its bounty`);
if (regrow.emptied !== 0) fail.push("could not empty a camp to test whether it refills");
if (regrow.after < 3) fail.push(`an emptied camp only got back to ${regrow.after} orcs, so clearing one is not a job you finish`);
if (raid.warned < 1) fail.push("no camp ever sent a warband in half an hour");
if (raid.firstAt !== null && raid.firstAt < 20 * 60 * 8) fail.push(`the first raid came at tick ${raid.firstAt}, before anybody could answer it`);
if (raid.raiders < 1) fail.push("raids were announced but nobody actually left home");
if (raid.winner === 8) fail.push("the Blackrock won the match");
if (rules.inMenu.length) fail.push(`a player can build ${rules.inMenu.join(", ")}`);
if (!rules.defined) fail.push("the orc buildings are missing from the table");
if (fail.length) {
  for (const f of fail) console.log("FAIL: " + f);
  process.exit(1);
}
console.log("PASS: the camps hold their ground, kill what walks in, grow back, and eventually come for you");
