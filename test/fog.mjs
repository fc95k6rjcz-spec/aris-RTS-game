import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

const r = await page.evaluate(async () => {
  const g = window.game;
  g.settingsForTest.mapId = "lakeland-7927";
  g.settingsForTest.nomad = false;
  // No stockade: this test marches a scout the length of the map, and a wall of
  // forest round the base is a different feature being tested elsewhere.
  g.settingsForTest.stockade = false;
  g.start("none");
  const w = g.world, P = 1;
  const v = w.vision.get(P);
  const tiles = w.map.width * w.map.height;
  const count = (want) => {
    let n = 0;
    for (let y = 0; y < w.map.height; y++) for (let x = 0; x < w.map.width; x++) if (v.at(x, y) === want) n++;
    return n;
  };
  for (let i = 0; i < 10; i++) g.tick();
  const atStart = { explored: tiles - count(0), visible: count(2) };

  // The enemy's base must be hidden at the outset.
  const enemyHall = w.buildings().find((b) => b.owner === 2 && b.def === "townhall");
  const seesEnemy = w.canSeeEntity(P, enemyHall);

  // Walk a scout across the map and watch the explored area grow.
  const scout = w.units().find((u) => u.owner === P && u.def === "worker");
  const dest = w.map.starts[1];
  g.issue({ type: "move", player: P, units: [scout.id], x: dest.x * 64, y: dest.y * 64 });
  for (let i = 0; i < 6000; i++) {
    g.tick();
    if (Math.abs(scout.pos.x / 64 - dest.x) < 4 && Math.abs(scout.pos.y / 64 - dest.y) < 4) break;
  }
  const after = { explored: tiles - count(0), visible: count(2) };
  const seesEnemyNow = w.canSeeEntity(P, enemyHall);

  // Explored ground is permanent: walk him home and the trail stays.
  g.issue({ type: "move", player: P, units: [scout.id], x: w.map.starts[0].x * 64, y: w.map.starts[0].y * 64 });
  for (let i = 0; i < 6000; i++) g.tick();
  const home = { explored: tiles - count(0), visible: count(2) };
  return { tiles, atStart, seesEnemy, after, seesEnemyNow, home };
});
console.log(`board is ${r.tiles} tiles`);
console.log(`at the start: ${r.atStart.explored} explored, ${r.atStart.visible} in sight; enemy hall visible: ${r.seesEnemy}`);
console.log(`after a march across: ${r.after.explored} explored, ${r.after.visible} in sight; enemy hall visible: ${r.seesEnemyNow}`);
console.log(`back home: ${r.home.explored} explored (kept), ${r.home.visible} in sight`);
if (r.seesEnemy) throw new Error("the enemy base was visible from the first tick");
if (r.atStart.explored > r.tiles * 0.2) throw new Error("too much of the map is explored at the start");
if (r.after.explored <= r.atStart.explored) throw new Error("scouting revealed nothing");
if (!r.seesEnemyNow) throw new Error("a scout standing in the enemy base cannot see it");
if (r.home.explored < r.after.explored) throw new Error("explored ground was forgotten");
if (r.home.visible >= r.after.visible) throw new Error("sight did not follow the scout home");
console.log("fog behaves");
await browser.close();
