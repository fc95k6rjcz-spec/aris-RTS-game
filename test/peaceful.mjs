import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

/** Play a long game and report whether anything of ours was ever attacked. */
async function run(difficulty) {
  return await page.evaluate(async (difficulty) => {
    const g = window.game;
    // The forest wall is a different feature, tested in stockade.mjs; it would
    // only get in the way of what this one is measuring.
    g.settingsForTest.stockade = false;
    // And so would the crowning opening, which is the default.
    //
    // Under it we begin as one peasant with no buildings, and nobody is playing
    // us in this test -- so that peasant stands where he was put for the whole
    // run. There is nothing for a normal opponent to march on and nothing of
    // ours for it to hit, so the control ("a normal opponent DOES attack, so
    // the peaceful result means something") measured only that the map had no
    // targets on it. A plain skirmish start gives both sides a hall and a
    // worker line, which is the situation this file is actually about.
    g.settingsForTest.crowning = false;
    g.settingsForTest.nomad = false;
    // A fixed map, so the control is a control.
    //
    // The default is a random map per match, and the opponent does not develop
    // equally well on all of them -- on Still Water it cannot reach timber and
    // sits on a thousand gold with one building, which has nothing to do with
    // whether it is peaceful. Measured over three runs on random maps the
    // control landed 0, 21 and 42 blows, so one run in three failed the suite
    // for the map it drew. Open Steppe is a map the opponent reliably plays.
    g.settingsForTest.mapId = "plains-7925";
    g.start(difficulty);
    const w = g.world;
    // No dragons. This file is about whether an opponent chooses to attack us,
    // and a dragon burning the warband on its way over is noise that shows up
    // as "the opponent never attacked".
    w.scheduleDragon(1e9);
    let hitsOnUs = 0;
    const mine = new Set();
    for (let t = 0; t < 16000 && w.winner === null; t++) {
      g.tick();
      for (const e of w.entities.values()) if (e.owner === 1) mine.add(e.id);
      for (const e of w.fx) if (e.kind === "hit" && mine.has(e.id)) hitsOnUs++;
      if (t % 2000 === 0) await new Promise((r) => setTimeout(r, 1));
    }
    return {
      hitsOnUs,
      theirBuildings: w.buildings().filter((b) => b.owner === 2).length,
      theirUnits: w.units().filter((u) => u.owner === 2).length,
      ourBuildings: w.buildings().filter((b) => b.owner === 1).length,
      winner: w.winner,
    };
  }, difficulty);
}

const peaceful = await run("peaceful");
console.log(`peaceful: ${peaceful.hitsOnUs} blows landed on us, they grew to ${peaceful.theirBuildings} buildings and ${peaceful.theirUnits} units, we kept ${peaceful.ourBuildings}`);
if (peaceful.hitsOnUs > 0) throw new Error("a peaceful opponent attacked us");
if (peaceful.theirBuildings < 4) throw new Error("a peaceful opponent should still develop");

const empty = await run("none");
console.log(`empty map: ${empty.hitsOnUs} blows landed on us, ${empty.theirUnits} enemy units exist`);
if (empty.hitsOnUs > 0) throw new Error("something attacked us on an empty map");

const normal = await run("normal");
console.log(`normal (the control): ${normal.hitsOnUs} blows landed on us`);
if (normal.hitsOnUs === 0) throw new Error("a normal opponent never attacked, so the peaceful result proves nothing");
await browser.close();
