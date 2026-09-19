/**
 * Human faction completion regression.
 *
 * Verifies the faction-defining mechanics added by the finish pass:
 * - Priests heal wounded allies automatically
 * - Mage attacks splash nearby hostiles
 * - Watch Towers actually defend the base
 * - Gryphon Aviaries train Gryphon Riders
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

const result = await page.evaluate(() => {
  const g = window.game;
  const SUB = 64;
  g.settingsForTest.crowning = false;
  g.settingsForTest.stockade = false;
  g.settingsForTest.wildlife = false;
  g.settingsForTest.edgeScroll = false;
  g.settingsForTest.mapId = "lakeland-7927";
  g.start("none");
  const w = g.world;

  // Give ourselves clean ground and remove the normal opening pieces.
  for (let y = 0; y < w.map.height; y++)
    for (let x = 0; x < w.map.width; x++) w.map.set(x, y, 0);
  for (const u of [...w.units()]) w.removeEntity(u.id);
  for (const b of [...w.buildings()]) w.removeEntity(b.id);

  // Priest healing.
  const priest = w.spawnUnit(1, "priest", { x: 12 * SUB, y: 12 * SUB });
  const wounded = w.spawnUnit(1, "footman", { x: 13 * SUB, y: 12 * SUB });
  wounded.hp = Math.floor(wounded.maxHp * 0.4);
  const beforeHeal = wounded.hp;
  for (let i = 0; i < 40; i++) g.tick();
  const priestHealed = wounded.hp > beforeHeal;

  // Mage splash.
  const mage = w.spawnUnit(1, "mage", { x: 20 * SUB, y: 20 * SUB });
  const target = w.spawnUnit(2, "footman", { x: 24 * SUB, y: 20 * SUB });
  const neighbour = w.spawnUnit(2, "footman", { x: 24 * SUB + 30, y: 20 * SUB + 20 });
  const neighbourBefore = neighbour.hp;
  g.issue({ type: "attack", player: 1, units: [mage.id], target: target.id });
  for (let i = 0; i < 80; i++) g.tick();
  const mageSplash = neighbour.hp < neighbourBefore;

  // Tower defence.
  const tower = w.placeBuilding(1, "tower", 32, 32, true);
  tower.level = 6;
  const raider = w.spawnUnit(2, "footman", { x: 36 * SUB, y: 33 * SUB });
  const raiderBefore = raider.hp;
  for (let i = 0; i < 120; i++) g.tick();
  const towerFired = raider.hp < raiderBefore || !w.entities.has(raider.id);

  // Gryphon production is wired through the same normal train command.
  const aviary = w.placeBuilding(1, "gryphonaviary", 44, 44, true);
  const player = w.players.get(1);
  player.gold = 5000;
  player.lumber = 5000;
  player.food = 5000;
  // Ensure supply headroom.
  const farm = w.placeBuilding(1, "farm", 48, 44, true);
  farm.level = 10;
  g.issue({ type: "train", player: 1, building: aviary.id, unit: "gryphon" });
  g.tick();
  const gryphonQueued = aviary.queue.some((q) => q.unit === "gryphon");

  return { priestHealed, mageSplash, towerFired, gryphonQueued };
});

await browser.close();
console.log(JSON.stringify(result, null, 2));
const fail = Object.entries(result).filter(([, ok]) => !ok).map(([name]) => name);
if (fail.length) {
  console.log("FAIL: " + fail.join(", "));
  process.exit(1);
}
console.log("PASS: Human faction mechanics are wired");
