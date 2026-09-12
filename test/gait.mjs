import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

// One walker, one stander, one worker felling a tree, all in a clear strip.
await page.evaluate(() => {
  const g = window.game, SUB = 64;
  g.settingsForTest.stockade = false;
  g.start("none");
  const w = g.world;
  for (let y = 14; y < 20; y++) for (let x = 10; x < 30; x++) w.map.set(x, y, 0);

  const walker = w.spawnUnit(1, "footman", { x: 14 * SUB, y: 17 * SUB });
  walker.facing = 4;
  window.__walker = walker.id;
  w.spawnUnit(1, "footman", { x: 17 * SUB, y: 17 * SUB }).facing = 6;
  // Use a tree the map generated rather than stamping a tile: a hand-set tile
  // has no lumber in it, so the worker arrives and finds nothing to fell.
  let tree = null;
  for (let y = 0; y < w.map.height && !tree; y++)
    for (let x = 0; x < w.map.width; x++)
      if (w.map.get(x, y) === 3 && w.map.amount[w.map.idx(x, y)] > 0 && w.map.get(x + 1, y) === 0) {
        tree = { x, y };
        break;
      }
  window.__tree = tree;
  const worker = w.spawnUnit(1, "worker", { x: (tree.x + 1) * SUB, y: tree.y * SUB });
  window.__worker = worker.id;
  g.cam.zoom = 60; g.cam.centerOn(19 * SUB, 17 * SUB);
});
// Send the walker on a long march and the worker to the tree.
await page.evaluate(() => {
  const g = window.game;
  g.issue({ type: "move", player: 1, units: [window.__walker], x: 29 * 64, y: 17 * 64 });
  g.issue({ type: "gather", player: 1, units: [window.__worker], tx: window.__tree.x, ty: window.__tree.y });
  for (let i = 0; i < 60; i++) g.tick();
});

// Prove the pose actually changes across a stride, and that turning animation
// off freezes it. A still screenshot cannot show motion, so sample the canvas
// itself over several ticks. Raw pixels, not PNG bytes: two encodings of the
// same picture differ in length, which made an earlier version of this test
// pass on noise.
//
// The walker is the subject. An idle unit only breathes, which is deliberately
// sub-pixel and would not register here.
async function poseChange(animations) {
  await page.evaluate((on) => { window.game.settingsForTest.animations = on; }, animations);
  const frames = await page.evaluate(async () => {
    const g = window.game, out = [];
    g.issue({ type: "move", player: 1, units: [window.__walker], x: 28 * 64, y: 17 * 64 });
    for (let i = 0; i < 8; i++) {
      g.tick();
      // Let the render loop paint this tick before reading the canvas back.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const u = g.world.entities.get(window.__walker);
      if (!u) break;
      // Sample around wherever the walker is now, so travelling across the map
      // is not itself counted as a change of pose.
      const p = g.cam.toScreen(u.pos.x, u.pos.y);
      const ctx = g.canvas.getContext("2d");
      const d = ctx.getImageData(Math.round(p.x) - 34, Math.round(p.y) - 62, 68, 90).data;
      out.push(Array.from(d));
    }
    return out;
  });
  let diff = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i];
    for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) diff++;
  }
  return { diff, frames: frames.length };
}

const on = await poseChange(true);
const off = await poseChange(false);
console.log(`pose change over ${on.frames} frames — animation on: ${on.diff}, off: ${off.diff}`);
if (on.diff <= off.diff) throw new Error("animation made no difference to the drawn pose");

// The legs specifically. The pose check above would pass on the body bob alone,
// so sample only the lower third of the sprite, where the legs are, and require
// that to change too. This is what caught the hip transform being wrong: the
// legs were drawn clean off the sprite and every unit was cut off at the waist.
const legs = await page.evaluate(async () => {
  const g = window.game;
  g.settingsForTest.animations = true;
  g.issue({ type: "move", player: 1, units: [window.__walker], x: 12 * 64, y: 17 * 64 });
  const frames = [];
  for (let i = 0; i < 8; i++) {
    g.tick();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const u = g.world.entities.get(window.__walker);
    if (!u) break;
    const p = g.cam.toScreen(u.pos.x, u.pos.y);
    const ctx = g.canvas.getContext("2d");
    // Lower third of the figure: from the hip to just above the shadow.
    const d = ctx.getImageData(Math.round(p.x) - 22, Math.round(p.y) - 26, 44, 34).data;
    frames.push(Array.from(d));
  }
  let diff = 0;
  for (let i = 1; i < frames.length; i++)
    for (let j = 0; j < frames[i - 1].length; j++) if (frames[i - 1][j] !== frames[i][j]) diff++;
  return { diff, frames: frames.length };
});
console.log(`legs region changed by ${legs.diff} subpixels over ${legs.frames} frames`);
if (legs.diff < 2000) throw new Error("the legs are not moving");

// A stroke lasts eleven ticks of every sixty, so one sampled instant proves
// nothing -- watch a whole trip and count.
const strokes = await page.evaluate(() => {
  const g = window.game;
  let seen = 0;
  // The board is 160 tiles now, so the walk to a tree is much longer than the
  // ninety ticks this allowed when it was 64.
  for (let i = 0; i < 1400; i++) {
    g.tick();
    if (g.renderer.fx.strokeAt(window.__worker, g.world.tick) !== null) seen++;
  }
  return seen;
});
console.log(`worker mid-stroke on ${strokes} of 1400 ticks`);
if (strokes === 0) throw new Error("the worker never swung");
await browser.close();
