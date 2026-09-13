/**
 * Cut the figures out of their backdrops.
 *
 * slice_sheet.mjs finds where the frames are; this takes them out of the
 * picture. Each frame is an illustration, not a sprite: the figure stands on a
 * patch of painted ground, under a coloured selection ring, sometimes beside a
 * tree or a fence post that belongs to the scene and not to him.
 *
 * The method, which is the one tools/extract_ships.py arrived at for the fleet:
 *
 *   1. Key the background. It is flat and dark on these sheets, so the colour
 *      is sampled from the frame's own top corners rather than assumed -- the
 *      bands differ, and the sheets differ from each other.
 *   2. Flood from the border, so only background CONNECTED TO THE EDGE is
 *      removed. A dark fold in the tunic is the same colour as the ground and
 *      must survive; it does, because it is walled in by the figure.
 *   3. Keep the largest remaining blob. Trees, fence posts and stone piles are
 *      scenery: they survive the key, and none of them touch the man, so taking
 *      the single biggest component throws all of them away at once.
 *   4. Drop the selection ring, which is keyed by its own colour -- a soft green
 *      or red that appears nowhere else on a figure.
 *   5. Feather one pixel, and crop to what is left.
 *
 * Usage:
 *   node tools/extract_frames.mjs <sheet.png> <descriptor.json> <out-dir> [--only idle,walk,run]
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const [sheetPath, descPath, outDir] = argv;
const onlyArg = argv.indexOf("--only");
const ONLY = onlyArg >= 0 ? argv[onlyArg + 1].split(",") : null;
if (!sheetPath || !descPath || !outDir) {
  console.log("usage: node tools/extract_frames.mjs <sheet.png> <descriptor.json> <out-dir> [--only idle,walk]");
  process.exit(1);
}
const desc = JSON.parse(readFileSync(descPath, "utf8"));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage();
const b64 = readFileSync(sheetPath).toString("base64");

const jobs = [];
for (const [clip, data] of Object.entries(desc.clips)) {
  if (ONLY && !ONLY.includes(clip)) continue;
  data.frames.forEach((f, i) => jobs.push({ clip, i, f }));
}

const results = await page.evaluate(async ([dataUrl, list]) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const out = [];
  for (const job of list) {
    const { x, y, w, h } = job.f;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;
    const at = (px, py) => (py * w + px) * 4;

    // 1. The backdrop colour, from the frame's own upper corners.
    let br = 0, bg = 0, bb = 0, n = 0;
    for (const [sx, sy] of [[3, 3], [w - 4, 3], [Math.floor(w / 2), 3], [3, Math.floor(h * 0.12)], [w - 4, Math.floor(h * 0.12)]]) {
      const i = at(sx, sy);
      br += d[i]; bg += d[i + 1]; bb += d[i + 2]; n++;
    }
    br /= n; bg /= n; bb /= n;
    const bgLum = 0.299 * br + 0.587 * bg + 0.114 * bb;

    // Chroma, not brightness.
    //
    // The first attempt keyed on distance in RGB and ate the man's trousers.
    // Measured down the middle of a frame: the backdrop is 49,48,46 and the
    // trousers are 45,40,26 -- nearly the same brightness, and well inside any
    // tolerance loose enough to catch the backdrop's own variation. What
    // separates them is that the backdrop is NEUTRAL, red green and blue within
    // three or four of each other, while everything painted on the man is warm
    // or cool: the trousers spread nineteen, the shirt is blue-dominant, the
    // skin red-dominant. So the test is "grey, and about as bright as the
    // corners" -- which keeps a dark brown boot and drops a dark grey wall.
    const isBg = (i) => {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      // Asymmetric on brightness. The backdrop is lit evenly and never falls far
      // below its own corners, but a figure's shadowed legs and boots do -- and
      // a symmetric window keyed them out, leaving a man cut off at the knee.
      return chroma < 15 && l - bgLum > -13 && l - bgLum < 30;
    };

    // 4. The selection ring, wherever it is.
    const isRing = (i) => {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      return (g > 140 && g - r > 32 && g - b > 32) || (r > 140 && r - g > 38 && r - b > 32);
    };

    // 2. Flood the background inward from the border.
    const keep = new Uint8Array(w * h).fill(1);
    const stack = [];
    const push = (px, py) => {
      const p = py * w + px;
      if (px < 0 || py < 0 || px >= w || py >= h || !keep[p]) return;
      const i = p * 4;
      if (!isBg(i) && !isRing(i)) return;
      keep[p] = 0;
      stack.push(px, py);
    };
    for (let px = 0; px < w; px++) { push(px, 0); push(px, h - 1); }
    for (let py = 0; py < h; py++) { push(0, py); push(w - 1, py); }
    while (stack.length) {
      const py = stack.pop(), px = stack.pop();
      push(px + 1, py); push(px - 1, py); push(px, py + 1); push(px, py - 1);
    }
    // The ring is often walled off from the border by the boots; kill it outright.
    for (let p = 0; p < w * h; p++) if (keep[p] && isRing(p * 4)) keep[p] = 0;
    // And in the bottom sliver, anything green is the ellipse or the grass it is
    // drawn on, not the man: his boots are brown and his trousers are brown.
    const soleFrom = Math.floor(h * 0.86);
    for (let py = soleFrom; py < h; py++)
      for (let px = 0; px < w; px++) {
        const p = py * w + px;
        if (!keep[p]) continue;
        const i = p * 4;
        if (d[i + 1] > d[i] + 6 && d[i + 1] > d[i + 2] + 6) keep[p] = 0;
      }

    // 3. Largest connected blob of what survives.
    const label = new Int32Array(w * h).fill(-1);
    let best = -1, bestN = 0, next = 0;
    for (let p0 = 0; p0 < w * h; p0++) {
      if (!keep[p0] || label[p0] >= 0) continue;
      const id2 = next++;
      let count = 0;
      const st = [p0];
      label[p0] = id2;
      while (st.length) {
        const p = st.pop();
        count++;
        const px = p % w, py = (p / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (keep[q] && label[q] < 0) { label[q] = id2; st.push(q); }
        }
      }
      if (count > bestN) { bestN = count; best = id2; }
    }

    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let p = 0; p < w * h; p++) {
      const on = keep[p] && label[p] === best;
      d[p * 4 + 3] = on ? 255 : 0;
      if (on) {
        const px = p % w, py = (p / w) | 0;
        if (px < x0) x0 = px;
        if (py < y0) y0 = py;
        if (px > x1) x1 = px;
        if (py > y1) y1 = py;
      }
    }
    ctx.putImageData(id, 0, 0);

    if (x1 <= x0 || y1 <= y0) { out.push(null); continue; }
    // 5. Crop to content, with a pixel of margin for the feather.
    const cw = x1 - x0 + 3, ch = y1 - y0 + 3;
    const cc = document.createElement("canvas");
    cc.width = cw; cc.height = ch;
    const cx = cc.getContext("2d");
    cx.drawImage(c, x0 - 1, y0 - 1, cw, ch, 0, 0, cw, ch);
    out.push({ url: cc.toDataURL("image/png"), w: cw, h: ch, footY: y1 - y0 + 1, area: bestN });
  }
  return out;
}, [`data:image/png;base64,${b64}`, jobs.map((j) => ({ f: j.f }))]);

const manifest = {};
results.forEach((r, k) => {
  const job = jobs[k];
  if (!r) { console.log(`! ${job.clip}[${job.i}] came out empty`); return; }
  const file = `${path.basename(descPath, ".json")}_${job.clip}_${job.i}.png`;
  writeFileSync(path.join(outDir, file), Buffer.from(r.url.split(",")[1], "base64"));
  (manifest[job.clip] ??= []).push({ file, w: r.w, h: r.h });
  console.log(`${job.clip}[${job.i}] ${r.w}x${r.h}  ${r.area}px`);
});
writeFileSync(path.join(outDir, `${path.basename(descPath, ".json")}_frames.json`), JSON.stringify(manifest, null, 2));
await browser.close();
