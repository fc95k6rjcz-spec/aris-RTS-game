/**
 * Animation coverage regression.
 *
 * Boots the real browser build, spawns every registered unit/building, exercises
 * representative action states, a level-10 Torch and a building collapse, and
 * fails on any render-time exception.
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
const executablePath = process.env.CHROME || [
  "/opt/pw-browsers/chromium",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.setContent(html);
await page.waitForFunction(() => !!window.game && !!window.rts);

const setup = await page.evaluate(() => {
  const g = window.game;
  const rts = window.rts;
  const SUB = 64;
  g.settingsForTest.crowning = false;
  g.settingsForTest.stockade = false;
  g.settingsForTest.wildlife = false;
  g.settingsForTest.edgeScroll = false;
  g.start("none");
  const w = g.world;
  g.paused = true;
  w.fogEnabled = false;

  // Clean flat board so coverage is about rendering, not map placement.
  for (let y = 0; y < w.map.height; y++)
    for (let x = 0; x < w.map.width; x++) w.map.set(x, y, 0);
  for (const u of [...w.units()]) w.removeEntity(u.id);
  for (const b of [...w.buildings()]) w.removeEntity(b.id);

  const unitDefs = Object.keys(rts.UNITS);
  const buildingDefs = Object.keys(rts.BUILDINGS);

  // Every unit gets an on-screen instance.
  const units = [];
  unitDefs.forEach((def, i) => {
    const x = 10 + (i % 8) * 3;
    const y = 10 + Math.floor(i / 8) * 3;
    units.push(w.spawnUnit(1, def, { x: x * SUB, y: y * SUB }));
  });

  // Exercise specific state-driven animations.
  const worker = units.find((u) => u.def === "worker");
  if (worker) worker.task = { kind: "gather", tx: 8, ty: 8, resource: "lumber", phase: "harvest", timer: 5 };
  const mage = units.find((u) => u.def === "mage");
  const enemy = w.spawnUnit(2, "footman", { x: 31 * SUB, y: 12 * SUB });
  if (mage) {
    mage.task = { kind: "attack", target: enemy.id };
    mage.cooldown = rts.UNITS.mage.cooldown;
  }
  const priest = units.find((u) => u.def === "priest");
  if (priest) priest.cooldown = 18;
  const deer = units.find((u) => u.def === "deer");
  if (deer) {
    deer.task = { kind: "move", target: { x: 35 * SUB, y: 18 * SUB } };
    deer.path = [[35, 18]];
  }

  // Every building gets a complete instance. Direct placement intentionally
  // bypasses tech/coastal rules: this is visual coverage, not a gameplay match.
  const buildings = [];
  buildingDefs.forEach((def, i) => {
    const x = 48 + (i % 4) * 7;
    const y = 8 + Math.floor(i / 4) * 7;
    const b = w.placeBuilding(1, def, x, y, true);
    if (b) buildings.push(b);
  });

  const torch = buildings.find((b) => b.def === "torch");
  if (torch) {
    torch.level = 10;
    torch.maxHp = 1420;
    torch.hp = torch.maxHp;
  }
  const damaged = buildings.find((b) => b.def === "townhall");
  if (damaged) damaged.hp = Math.max(1, Math.floor(damaged.maxHp * 0.38));

  // Put the coverage field under the camera.
  g.cam.zoom = 16;
  g.cam.centerOn(40 * SUB, 24 * SUB);

  return {
    units: units.length,
    expectedUnits: unitDefs.length,
    buildings: buildings.length,
    expectedBuildings: buildingDefs.length,
    torch: !!torch,
    renderer: !!g.renderer,
  };
});

await page.waitForTimeout(700);

// Exercise the render-only destruction path without mutating simulation through it.
await page.evaluate(() => {
  const g = window.game;
  const b = g.world.buildings().find((x) => x.def === "barracks");
  if (!b) return;
  g.renderer.fx.apply([
    {
      kind: "death",
      x: (b.tx + b.size / 2) * 64,
      y: (b.ty + b.size / 2) * 64,
      def: b.def,
      owner: b.owner,
      facing: 6,
      building: true,
    },
  ], g.world.tick);
});
await page.waitForTimeout(500);

// Compare the worker's actual rendered pixels across two simulation times.
// Direct rendering avoids the pause overlay and keeps the camera identical.
const motion = await page.evaluate(() => {
  const g = window.game;
  const worker = g.world.units().find((u) => u.def === "worker");
  const p = g.cam.toScreen(worker.pos.x, worker.pos.y);
  const ctx = document.getElementById("game").getContext("2d");
  const sample = (tick, enabled) => {
    g.settingsForTest.animations = enabled;
    g.world.tick = tick;
    g.renderer.draw(0, new Set(), null, null, g.cam.viewH);
    return Array.from(ctx.getImageData(Math.floor(p.x - 16), Math.floor(p.y - 30), 32, 40).data);
  };
  const first = sample(10, true);
  const second = sample(16, true);
  const frozenFirst = sample(10, false);
  const frozenSecond = sample(16, false);
  g.settingsForTest.animations = true;
  return {
    workerMoves: first.some((v, i) => v !== second[i]),
    disabledIsStill: frozenFirst.every((v, i) => v === frozenSecond[i]),
  };
});

const pixel = await page.evaluate(() => {
  const c = document.getElementById("game");
  const ctx = c.getContext("2d");
  const d = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
  return Array.from(d);
});

mkdirSync("test/artifacts", { recursive: true });
await page.screenshot({ path: "test/artifacts/animation-coverage.png" });
await browser.close();

console.log(JSON.stringify({ ...setup, ...motion, errors, pixel }, null, 2));
const fail = [];
if (setup.units !== setup.expectedUnits) fail.push("not every unit spawned");
if (setup.buildings !== setup.expectedBuildings) fail.push("not every building spawned");
if (!setup.torch) fail.push("Torch missing");
if (!setup.renderer) fail.push("renderer missing");
if (!motion.workerMoves) fail.push("working worker does not animate");
if (!motion.disabledIsStill) fail.push("worker moves with animations disabled");
if (errors.length) fail.push("page errors: " + errors.join(" | "));
if (pixel[3] === 0) fail.push("canvas appears empty");
if (fail.length) {
  console.log("FAIL: " + fail.join("; "));
  process.exit(1);
}
console.log("PASS: every registered unit/building renders through the animation system");
