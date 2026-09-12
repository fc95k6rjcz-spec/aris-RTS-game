/**
 * Frame cost on a big board.
 *
 * The 160x160 map arrived with the terrain still baked whole, at 40 px a tile:
 * a 6400x6400 canvas, about 160 MB of image memory, high-quality-resampled every
 * frame. Fog was drawn as one translucent rect per on-screen tile on top of that.
 * The result was the "kind of glitchy" report. This measures the draw path
 * directly at both ends of the zoom range so a regression shows up as a number
 * rather than as a feeling.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

const r = await page.evaluate(async () => {
  const g = window.game;
  g.settingsForTest.mapId = "random";
  g.settingsForTest.nomad = false;
  // Classic start: this test is not about the crowning opening.
  g.settingsForTest.crowning = false;
  g.start("normal");
  for (let i = 0; i < 400; i++) g.tick();

  const frames = (zoom) => {
    g.cam.zoom = zoom;
    g.cam.centerOn((g.world.map.width / 2) * 64, (g.world.map.height / 2) * 64);
    // Warm the caches first: the first frame at a new zoom pays for baking.
    for (let i = 0; i < 3; i++) g.renderer.draw(0, new Set(), null, null, g.cam.viewH);
    const t0 = performance.now();
    const N = 30;
    for (let i = 0; i < N; i++) g.renderer.draw(i / N, new Set(), null, null, g.cam.viewH);
    return (performance.now() - t0) / N;
  };

  return {
    size: g.world.map.width,
    units: g.world.units().length,
    far: frames(16),
    mid: frames(28),
    near: frames(48),
  };
});
await browser.close();

console.log(`map ${r.size}x${r.size}, ${r.units} units`);
for (const k of ["far", "mid", "near"]) console.log(`  ${k.padEnd(5)} ${r[k].toFixed(2)} ms/frame`);

// 16.6 ms is one frame at 60 Hz, and the draw is only part of a frame's work.
// Anything over 10 ms here is visible stutter on a modest machine.
const worst = Math.max(r.far, r.mid, r.near);
if (worst > 10) {
  console.log(`FAIL: worst frame ${worst.toFixed(2)} ms`);
  process.exit(1);
}
console.log("PASS: the board draws smoothly");
