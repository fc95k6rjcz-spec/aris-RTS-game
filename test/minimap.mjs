/**
 * Clicking the minimap.
 *
 * The one thing that has to be true is that the camera goes where you pointed.
 * It did not: the click was measured across the whole canvas element while the
 * map is drawn as a centred square, and then half a viewport was subtracted
 * before calling `centerOn`, which subtracts half a viewport itself. So every
 * jump was stretched sideways and landed half a screen up and to the left.
 *
 * This measures the round trip the only way that means anything -- click a
 * point, then ask the renderer's own world-to-screen transform where that
 * world point ended up on screen. It should be in the middle of the view.
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
  g.settingsForTest.crowning = false;
  g.settingsForTest.edgeScroll = false;
  g.start("none");
  const w = g.world, SUB = 64;
  // Fog off: a click into unexplored country is still a click.
  w.fogEnabled = true;

  // `shell` is TypeScript-private, which is a compile-time fiction: at runtime
  // it is an ordinary field, and it owns the canvas the handler is bound to.
  const mm = g.shell?.minimap;
  if (!mm) return { error: "no minimap canvas" };
  // Two frames, so the shell has been laid out and `resize` has given the
  // minimap canvas a real backing store. Measured on the frame `start` returns
  // it is still 1x1 and every click lands on the same pixel.
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  if (mm.width < 32 || mm.height < 32) return { error: `minimap canvas is ${mm.width}x${mm.height}` };
  const rect = mm.getBoundingClientRect();
  const size = Math.min(mm.width, mm.height);
  const ox = (mm.width - size) / 2;
  const oy = (mm.height - size) / 2;

  const click = (cx, cy) => {
    mm.dispatchEvent(new MouseEvent("mousedown", { clientX: cx, clientY: cy, bubbles: true }));
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  };

  // Nine points across the drawn square.
  //
  // Whole pixels, and the expected world point derived from the pixel that
  // actually arrives rather than from the nominal fraction. MouseEvent's
  // clientX is a long, so a click composed at x = 56.8 is delivered at 56, and
  // four fifths of a pixel on a 174-pixel minimap of a 160-tile map is 47
  // sub-units of camera -- which looks exactly like a real off-by-a-bit and is
  // nothing but the test's own rounding.
  //
  // `want` is computed from the DRAWING convention, not from the click handler:
  // drawMinimap puts tile t at pixel ox + t * size / mapWidth, so the pixel
  // under the cursor names that tile. Asserting the handler inverts the drawing
  // is the whole property -- it is the one that was broken, twice over.
  const out = [];
  for (const fy of [0.2, 0.5, 0.8]) {
    for (const fx of [0.2, 0.5, 0.8]) {
      const px = Math.round(ox + fx * size);
      const py = Math.round(oy + fy * size);
      const cx = Math.round(rect.left + px * (rect.width / mm.width));
      const cy = Math.round(rect.top + py * (rect.height / mm.height));
      click(cx, cy);
      const gotPx = (cx - rect.left) * (mm.width / rect.width) - ox;
      const gotPy = (cy - rect.top) * (mm.height / rect.height) - oy;
      const wantX = (gotPx / size) * w.map.width * SUB;
      const wantY = (gotPy / size) * w.map.height * SUB;
      // Where that world point now sits on screen.
      const s = g.cam.toScreen(wantX, wantY);
      // The middle of the view. Anything clamped against a map edge is expected
      // to miss, so record how much room the camera actually had.
      const midX = g.cam.viewW / 2;
      const midY = g.cam.viewH / 2;
      const halfW = g.cam.viewW / g.cam.scale / 2;
      const halfH = g.cam.viewH / g.cam.scale / 2;
      const clamped =
        wantX < halfW || wantY < halfH ||
        wantX > w.map.width * SUB - halfW || wantY > w.map.height * SUB - halfH;
      out.push({ fx, fy, clamped, dx: Math.round(s.x - midX), dy: Math.round(s.y - midY),
                 camX: Math.round(g.cam.x), camY: Math.round(g.cam.y),
                 maxX: Math.round(w.map.width * SUB - g.cam.viewW / g.cam.scale),
                 maxY: Math.round(w.map.height * SUB - g.cam.viewH / g.cam.scale),
                 halfW: Math.round(halfW), halfH: Math.round(halfH),
                 wantX: Math.round(wantX), wantY: Math.round(wantY) });
    }
  }

  // And the margin: a click in the letterbox beside the square must clamp to
  // the edge of the map, not fly off it.
  let marginOk = true;
  if (ox > 2) {
    click(rect.left + 1, rect.top + rect.height / 2);
    marginOk = g.cam.x <= 1;
  }
  return { out, marginOk, panel: { w: mm.width, h: mm.height }, letterbox: { ox: Math.round(ox), oy: Math.round(oy) } };
});
await browser.close();

if (r.error) { console.log("FAIL: " + r.error); process.exit(1); }
console.log(`minimap canvas ${r.panel.w}x${r.panel.h}, letterbox margin ${r.letterbox.ox},${r.letterbox.oy}`);
for (const p of r.out) {
  const detail = Math.abs(p.dx) > 2 || Math.abs(p.dy) > 2
    ? `  (camera ${p.camX},${p.camY} of max ${p.maxX},${p.maxY}; wanted ${p.wantX},${p.wantY})`
    : "";
  console.log(`  click (${p.fx}, ${p.fy})${p.clamped ? " [at a map edge]" : ""} → off centre by ${p.dx}, ${p.dy} px${detail}`);
}

const fail = [];
// Two pixels of slack for the rounding in the conversion; anything real is
// tens or hundreds of pixels out.
for (const p of r.out) {
  if (p.clamped) continue;
  if (Math.abs(p.dx) > 2 || Math.abs(p.dy) > 2) {
    fail.push(`clicking (${p.fx}, ${p.fy}) put that spot ${p.dx},${p.dy} px off the middle of the view`);
  }
}
if (!r.marginOk) fail.push("clicking the letterbox margin did not clamp to the edge of the map");
if (fail.length) {
  for (const f of fail) console.log("FAIL: " + f);
  process.exit(1);
}
console.log("PASS: the minimap goes where you point it");
