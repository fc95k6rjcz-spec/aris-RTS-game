import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

const r = await page.evaluate(async () => {
  const g = window.game;
  g.settingsForTest.nomad = true;
  g.start("normal");
  const w = g.world;
  const atStart = {
    buildings: w.buildings().length,
    ourWorkers: w.units().filter((u) => u.owner === 1 && u.def === "worker").length,
    gold: w.players.get(1).gold,
    winner: w.winner,
  };
  // A whole game, to prove the AI can bootstrap itself from nothing.
  let firstHallTick = null;
  for (let t = 0; t < 9000 && w.winner === null; t++) {
    g.tick();
    if (firstHallTick === null && w.buildings().some((b) => b.owner === 2 && b.def === "townhall" && b.complete)) firstHallTick = w.tick;
    if (t % 2000 === 0) await new Promise((r) => setTimeout(r, 1));
  }
  return {
    atStart,
    firstHallTick,
    theirBuildings: w.buildings().filter((b) => b.owner === 2).length,
    theirUnits: w.units().filter((u) => u.owner === 2).length,
    winner: w.winner,
    tick: w.tick,
  };
});
console.log(`at kickoff: ${r.atStart.buildings} buildings on the whole map, ${r.atStart.ourWorkers} peasants, ${r.atStart.gold} gold, winner=${r.atStart.winner}`);
if (r.atStart.buildings !== 0) throw new Error("nomad start placed buildings");
if (r.atStart.winner !== null) throw new Error("a winner was declared before anyone had built anything");
console.log(`the AI founded its hall at tick ${r.firstHallTick} and grew to ${r.theirBuildings} buildings, ${r.theirUnits} units`);
if (r.firstHallTick === null) throw new Error("the AI never founded a town hall");
if (r.theirBuildings < 4) throw new Error("the AI never got going from a nomad start");
await browser.close();
