/**
 * Cut a character contact sheet into animation frames.
 *
 * The art for this game arrives as one big image per character: labelled bands
 * down the page -- IDLE, WALK, RUN, CHOP WOOD, BUILD, CARRY -- with a row of
 * figures in each, every figure standing on a patch of ground with a coloured
 * selection ellipse under it.
 *
 * Three things were tried before this one, and the failures are worth keeping:
 *
 *   - sampling the corners for a background colour and cutting where the ink
 *     stops. These sheets have a WHITE margin around DARK artwork, so the
 *     background read as white and the entire sheet read as ink. No bands.
 *   - finding the selection ellipses by colour. The ring is a soft green --
 *     around 158,222,149, a saturation of only about a third -- so the obvious
 *     "find the saturated pixels" test threw every one of them away; and once
 *     the threshold was loosened enough to catch them it caught the sunlit
 *     foliage as well.
 *   - assuming a uniform grid. The pitch IS uniform within a band, at about
 *     187px on the worker sheet, but the sections are separated by gaps, so
 *     dividing the band by the frame count drifts and cuts figures in half.
 *
 * What works is simpler than any of them. A band divider is a thin, flat,
 * slightly brighter line running the whole width -- artwork is never flat
 * across 2600 pixels -- which gives the bands exactly. And within a band a
 * figure is a column of high contrast against flat ground, so the per-column
 * standard deviation, taken over the figure's own height and ignoring the label
 * strip, rises over each figure and falls between them. Runs of high deviation
 * are the frames.
 *
 * Usage:
 *   node tools/slice_sheet.mjs <sheet.png> <out-dir> --name worker \
 *     --clips "idle:5,walk:4,run:3|chop:5,mine:5|build:5,repair:5|carry:3,gather:3,deposit:4"
 *
 * `--clips` names the sections band by band (bands separated by `|`), because
 * the labels are words in a picture and OCR for six words is not worth a
 * dependency. Run without it first: it reports what it found, band by band, and
 * you write the argument from that.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const [sheetPath, outDir] = argv;
const flag = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : null;
};
if (!sheetPath || !outDir) {
  console.log('usage: node tools/slice_sheet.mjs <sheet.png> <out-dir> --name worker [--clips "idle:5,walk:4|..."]');
  process.exit(1);
}
const NAME = flag("--name") ?? path.basename(sheetPath).replace(/\.[^.]+$/, "");
const CLIPS = flag("--clips");
const HEIGHT = Number(flag("--height") ?? 1.5);

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage();
const b64 = readFileSync(sheetPath).toString("base64");

const found = await page.evaluate(async (dataUrl) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, W, H).data;
  const lum = (px, y) => {
    const i = (y * W + px) * 4;
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  };

  // ── bands ──
  const rowMean = new Float64Array(H);
  const rowSd = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    let s = 0, s2 = 0, n = 0;
    for (let px = 0; px < W; px += 2) { const v = lum(px, y); s += v; s2 += v * v; n++; }
    const m = s / n;
    rowMean[y] = m;
    rowSd[y] = Math.sqrt(Math.max(0, s2 / n - m * m));
  }
  const raw = [];
  for (let y = 6; y < H - 6; y++) {
    if (rowSd[y] < 26 && rowMean[y] - Math.max(rowMean[y - 5], rowMean[y + 5]) > 6) raw.push(y);
  }
  const dividers = [];
  for (const y of raw) {
    const last = dividers[dividers.length - 1];
    if (last !== undefined && y - last <= 4) dividers[dividers.length - 1] = y;
    else dividers.push(y);
  }

  // ── figures within each band ──
  const bands = [];
  for (let i = 0; i < dividers.length - 1; i++) {
    const y0 = dividers[i] + 3;
    const y1 = dividers[i + 1] - 3;
    if (y1 - y0 < 60) continue;
    // Ignore the label strip at the top: text on flat ground reads as a figure.
    const fy0 = y0 + Math.round((y1 - y0) * 0.22);
    const fy1 = y1 - Math.round((y1 - y0) * 0.06);
    const sd = new Float64Array(W);
    for (let px = 0; px < W; px++) {
      let s = 0, s2 = 0, n = 0;
      for (let y = fy0; y < fy1; y++) { const v = lum(px, y); s += v; s2 += v * v; n++; }
      const m = s / n;
      sd[px] = Math.sqrt(Math.max(0, s2 / n - m * m));
    }
    const sorted = [...sd].sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.25)];
    const hi = sorted[Math.floor(sorted.length * 0.9)];
    const cut = lo + (hi - lo) * 0.42;
    let runs = [];
    let c0 = -1;
    for (let px = 0; px <= W; px++) {
      const loud = px < W && sd[px] > cut;
      if (loud && c0 < 0) c0 = px;
      if (!loud && c0 >= 0) { if (px - c0 > 30) runs.push([c0, px]); c0 = -1; }
    }
    // A figure can break into two runs where a limb crosses flat background.
    // Merge anything much closer together than the typical spacing.
    const centres = runs.map((r) => (r[0] + r[1]) / 2);
    const gaps = centres.slice(1).map((v, k) => v - centres[k]).sort((a, b) => a - b);
    const pitch = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 200;
    // Merge on distance between CENTRES, not between edges. Figures very nearly
    // touch on these sheets, so an edge test merged whole neighbouring frames
    // together and turned thirteen figures into seven.
    const mergedRuns = [];
    for (const r of runs) {
      const last = mergedRuns[mergedRuns.length - 1];
      if (last && (r[0] + r[1]) / 2 - (last[0] + last[1]) / 2 < pitch * 0.5) last[1] = r[1];
      else mergedRuns.push([...r]);
    }
    // Drop anything hard against the sheet edge: banners and crests, not figures.
    runs = mergedRuns.filter((r) => (r[0] + r[1]) / 2 > W * 0.015 && (r[0] + r[1]) / 2 < W * 0.985);
    bands.push({ y0, y1, runs, pitch: Math.round(pitch) });
  }
  return { W, H, dividers, bands };
}, `data:image/png;base64,${b64}`);

// Section breaks: a gap much wider than the run of frames around it.
const described = found.bands.map((b) => {
  const centres = b.runs.map((r) => (r[0] + r[1]) / 2);
  const gaps = centres.slice(1).map((v, i) => v - centres[i]);
  const med = [...gaps].sort((a, b2) => a - b2)[Math.floor(gaps.length / 2)] || b.pitch;
  const sections = [];
  let cur = [0];
  for (let i = 0; i < gaps.length; i++) {
    if (gaps[i] > med * 1.45) { sections.push(cur); cur = []; }
    cur.push(i + 1);
  }
  sections.push(cur);
  return { ...b, sections };
});

console.log(`${path.basename(sheetPath)}  ${found.W}x${found.H}`);
console.log(`dividers: ${found.dividers.join(" ")}`);
described.forEach((b, i) => {
  console.log(`band ${i}  y=${b.y0}..${b.y1}  frames=${b.runs.length}  sections=[${b.sections.map((s) => s.length).join(", ")}]`);
});

if (!CLIPS) {
  console.log('\nNo --clips given, so nothing was written. Name the sections from the list above, e.g.');
  console.log(`  --clips "${described.map((b) => b.sections.map((s, i) => `name${i}:${s.length}`).join(",")).join("|")}"`);
  await browser.close();
  process.exit(0);
}

// Build the descriptor.
const bandSpecs = CLIPS.split("|").map((b) => b.split(",").map((c) => {
  const [k, n] = c.split(":");
  return { key: k.trim(), n: Number(n) };
}));
const clips = {};
let total = 0;
bandSpecs.forEach((spec, bi) => {
  const band = described[bi];
  if (!band) { console.log(`! no band ${bi} on this sheet`); return; }
  let at = 0;
  for (const { key, n } of spec) {
    const frames = band.runs.slice(at, at + n).map(([x0, x1]) => ({ x: x0, y: band.y0, w: x1 - x0, h: band.y1 - band.y0 }));
    at += n;
    if (frames.length !== n) console.log(`! ${key}: wanted ${n} frames, band had ${frames.length}`);
    clips[key] = { frames, fps: key === "idle" ? 4 : key === "run" ? 12 : 8, loop: key !== "die" };
    total += frames.length;
  }
});

mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, `${NAME}.json`),
  JSON.stringify({ sheet: path.basename(sheetPath), width: found.W, height: found.H, unitHeight: HEIGHT, clips }, null, 2),
);
console.log(`\n${NAME}: ${Object.keys(clips).length} clips, ${total} frames -> ${path.join(outDir, NAME + ".json")}`);
for (const [k, v] of Object.entries(clips)) {
  console.log(`  ${k.padEnd(9)} ${String(v.frames.length).padStart(2)} frames  ${v.frames[0] ? `${v.frames[0].w}x${v.frames[0].h}` : "-"}`);
}
await browser.close();
