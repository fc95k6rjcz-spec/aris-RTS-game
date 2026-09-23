// Orc faction: pick it on the menu, check both sides are seated right, and
// photograph an Orc base built from the painted Orc sheets.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);
await page.waitForTimeout(500);
// Through the menu as a player would: splash → menu → New Campaign → The Orcs.
const panes = await page.evaluate(() => {
  const g = window.game;
  const seen = [];
  g.runFront({ kind: "pane", pane: "menu" });
  seen.push(g.front.pane);
  g.runFront({ kind: "pane", pane: "faction" });
  seen.push(g.front.pane);
  return seen;
});
await page.waitForTimeout(300);
await page.screenshot({ path: "test/shot-orc-pick.png" });
const seat = await page.evaluate(() => {
  const g = window.game;
  g.runFront({ kind: "begin", faction: "orc" });
  const w = g.world;
  const p1 = w.players.get(1), p2 = w.players.get(2);
  return { p1: [p1.faction, p1.color], p2: [p2.faction, p2.color], menu: g.menu };
});
await page.evaluate(() => {
  const g = window.game, w = g.world, SUB = 64;
  g.paused = false;
  const p = w.players.get(1); p.gold = 99999; p.lumber = 99999; p.oil = 9999;
  const s = w.map.starts[0];
  const place = (def, dx, dy, lvl) => { const b = w.placeBuilding(1, def, s.x + dx, s.y + dy, true); if (b && lvl) b.level = lvl; return b; };
  place("townhall", -2, -2, 6); place("barracks", 3, -3, 4); place("foundry", -6, 2, 5);
  place("lumbermill", 3, 2, 3); place("stables", -6, -4, 2); place("magetower", 7, -1, 8); place("farm", -1, 5, 7);
  for (let i = 0; i < 5; i++) w.spawnUnit(1, "footman", { x: (s.x + i * 0.8) * SUB, y: (s.y + 4) * SUB });
  for (let i = 0; i < 60; i++) g.tick();
  g.cam.zoom = 34; g.cam.centerOn((s.x + 1) * SUB, (s.y) * SUB);
});
await page.waitForTimeout(1200);
await page.screenshot({ path: "test/shot-orc-base.png" });
const names = await page.evaluate(() => {
  const g = window.game; const w = g.world;
  const b = w.buildings().find((b) => b.owner === 1 && b.def === "townhall");
  g.select([b.id]);
  return [...w.buildings()].filter(b => b.owner === 1).map(b => b.def + "@" + b.level);
});
console.log(JSON.stringify({ panes, seat, names, errors }));
const ok = seat.p1[0] === "orc" && seat.p2[0] === "human" && seat.p1[1] === "#dc2626" && errors.length === 0;
console.log(ok ? "PASS orcs" : "FAIL orcs");
await browser.close();
process.exit(ok ? 0 : 1);
