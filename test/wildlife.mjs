/**
 * Bears.
 *
 * The point of them is the first five minutes: the King walks out alone to find
 * his weapon, and the country between here and there is not empty. So what has
 * to be true is that a bear is a real threat to one man, that it stays in its
 * own patch of country rather than joining the war, that it is nowhere near
 * anybody's seat at the start, and that killing one pays.
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
  g.settingsForTest.crowning = false;
  g.settingsForTest.stockade = false;
  g.start("none");
  const w = g.world, SUB = 64;
  const bears = () => w.units().filter((u) => u.def === "bear");
  const born = bears().length;
  const seats = w.map.starts;
  let nearest = Infinity;
  for (const b of bears())
    for (const s of seats) nearest = Math.min(nearest, Math.hypot(b.pos.x / SUB - s.x, b.pos.y / SUB - s.y));

  // Do they hold their ground rather than marching on the nearest town?
  const home = bears().map((b) => ({ id: b.id, x: b.pos.x / SUB, y: b.pos.y / SUB }));
  for (let i = 0; i < 2400; i++) g.tick();
  let drift = 0;
  for (const h of home) {
    const b = w.entities.get(h.id);
    if (b) drift = Math.max(drift, Math.hypot(b.pos.x / SUB - h.x, b.pos.y / SUB - h.y));
  }

  // One peasant against one bear, in a clearing well away from anything.
  const bear = bears()[0];
  const p = w.players.get(1);
  const gold0 = p.gold;
  const man = w.spawnUnit(1, "worker", { x: bear.pos.x + 3 * SUB, y: bear.pos.y });
  let manDead = false;
  for (let i = 0; i < 1200; i++) {
    g.tick();
    if (!w.entities.get(man.id)) {
      manDead = true;
      break;
    }
  }

  // And a warband against one: it should die, and pay.
  const bear2 = bears()[0];
  const gold1 = w.players.get(1).gold;
  const band = [];
  for (let i = 0; i < 4; i++) band.push(w.spawnUnit(1, "footman", { x: bear2.pos.x + (2 + i) * SUB, y: bear2.pos.y }).id);
  g.issue({ type: "attack", player: 1, units: band, target: bear2.id });
  let bearDead = false;
  for (let i = 0; i < 2000; i++) {
    g.tick();
    if (!w.entities.get(bear2.id)) {
      bearDead = true;
      break;
    }
  }
  const paid = w.players.get(1).gold - gold1;
  return { born, nearest: Math.round(nearest), drift: Math.round(drift), manDead, bearDead, paid, winner: w.winner };
});
await browser.close();

console.log(`bears on the board: ${r.born}, nearest one ${r.nearest} tiles from a seat`);
console.log(`furthest any bear wandered in two minutes: ${r.drift} tiles`);
console.log(`one peasant alone against a bear: ${r.manDead ? "killed" : "survived"}`);
console.log(`four footmen against a bear: ${r.bearDead ? "bear killed" : "bear survived"}, paid ${r.paid} gold`);

const fail = [];
if (r.born < 3) fail.push(`only ${r.born} bears were placed`);
if (r.nearest < 16) fail.push(`a bear started ${r.nearest} tiles from a seat`);
if (r.drift > 14) fail.push(`a bear wandered ${r.drift} tiles from home — that is a second army, not wildlife`);
if (!r.manDead) fail.push("a lone peasant survived a bear, so it is not a threat worth planning around");
if (!r.bearDead) fail.push("four footmen could not kill one bear");
if (r.paid < 60) fail.push(`killing a bear paid ${r.paid} gold`);
if (r.winner !== null) fail.push("the wild was counted as a player and decided the match");
if (fail.length) {
  for (const f of fail) console.log("FAIL: " + f);
  process.exit(1);
}
console.log("PASS: the country has bears in it, and they are worth thinking about");

// And the thing everyone checks first: can you simply walk away from a bear?
const chase = await (async () => {
  const b2 = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p2 = await b2.newPage({ viewport: { width: 900, height: 600 } });
  await p2.setContent(html);
  await p2.waitForFunction(() => !!window.game);
  const out = await p2.evaluate(() => {
    const g = window.game;
    const U = window.rts?.UNITS;
    return {
      bear: U ? U.bear.speed : null,
      onFoot: U ? ["worker", "footman", "archer", "king", "prince", "mage", "ballista"].map((d) => U[d].speed) : [],
    };
  });
  await b2.close();
  return out;
})();
if (chase.bear !== null) {
  console.log(`bear speed ${chase.bear} against men on foot ${chase.onFoot.join(", ")}`);
  if (chase.onFoot.some((s) => s >= chase.bear)) {
    console.log("FAIL: something on foot can outrun a bear");
    process.exit(1);
  }
  console.log("PASS: nobody on foot outruns a bear");
}
