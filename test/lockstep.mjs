/**
 * The scheduler must be invisible when there is nobody else playing.
 *
 * Every game now runs through the lockstep turn scheduler, including a game
 * with one player in it. That is deliberate -- the lockstep path is the only
 * path, so it cannot rot while nobody is looking at multiplayer -- but it is
 * only acceptable if it costs single-player nothing. Two things are checked:
 * an order given now still executes on the very next tick, as it always did,
 * and the same seed and the same orders still produce the same world.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

const r = await page.evaluate(() => {
  const setup = (g) => {
    g.settingsForTest.crowning = false;
    g.settingsForTest.stockade = false;
    g.settingsForTest.wildlife = false;
    g.settingsForTest.edgeScroll = false;
    g.settingsForTest.mapId = "lakeland-7927";
  };
  const g = window.game;
  setup(g);
  g.start("none");
  const w = g.world;

  // 1. An order given now takes effect on the next tick, with no added delay.
  const u = [...w.entities.values()].find((e) => e.kind === "unit" && e.def === "worker");
  const before = { x: u.pos.x, y: u.pos.y };
  g.issue({ type: "move", player: 1, units: [u.id], x: u.pos.x + 320, y: u.pos.y });
  g.tick();
  const movedOnFirstTick = u.pos.x !== before.x || u.pos.y !== before.y || u.path.length > 0;

  // 2. Same seed, same orders, same world -- checked by the very fingerprint
  //    the network game will compare between machines.
  const runOnce = () => {
    const gg = window.game;
    setup(gg);
    gg.start("none");
    const ww = gg.world;
    const units = [...ww.entities.values()].filter((e) => e.kind === "unit").sort((a, b) => a.id - b.id);
    for (let t = 0; t < 600; t++) {
      if (t === 10) gg.issue({ type: "move", player: 1, units: [units[0].id], x: units[0].pos.x + 400, y: units[0].pos.y + 120 });
      if (t === 90) gg.issue({ type: "gather", player: 1, units: [units[1].id], tx: Math.floor(units[1].pos.x / 32) + 3, ty: Math.floor(units[1].pos.y / 32) });
      if (t === 200) gg.issue({ type: "stop", player: 1, units: [units[0].id] });
      gg.tick();
    }
    return { sum: ww.checksum(), tick: ww.tick };
  };
  const a = runOnce();
  const b = runOnce();

  return { movedOnFirstTick, a, b };
});
await browser.close();

console.log(`order took effect on the next tick: ${r.movedOnFirstTick}`);
console.log(`run A: tick ${r.a.tick} checksum ${r.a.sum}`);
console.log(`run B: tick ${r.b.tick} checksum ${r.b.sum}`);

const fail = [];
if (!r.movedOnFirstTick) fail.push("an order did not take effect on the next tick");
if (r.a.tick !== 600) fail.push(`ran ${r.a.tick} ticks, expected 600 -- the scheduler stalled`);
if (r.a.sum !== r.b.sum) fail.push(`two identical runs diverged (${r.a.sum} vs ${r.b.sum})`);
if (fail.length) { console.log("FAIL: " + fail.join("; ")); process.exit(1); }
console.log("PASS: the scheduler costs single-player nothing, and identical orders give identical worlds");
