import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

// Blows must vary, and criticals must show up.
const roll = await page.evaluate(() => {
  const g = window.game, SUB = 64;
  g.start("none");
  const w = g.world;
  for (let y = 12; y < 22; y++) for (let x = 8; x < 34; x++) w.map.set(x, y, 0);
  const hits = [];
  for (let round = 0; round < 40; round++) {
    const a = w.spawnUnit(1, "footman", { x: 15 * SUB, y: 16 * SUB });
    const b = w.spawnUnit(2, "footman", { x: 16 * SUB, y: 16 * SUB });
    b.hp = 10000; b.maxHp = 10000;
    for (let i = 0; i < 40; i++) {
      g.tick();
      for (const e of g.world.fx) if (e.kind === "hit") hits.push({ n: e.amount, crit: e.crit });
    }
    w.removeEntity(a.id); w.removeEntity(b.id);
  }
  return hits;
});
const amounts = roll.map((h) => h.n);
const crits = roll.filter((h) => h.crit).length;
const distinct = new Set(amounts).size;
console.log(`${roll.length} blows, ${distinct} distinct amounts, range ${Math.min(...amounts)}-${Math.max(...amounts)}, ${crits} critical`);
if (distinct < 5) throw new Error("damage is not varying");
if (crits === 0) throw new Error("no critical hits in a large sample");

// And the roll must come from the sim's seeded generator, never Math.random.
// Testing that by replaying a world is fragile -- far more than the roll would
// have to line up -- so test the property directly: make Math.random explode and
// fight a battle. If the sim reaches for it, this throws.
const leaked = await page.evaluate(() => {
  const g = window.game, w = g.world, SUB = 64;
  const real = Math.random;
  let used = false;
  Math.random = () => { used = true; return real(); };
  try {
    const a = w.spawnUnit(1, "footman", { x: 25 * SUB, y: 19 * SUB });
    const b = w.spawnUnit(2, "footman", { x: 26 * SUB, y: 19 * SUB });
    b.hp = 9999; b.maxHp = 9999;
    let blows = 0;
    for (let i = 0; i < 120; i++) {
      g.tick();
      for (const e of g.world.fx) if (e.kind === "hit") blows++;
    }
    w.removeEntity(a.id); w.removeEntity(b.id);
    return { used, blows };
  } finally {
    Math.random = real;
  }
});
console.log(`${leaked.blows} blows fought with Math.random watched; sim reached for it: ${leaked.used}`);
if (leaked.blows === 0) throw new Error("no blows landed, so the check proved nothing");
if (leaked.used) throw new Error("the sim used Math.random -- that desyncs lockstep play");
await browser.close();
