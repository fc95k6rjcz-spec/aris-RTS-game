/**
 * The country has things living in it, and some of them are dinner.
 *
 * Bears alone at the old density came to one animal per six hundred tiles,
 * which with fog of war means a player can finish a match without meeting one.
 * This checks that the wild is actually populated, that it is a mix rather than
 * all teeth, that deer run from people, and that hunting and farming both feed
 * an army -- including the AI's, which builds farms for supply and is never
 * told anything about food.
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
  const WILD = 9;
  const g = window.game;
  g.settingsForTest.wildlife = true;
  g.settingsForTest.crowning = false;
  g.settingsForTest.stockade = false;
  g.settingsForTest.edgeScroll = false;
  g.settingsForTest.mapId = "lakeland-7927";
  g.start("none");
  // Sixty-four sub-units to the tile, not thirty-two. Getting this wrong made
  // every animal look as though it had spawned off the edge of the map.
  const w = g.world, SUB = 64;

  const beasts = () => [...w.entities.values()].filter((e) => e.kind === "unit" && e.owner === WILD);
  const census = {};
  for (const b of beasts()) census[b.def] = (census[b.def] ?? 0) + 1;

  // A deer must run from somebody walking at it.
  const deer = beasts().find((b) => b.def === "deer");
  let fled = null;
  if (deer) {
    const chaser = [...w.entities.values()].find((e) => e.kind === "unit" && e.owner === 1);
    chaser.pos.x = deer.pos.x + 3 * SUB;
    chaser.pos.y = deer.pos.y;
    const before = Math.hypot(deer.pos.x - chaser.pos.x, deer.pos.y - chaser.pos.y);
    for (let i = 0; i < 120; i++) g.tick();
    const after = Math.hypot(deer.pos.x - chaser.pos.x, deer.pos.y - chaser.pos.y);
    fled = { before: Math.round(before / SUB), after: Math.round(after / SUB) };
  }

  // Killing one pays in food.
  const foodBefore = w.players.get(1).food;
  const cow = beasts().find((b) => b.def === "cow");
  const hunter = [...w.entities.values()].find((e) => e.kind === "unit" && e.owner === 1);
  if (cow) w.damage(cow, 9999, hunter);
  const foodFromKill = w.players.get(1).food - foodBefore;

  // And a farm feeds you without anyone leaving home.
  const hall = [...w.entities.values()].find((e) => e.kind === "building");
  const farm = w.placeBuilding(1, "farm", hall.tx + 7, hall.ty + 7, true);
  const before2 = w.players.get(1).food;
  for (let i = 0; i < 20 * 60; i++) g.tick();
  const farmed = w.players.get(1).food - before2;

  return { total: beasts().length, census, fled, foodFromKill, farmed, farmBuilt: !!farm };
});
await browser.close();

console.log(`the wild holds ${r.total} animals: ${JSON.stringify(r.census)}`);
if (r.fled) console.log(`a deer approached from ${r.fled.before} tiles ran to ${r.fled.after}`);
console.log(`a cow taken paid ${r.foodFromKill} food; a farm grew ${r.farmed} over a minute`);

const fail = [];
if (r.total < 60) fail.push(`only ${r.total} animals on a 160-tile map -- too sparse to ever meet one`);
const kinds = Object.keys(r.census);
if (!kinds.includes("deer") || !kinds.includes("cow") || !kinds.includes("bear")) fail.push(`the wild is not a mix: ${kinds.join(", ")}`);
if (!r.fled || !(r.fled.after > r.fled.before)) fail.push("a deer did not run from somebody standing next to it");
if (!(r.foodFromKill > 0)) fail.push("killing an animal paid no food");
if (!(r.farmed > 0)) fail.push("a farm grew no food");
if (fail.length) { console.log("FAIL: " + fail.join("; ")); process.exit(1); }
console.log("PASS: the wild is populated and mixed, deer run, and both hunting and farming feed an army");
