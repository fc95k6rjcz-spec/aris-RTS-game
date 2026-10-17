// Ari's voice lines: every file loads, and each plays at its moment --
// selecting an Archer / Knight / Mage, ordering an attack, a building finishing,
// running short of gold, a new era, and losing a match.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 760 } });
await ctx.route(/supabase/, (r) => r.abort());
await ctx.route("http://game.test/**", (r) => {
  const path = new URL(r.request().url()).pathname;
  if (path === "/") return r.fulfill({ contentType: "text/html", body: html });
  const file = "dist" + path;
  if (existsSync(file)) return r.fulfill({ contentType: "audio/mpeg", body: readFileSync(file) });
  return r.fulfill({ status: 404, body: "" });
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.goto("http://game.test/");
await page.waitForFunction(() => !!window.game);
await page.keyboard.press("Space"); // the gesture that unlocks sound
await page.waitForFunction(() => window.game.audio?.ready, null, { timeout: 10000 });
const LINES = ["archerSelect", "knightSelect", "mageSelect", "orderAttack", "buildingDoneLine", "needGoldLine", "newEraLine", "defeatLine"];
await page.waitForFunction((names) => names.every((n) => !!window.game.audio.samples[n]), LINES, { timeout: 15000 });

const played = await page.evaluate(async () => {
  const g = window.game, a = g.audio, heard = [];
  const real = a.sample.bind(a);
  a.sample = (name) => { heard.push(name); return real(name); };
  const quiet = async () => { a.speakingUntil = 0; a.lastVoice = -1e9; a.last = {}; await new Promise((r) => setTimeout(r, 30)); };
  const s = g.settingsForTest; s.crowning = false; s.stockade = false; s.wildlife = false; s.voices = true; s.muted = false;
  g.start("none");
  const w = g.world, me = g.player;
  // Selecting units: the same path a mouse click takes.
  for (const def of ["archer", "knight", "mage"]) {
    await quiet();
    const u = w.spawnUnit(me, def, { x: 20 * 64, y: 20 * 64 });
    g.selected = new Set();
    const inner = g.onMouseUpInner; g.onMouseUpInner = () => { g.selected = new Set([u.id]); };
    g.onMouseUp({ button: 0, clientX: 0, clientY: 0 });
    g.onMouseUpInner = inner;
  }
  // An attack order.
  await quiet();
  const f = w.spawnUnit(me, "footman", { x: 22 * 64, y: 20 * 64 });
  g.issue({ type: "attackMove", player: me, units: [f.id], x: 30 * 64, y: 20 * 64 });
  // A building finishing, running short of gold, and a new era -- fed in as
  // the world reports them for half a second.
  // Each tick starts by clearing them, so they are added at the end of a tick.
  const feed = async (push) => {
    await quiet();
    const step = w.step; w.step = function (c) { const r = step.call(w, c); push(); return r; };
    await new Promise((r) => setTimeout(r, 500));
    w.step = step;
  };
  await feed(() => w.emit(me, "Barracks complete", "info"));
  await feed(() => w.emit(me, "Not enough — need 120 more gold", "error"));
  await feed(() => w.fx.push({ kind: "levelUp", owner: me, def: "townhall", level: 3, x: 0, y: 0 }));
  // Losing.
  await quiet();
  w.winner = 2;
  await new Promise((r) => setTimeout(r, 500));
  return heard;
});
console.log("heard:", played.join(", "));
for (const n of LINES) assert(played.includes(n), `${n} played`);
await browser.close();
console.log("PASS: Ari's eight voice lines load and play at their moments");
