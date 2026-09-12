/**
 * Pack ice, and the ship that opens it.
 *
 * Ice is the only terrain a unit changes on purpose, so it is worth being strict
 * about what it does before anyone breaks it:
 *
 *   - it stops ships, and only ships. Infantry walk over a floe like ground,
 *     which is the whole tactical point of a frozen map;
 *   - an Icebreaker crosses it and leaves open water behind her, so the fleet
 *     can follow where she has been;
 *   - she can put her bow on a beach, and cannot tour the fields behind it.
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
  g.settingsForTest.crowning = false;
  g.settingsForTest.stockade = false;
  g.settingsForTest.mapId = "random";
  g.start("none");
  const w = g.world, SUB = 64, WATER = 2, ICE = 6, GRASS = 0;
  const seat = w.map.starts[0];

  // A channel running east, frozen solid across the middle.
  const x0 = seat.x + 5, y0 = seat.y + 5;
  for (let y = y0; y < y0 + 5; y++) for (let x = x0; x < x0 + 30; x++) w.map.set(x, y, WATER);
  for (let y = y0; y < y0 + 5; y++) for (let x = x0 + 12; x < x0 + 16; x++) w.map.set(x, y, ICE);

  const walkable = (x, y, dom) => w.map.isWalkable(x, y, dom);
  const floe = { x: x0 + 13, y: y0 + 2 };
  const rules = {
    shipOnIce: walkable(floe.x, floe.y, "sea"),
    footOnIce: walkable(floe.x, floe.y, "land"),
    breakerOnIce: walkable(floe.x, floe.y, "icebreaker"),
    breakerOnBeach: walkable(x0 + 2, y0 - 1, "icebreaker"),
    breakerInland: walkable(x0 + 2, y0 - 6, "icebreaker"),
  };

  // A longboat cannot reach the far end; an icebreaker can.
  const far = { x: x0 + 28, y: y0 + 2 };
  const boatReaches = w.map.connected(x0 + 2, y0 + 2, far.x, far.y, "sea");

  // Send her through and count the lane she leaves.
  const ice0 = (() => { let n = 0; for (let y = y0; y < y0 + 5; y++) for (let x = x0; x < x0 + 30; x++) if (w.map.get(x, y) === ICE) n++; return n; })();
  const breaker = w.spawnUnit(1, "icebreaker", { x: (x0 + 2) * SUB, y: (y0 + 2) * SUB });
  g.issue({ type: "move", player: 1, units: [breaker.id], x: far.x * SUB, y: far.y * SUB });
  let arrived = -1;
  for (let i = 0; i < 6000; i++) {
    g.tick();
    if (arrived < 0 && breaker.pos.x / SUB > far.x - 1.5) arrived = i;
    if (arrived >= 0) break;
  }
  const ice1 = (() => { let n = 0; for (let y = y0; y < y0 + 5; y++) for (let x = x0; x < x0 + 30; x++) if (w.map.get(x, y) === ICE) n++; return n; })();
  const boatReachesNow = w.map.connected(x0 + 2, y0 + 2, far.x, far.y, "sea");
  return { rules, boatReaches, boatReachesNow, ice0, ice1, arrived };
});
await browser.close();

console.log(`a ship on a floe:        ${r.rules.shipOnIce ? "passes" : "blocked"}`);
console.log(`a footman on a floe:     ${r.rules.footOnIce ? "walks over it" : "blocked"}`);
console.log(`an icebreaker on a floe: ${r.rules.breakerOnIce ? "passes" : "blocked"}`);
console.log(`icebreaker on a beach:   ${r.rules.breakerOnBeach ? "can land" : "blocked"}`);
console.log(`icebreaker inland:       ${r.rules.breakerInland ? "roams freely" : "blocked"}`);
console.log(`fleet could cross before: ${r.boatReaches}, after her run: ${r.boatReachesNow}`);
console.log(`floe tiles ${r.ice0} -> ${r.ice1}; she made the far end at tick ${r.arrived}`);

const fail = [];
if (r.rules.shipOnIce) fail.push("a ship sailed straight through pack ice");
if (!r.rules.footOnIce) fail.push("infantry could not walk on the ice");
if (!r.rules.breakerOnIce) fail.push("the icebreaker could not enter the ice");
if (!r.rules.breakerOnBeach) fail.push("the icebreaker could not beach herself");
if (r.rules.breakerInland) fail.push("the icebreaker went touring inland");
if (r.boatReaches) fail.push("the ice never sealed the channel, so the test proves nothing");
if (r.arrived < 0) fail.push("the icebreaker never got through");
if (r.ice1 >= r.ice0) fail.push("she crossed without breaking any ice");
if (!r.boatReachesNow) fail.push("the lane she left is not open to the rest of the fleet");
if (fail.length) {
  for (const f of fail) console.log("FAIL: " + f);
  process.exit(1);
}
console.log("PASS: ice stops the fleet, carries the infantry, and yields to one ship");
