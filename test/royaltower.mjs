/**
 * A King may raise a watchtower on his own authority.
 *
 * Everything else in the build list wants the chain of buildings behind it that
 * justifies it. A tower does not, for royalty: he is walking his own country
 * with no army yet, and putting a tower on the ground he means to keep is
 * exactly what a man in that position does. A peasant still needs the barracks.
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
  g.settingsForTest.wildlife = false;
  g.start("none");
  const w = g.world, SUB = 64;
  const seat = w.map.starts[0];
  const p = w.players.get(1);
  p.gold = 5000;
  p.lumber = 5000;

  const site = (dx, dy) => ({ tx: seat.x + dx, ty: seat.y + dy });
  const hasBarracks = w.buildings().some((b) => b.owner === 1 && b.def === "barracks");

  const king = w.spawnUnit(1, "king", { x: (seat.x + 3) * SUB, y: (seat.y + 5) * SUB });
  const peasant = w.units().find((u) => u.owner === 1 && u.def === "worker");

  const tryBuild = (unit, dx, dy) => {
    const s = site(dx, dy);
    g.issue({ type: "build", player: 1, units: [unit.id], building: "tower", tx: s.tx, ty: s.ty });
    for (let i = 0; i < 30; i++) g.tick();
    return w.buildings().some((b) => b.owner === 1 && b.def === "tower" && b.tx === s.tx && b.ty === s.ty);
  };

  const byPeasant = tryBuild(peasant, 6, 6);
  const byKing = tryBuild(king, 3, 6);
  return { hasBarracks, byPeasant, byKing };
});
await browser.close();

console.log(`barracks standing: ${r.hasBarracks}`);
console.log(`peasant raised a tower: ${r.byPeasant}`);
console.log(`King raised a tower:    ${r.byKing}`);

const fail = [];
if (r.hasBarracks) fail.push("the test is void: a barracks was already standing, so nothing was proved");
if (r.byPeasant) fail.push("a peasant raised a tower with no barracks behind it");
if (!r.byKing) fail.push("the King could not raise a tower");
if (fail.length) {
  for (const f of fail) console.log("FAIL: " + f);
  process.exit(1);
}
console.log("PASS: the King builds his own towers; everyone else waits for the barracks");
