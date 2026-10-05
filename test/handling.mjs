/**
 * Handling regression pass.
 *
 * Covers the parts that must not regress silently:
 * - formation orders spread a squad over distinct endpoints
 * - Shift movement is queued in deterministic simulation state
 * - rally points only change through a serialisable command/tick
 * - control groups discard dead units
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

const r = await page.evaluate(() => {
  const g = window.game;
  const SUB = 64;
  g.settingsForTest.crowning = false;
  g.settingsForTest.stockade = false;
  g.settingsForTest.wildlife = false;
  g.settingsForTest.edgeScroll = false;
  g.settingsForTest.mapId = "lakeland-7927";
  g.start("none");
  const w = g.world;

  // Give the test a clean, obstacle-free field.
  for (let y = 0; y < w.map.height; y++) for (let x = 0; x < w.map.width; x++) w.map.set(x, y, 0);
  for (const u of [...w.units()]) w.removeEntity(u.id);
  for (const b of [...w.buildings()]) w.removeEntity(b.id);

  const squad = [];
  for (let i = 0; i < 9; i++)
    squad.push(w.spawnUnit(1, i < 5 ? "footman" : "archer", { x: (10 + (i % 3)) * SUB, y: (10 + Math.floor(i / 3)) * SUB }));

  const targets = g.formationTargets(squad, 30 * SUB, 30 * SUB);
  const unique = new Set(targets.map((t) => `${t.x},${t.y}`));
  const allWalkable = targets.every((t) => w.map.isWalkable(Math.floor(t.x / SUB), Math.floor(t.y / SUB), "land"));

  for (const t of targets) g.issue({ type: "move", player: 1, units: [t.unit.id], x: t.x, y: t.y });
  g.tick();
  const activeTargets = squad.map((u) => u.task.kind === "move" ? `${u.task.target.x},${u.task.target.y}` : "none");
  const activeUnique = new Set(activeTargets);

  // Shift queue: second destination must wait behind the current move.
  const q = squad[0];
  g.issue({ type: "move", player: 1, units: [q.id], x: 20 * SUB, y: 20 * SUB });
  g.tick();
  g.issue({ type: "move", player: 1, units: [q.id], x: 24 * SUB, y: 21 * SUB, queue: true });
  g.tick();
  const queued = q.moveQueue.length === 1 && q.moveQueue[0].x === 24 * SUB && q.moveQueue[0].y === 21 * SUB;

  // Rally should not mutate until the command is stepped.
  const hall = w.placeBuilding(1, "townhall", 40, 40, true);
  const rallyBefore = hall.rally;
  g.issue({ type: "setRally", player: 1, building: hall.id, x: 45 * SUB, y: 44 * SUB });
  const rallyStillBeforeTick = hall.rally === rallyBefore;
  g.tick();
  const rallyAfter = hall.rally?.x === 45 * SUB && hall.rally?.y === 44 * SUB;

  // Control groups are presentation state, but dead ids must disappear on tick.
  g.select([squad[1].id, squad[2].id]);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", ctrlKey: true }));
  w.removeEntity(squad[1].id);
  g.tick();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
  const recalled = [...g.selected];
  const deadCleaned = !recalled.includes(squad[1].id) && recalled.includes(squad[2].id);

  return {
    formationCount: targets.length,
    uniqueTargets: unique.size,
    allWalkable,
    activeUnique: activeUnique.size,
    queued,
    rallyStillBeforeTick,
    rallyAfter,
    deadCleaned,
  };
});
await browser.close();

console.log(JSON.stringify(r, null, 2));
const fail = [];
if (r.formationCount !== 9) fail.push(`formation returned ${r.formationCount}, expected 9`);
if (r.uniqueTargets < 7) fail.push(`formation only produced ${r.uniqueTargets} unique destinations`);
if (!r.allWalkable) fail.push("formation put a unit on blocked ground");
if (r.activeUnique < 7) fail.push(`move commands collapsed to only ${r.activeUnique} active destinations`);
if (!r.queued) fail.push("Shift waypoint was not queued");
if (!r.rallyStillBeforeTick) fail.push("rally mutated outside the command/tick path");
if (!r.rallyAfter) fail.push("setRally command did not apply");
if (!r.deadCleaned) fail.push("dead unit stayed in a control group");
if (fail.length) {
  console.log("FAIL: " + fail.join("; "));
  process.exit(1);
}
console.log("PASS: formations, queued movement, rally commands and control groups");
