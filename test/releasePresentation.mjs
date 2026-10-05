import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 850 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.setContent(readFileSync("dist/index.html", "utf8"));
  await page.waitForFunction(() => window.game && window.rts);
  await page.evaluate(() => {
    const g = window.game;
    g.settingsForTest.crowning = false;
    g.settingsForTest.wildlife = false;
    g.start("none");
    const b = g.world.buildings().find(b => b.owner === 1 && b.def === "townhall");
    g.selected = new Set([b.id]);
    g.cam.centerOn((b.tx + 2) * 64, (b.ty + 2) * 64);
  });
  await page.waitForTimeout(1200);
  const cards = await page.locator(".rv-tile.unit-art").evaluateAll(nodes => nodes.map(n => ({
    text: n.textContent, image: getComputedStyle(n).backgroundImage,
  })));
  assert.equal(cards.length, 2);
  assert(cards.every(c => c.image !== "none"));
  assert(cards.some(c => c.text.includes("Worker")) && cards.some(c => c.text.includes("Prince")));
  mkdirSync("test/artifacts", { recursive: true });
  await page.screenshot({ path: "test/artifacts/townhall-cards.png" });
  await page.evaluate(() => {
    const g = window.game;
    const worker = g.world.units().find(u => u.owner === 1 && u.def === "worker");
    g.selected = new Set([worker.id]);
    g.tab = "advanced";
  });
  await page.waitForTimeout(300);
  const advanced = await page.locator(".rv-tile").evaluateAll(nodes => nodes.map(n => ({
    image: getComputedStyle(n).backgroundImage, label: n.textContent,
  })));
  assert.equal(advanced.length, 9);
  assert(advanced.every(c => c.image !== "none"), "every Advanced card needs art");
  await page.screenshot({ path: "test/artifacts/advanced-building-cards.png" });
  await page.evaluate(() => {
    const g = window.game;
    g.tick = () => {};
    g.world.fogEnabled = false;
    g.world.tick = 1200;
    const b = g.world.buildings().find(b => b.owner === 1 && b.def === "townhall");
    b.complete = false;
    b.progress = window.rts.BUILDINGS.townhall.buildTime * 0.45;
    b.builders = 1;
    const king = g.world.units().find(u => u.owner === 1 && u.def === "king");
    king.task = { kind: "build", building: b.id };
    king.path = [];
    g.cam.zoom = 52;
    g.cam.centerOn((b.tx + 2) * 64, (b.ty + 2) * 64);
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test/artifacts/king-building-townhall.png" });
  const audio = await page.evaluate(async () => {
    const g = window.game;
    const result = {};
    for (const muted of [false, true]) {
      g.settingsForTest.muted = muted;
      for (const name of ["command", "crown", "magic", "heal", "timber", "workstart"]) {
        const a = new g.audioForTest.constructor();
        const ctx = new OfflineAudioContext(1, 44100 * 3, 44100);
        a.ctx = ctx; a.ready = true;
        a.master = ctx.createGain(); a.master.connect(ctx.destination);
        a.noise = a.makeNoise(ctx);
        a.play(name);
        const data = (await ctx.startRendering()).getChannelData(0);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v));
        result[`${name}-${muted ? "muted" : "on"}`] = peak;
      }
    }
    g.settingsForTest.muted = false;
    return result;
  });
  for (const [name, peak] of Object.entries(audio)) {
    assert(name.endsWith("muted") ? peak === 0 : peak > 0.001 && peak < 1, `${name}: invalid audio peak ${peak}`);
  }
  assert.deepEqual(errors, []);
  console.log("PASS: Worker/Prince artwork, five sound cues, mute and unclipped audio", audio);
} finally { await browser.close(); }

