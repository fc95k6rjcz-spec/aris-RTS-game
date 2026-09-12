/**
 * The submarine: strikes anything, and almost nothing strikes back.
 *
 * The rule is asymmetric on purpose. A submerged hull is not merely hard to see,
 * it is out of reach: a footman cannot swing at it, a tower cannot depress that
 * far, a battleship's main battery fires flat over the top of it. Only a
 * ballista, which lobs its bolt, and another submarine, which is down there with
 * it, have any answer. So a submarine loose in your harbour is a problem you had
 * to have prepared for.
 *
 * Checked both ways: the sub hurts a footman, an archer and a building; and a
 * footman, an archer and a battleship cannot touch the sub, while a ballista and
 * a rival submarine can.
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
  g.settingsForTest.crowning = false;
  g.settingsForTest.stockade = false;
  g.start("none");
  const w = g.world, SUB = 64;
  const seat = w.map.starts[0];
  // A channel with a beach beside it: the sub sits in the water, its victims and
  // its hunters stand on the shore within reach.
  const x0 = seat.x + 6, y0 = seat.y + 6;
  for (let y = y0; y < y0 + 6; y++) for (let x = x0; x < x0 + 20; x++) w.map.set(x, y, 2);

  // Does `attacker` (owner 2) manage to hurt a fresh submarine (owner 1)?
  const canHit = (def) => {
    const sub = w.spawnUnit(1, "submarine", { x: (x0 + 6) * SUB, y: (y0 + 2) * SUB });
    const sea = UNITS_DOMAIN(def) === "sea";
    const a = w.spawnUnit(2, def, {
      x: (x0 + 6) * SUB,
      y: (sea ? y0 + 4 : y0 + 7) * SUB,
    });
    const hp0 = sub.hp;
    g.issue({ type: "attack", player: 2, units: [a.id], target: sub.id });
    for (let i = 0; i < 600; i++) g.tick();
    const hurt = (w.entities.get(sub.id)?.hp ?? 0) < hp0 || !w.entities.get(sub.id);
    if (w.entities.get(sub.id)) w.removeEntityForTest?.(sub.id);
    for (const u of [...w.units()]) if (u.owner === 2) u.hp = 0.0001;
    for (let i = 0; i < 2; i++) g.tick();
    return hurt;
  };
  function UNITS_DOMAIN(def) {
    return window.rts?.UNITS?.[def]?.domain ?? (def === "battleship" || def === "submarine" ? "sea" : "land");
  }

  const attackers = {};
  for (const def of ["footman", "archer", "battleship", "ballista", "submarine"]) attackers[def] = canHit(def);

  // And the sub's own guns: a man, and a building.
  const sub = w.spawnUnit(1, "submarine", { x: (x0 + 3) * SUB, y: (y0 + 2) * SUB });
  const victim = w.spawnUnit(2, "footman", { x: (x0 + 3) * SUB, y: (y0 + 6) * SUB });
  const vhp = victim.hp;
  g.issue({ type: "attack", player: 1, units: [sub.id], target: victim.id });
  for (let i = 0; i < 400; i++) g.tick();
  const hurtMan = (w.entities.get(victim.id)?.hp ?? 0) < vhp || !w.entities.get(victim.id);

  // Find open ground for the target building rather than trusting a fixed tile:
  // the generated map may have put trees, or a floe, exactly there.
  let bld = null;
  for (let d = 0; d < 8 && !bld; d++) bld = w.placeBuilding(2, "farm", x0 + 8 + d, y0 + 6, true);
  const bhp = bld.hp;
  g.issue({ type: "attack", player: 1, units: [sub.id], target: bld.id });
  for (let i = 0; i < 600; i++) g.tick();
  const hurtBuilding = (w.entities.get(bld.id)?.hp ?? 0) < bhp || !w.entities.get(bld.id);

  return { attackers, hurtMan, hurtBuilding };
});
await browser.close();

for (const [def, hit] of Object.entries(r.attackers)) console.log(`${def.padEnd(11)} ${hit ? "hurts the submarine" : "cannot touch it"}`);
console.log(`submarine vs a footman:  ${r.hurtMan ? "hurts him" : "no damage"}`);
console.log(`submarine vs a building: ${r.hurtBuilding ? "hurts it" : "no damage"}`);

const fail = [];
if (!r.hurtMan) fail.push("the submarine could not hit a man");
if (!r.hurtBuilding) fail.push("the submarine could not hit a building");
for (const def of ["footman", "archer", "battleship"]) if (r.attackers[def]) fail.push(`${def} hit a submerged submarine`);
for (const def of ["ballista", "submarine"]) if (!r.attackers[def]) fail.push(`${def} should be able to hit a submarine and could not`);
if (fail.length) {
  for (const f of fail) console.log("FAIL: " + f);
  process.exit(1);
}
console.log("PASS: it shoots everything, and only ballistae and other submarines shoot it");
