/**
 * The crowning opening must not decide the match.
 *
 * A player in this opening is one peasant and nothing else, walking across open
 * country under fog to find the weapon that makes him a King. A bear finding him
 * first used to end the game outright: the other player, who had done nothing at
 * all, was handed a Victory about twenty seconds in. Roughly one match in six.
 *
 * So while the weapon is still in the ground the clan keeps sending men, and
 * nobody can be eliminated before they have been allowed to start. This asserts
 * that across enough matches to catch it: no winner may be declared while any
 * weapon is still unclaimed.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

const runs = await page.evaluate(() => {
  const out = [];
  for (let r = 0; r < 20; r++) {
    const g = window.game;
    g.settingsForTest.crowning = true;
    g.settingsForTest.stockade = true;
    g.settingsForTest.wildlife = true;
    g.settingsForTest.mapId = "random";
    g.start("normal");
    for (let i = 0; i < 1200 && g.world.winner === null; i++) g.tick();
    out.push({
      map: g.map.name,
      winner: g.world.winner,
      unclaimed: g.world.relics.filter((x) => !x.taken).length,
      p2: [...g.world.entities.values()].filter((e) => e.owner === 2).length,
    });
  }
  return out;
});
await browser.close();

const premature = runs.filter((r) => r.winner !== null && r.unclaimed > 0);
const wiped = runs.filter((r) => r.p2 === 0);
console.log(`${runs.length} matches played`);
console.log(`winners declared while a weapon was still in the ground: ${premature.length}`);
console.log(`matches where a side was wiped out entirely: ${wiped.length}`);
for (const r of premature) console.log(`  ${r.map}: winner ${r.winner}, ${r.unclaimed} weapon(s) unclaimed`);

const fail = [];
if (premature.length) fail.push(`${premature.length} match(es) ended before the weapon was found`);
if (wiped.length) fail.push(`${wiped.length} match(es) left a player with nothing at all`);
if (fail.length) {
  console.log("FAIL: " + fail.join("; "));
  process.exit(1);
}
console.log("PASS: every match got as far as a crowned King on both sides");
