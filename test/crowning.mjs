/**
 * Act one: the peasant, the weapon, and the crown.
 *
 * Three things have to hold, and the first is the one that makes it a story
 * rather than a pickup: before the weapon is found the player is *stuck*. He has
 * a purse and a man and no way to spend it, because founding a hall is royal
 * work and there is no royal line yet. Then he finds the thing, and the game he
 * knows begins.
 *
 * Checked here: no king at the start and the Town Hall refused; the weapon lies
 * out of sight and out of reach of the opening view; walking onto it crowns the
 * same man -- same id, so a selection survives it -- and the hall is then
 * allowed. Finally the opponent has to manage its own errand, or it never plays.
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
  g.settingsForTest.crowning = true;
  g.settingsForTest.stockade = false; // tested on its own; not the subject here
  g.start("none");
  const w = g.world;
  const SUB = 64;

  const man = w.units().find((u) => u.owner === 1);
  const relic = w.relics.find((x) => x.owner === 1);
  // He must be able to walk to it: a King is a land animal, and a weapon across
  // a lake is a match that cannot start.
  const reachable = w.map.connected(
    Math.floor(man.pos.x / SUB),
    Math.floor(man.pos.y / SUB),
    relic.x,
    relic.y,
    "land",
  );
  const before = {
    units: w.units().filter((u) => u.owner === 1).length,
    def: man.def,
    royals: w.units().filter((u) => u.owner === 1 && u.def === "king").length,
    distance: Math.round(Math.hypot(man.pos.x / SUB - relic.x, man.pos.y / SUB - relic.y)),
    seen: w.vision.get(1).at(relic.x, relic.y),
  };

  // Try to found a hall as a commoner. It must be refused.
  g.issue({ type: "build", player: 1, units: [man.id], building: "townhall", tx: relic.x, ty: relic.y });
  for (let i = 0; i < 20; i++) g.tick();
  const hallsAsCommoner = w.buildings().filter((b) => b.owner === 1).length;

  // Walk him to it.
  g.issue({ type: "move", player: 1, units: [man.id], x: (relic.x + 0.5) * SUB, y: (relic.y + 0.5) * SUB });
  let crownedAt = -1;
  for (let i = 0; i < 4000; i++) {
    g.tick();
    if (relic.taken) {
      crownedAt = i;
      break;
    }
  }

  const followers = w.units().filter((u) => u.owner === 1 && u.def === "worker").length;
  const same = w.entities.get(man.id);
  const after = { def: same ? same.def : "gone", id: same ? same.id : -1, sameId: same ? same.id === man.id : false };

  // And now the hall is allowed. One site, chosen because it is actually
  // buildable, and time enough for a King walking at a walk to get there: the
  // first version issued an order every ten ticks at a fresh tile, which simply
  // cancelled itself over and over once men stopped sprinting.
  const hall = w.units().find((u) => u.owner === 1 && u.def === "king");
  let sited = null;
  // Start well clear of the King and his followers: the footprint has to be
  // empty of people, and they are all standing where he was crowned.
  for (let r2 = 6; r2 < 14 && !sited; r2++)
    for (let dy = -r2; dy <= r2 && !sited; dy++)
      for (let dx = -r2; dx <= r2 && !sited; dx++) {
        const tx = Math.floor(hall.pos.x / SUB) + dx;
        const ty = Math.floor(hall.pos.y / SUB) + dy;
        if (w.map.canPlace(tx, ty, 4)) sited = { tx, ty };
      }
  const why = sited ? w.placementError(1, "townhall", sited.tx, sited.ty, true) : "no site found";
  if (sited) g.issue({ type: "build", player: 1, units: [hall.id], building: "townhall", tx: sited.tx, ty: sited.ty });
  for (let i = 0; i < 3000; i++) g.tick();
  const hallsAsKing = w.buildings().filter((b) => b.owner === 1).length;

  return { why, sited, purse: { g: w.players.get(1).gold, l: w.players.get(1).lumber }, before, hallsAsCommoner, crownedAt, after, hallsAsKing, followers, reachable };
});
await browser.close();

console.log(`start: ${r.before.units} unit (${r.before.def}), ${r.before.royals} royals, weapon ${r.before.distance} tiles away, visibility ${r.before.seen} (0 = unexplored)`);
console.log(`halls a commoner managed to found: ${r.hallsAsCommoner}`);
console.log(`crowned at tick ${r.crownedAt}; he is now a ${r.after.def}, same unit: ${r.after.sameId}`);
console.log(`halls a King managed to found: ${r.hallsAsKing} (site ${JSON.stringify(r.sited)}, error ${r.why}, purse ${r.purse.g}g ${r.purse.l}w)`);
console.log(`followers who came to serve: ${r.followers}`);
console.log(`the weapon is reachable on foot: ${r.reachable}`);

const fail = [];
if (r.before.royals !== 0) fail.push("the match started with a King already crowned");
if (r.before.def !== "worker") fail.push(`the match started with a ${r.before.def} rather than a peasant`);
if (r.before.distance < 12) fail.push("the weapon is close enough to be collected rather than found");
if (r.before.seen !== 0) fail.push("the weapon is visible from the opening position");
if (r.hallsAsCommoner !== 0) fail.push("a commoner founded a Town Hall");
if (r.crownedAt < 0) fail.push("walking onto the weapon did not crown him");
if (!r.after.sameId || r.after.def !== "king") fail.push("the crowning replaced the man instead of promoting him");
if (r.hallsAsKing < 1) fail.push("a crowned King still could not found a hall");
if (!r.reachable) fail.push("the weapon was laid down somewhere he cannot walk to");
if (r.followers < 4) fail.push(`only ${r.followers} followers turned up for the crowning`);
if (fail.length) {
  for (const f of fail) console.log("FAIL: " + f);
  process.exit(1);
}
console.log("PASS: one peasant, one weapon in the dark, and a kingdom that starts when he picks it up");
