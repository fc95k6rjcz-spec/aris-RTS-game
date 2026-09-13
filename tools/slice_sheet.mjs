/**
 * Cut a character contact sheet into frames.
 *
 * The art for this game arrives as one big image per character: labelled bands
 * down the page -- IDLE, WALK, RUN, CHOP WOOD, BUILD, CARRY -- with a row of
 * frames in each, every frame standing on a little patch of ground with a
 * coloured selection ellipse under it. They are not uniform grids. Frame widths
 * vary within a row, the bands are different heights, and there is a title
 * block at the top and a wide scene at the bottom that is not animation at all.
 *
 * So rather than assume a grid, this finds the frames: it treats the sheet as
 * ink on a background, collapses it to row and column profiles, and cuts where
 * the ink stops. That is robust to all of the above and needs nothing from the
 * artist but the sheet.
 *
 * Usage:
 *   node tools/slice_sheet.mjs <sheet.png> <out-dir> [--name worker] [--debug]
 *
 * Writes <out-dir>/<name>_<band>_<n>.png and <out-dir>/<name>.json, the latter
 * being the descriptor src/render/anim.ts expects.
 *
 * The band names are guessed from order, not read -- OCR for six words is not
 * worth the dependency -- so check the JSON and rename bands by hand if the
 * sheet's layout differs from the usual one. The list is in BAND_ORDER below.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [, , sheetPath, outDir, ...rest] = process.argv;
if (!sheetPath || !outDir) {
  console.log("usage: node tools/slice_sheet.mjs <sheet.png> <out-dir> [--name worker] [--debug]");
  process.exit(1);
}
const nameArg = rest.indexOf("--name");
const NAME = nameArg >= 0 ? rest[nameArg + 1] : path.basename(sheetPath).replace(/\.[^.]+$/, "");
const DEBUG = rest.includes("--debug");

/** Bands are named by the order they usually appear in, top to bottom. */
const BAND_ORDER = ["idle", "walk", "run", "chop", "mine", "build", "repair", "carry", "gather", "deposit"];

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const page = await browser.newPage();
const b64 = readFileSync(sheetPath).toString("base64");

const result = await page.evaluate(async (dataUrl) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H).data;

  // The background is whatever colour the sheet's margins are: sample the
  // corners rather than assuming black, since one of these sheets is dark brown
  // and another is near-black with a vignette.
  const at = (x, y) => {
    const i = (y * W + x) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  };
  const corners = [at(2, 2), at(W - 3, 2), at(2, H - 3), at(W - 3, H - 3)];
  const bg = [0, 1, 2].map((k) => Math.round(corners.reduce((a, p) => a + p[k], 0) / corners.length));
  const TOL = 46;
  const isInk = (x, y) => {
    const [r, g, b] = at(x, y);
    return Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > TOL;
  };

  // Row profile: how much ink each scanline carries.
  const rows = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x += 2) if (isInk(x, y)) n++;
    rows[y] = n / (W / 2);
  }
  // Bands are runs of rows carrying real ink, separated by quiet rows.
  const bands = [];
  const QUIET = 0.06;
  let start = -1;
  for (let y = 0; y < H; y++) {
    const loud = rows[y] > QUIET;
    if (loud && start < 0) start = y;
    if ((!loud || y === H - 1) && start >= 0) {
      const end = y;
      if (end - start > H * 0.035) bands.push([start, end]);
      start = -1;
    }
  }

  // Column profile within each band gives the frames.
  const out = [];
  for (const [y0, y1] of bands) {
    const cols = new Float64Array(W);
    for (let x = 0; x < W; x++) {
      let n = 0;
      for (let y = y0; y < y1; y += 2) if (isInk(x, y)) n++;
      cols[x] = n / ((y1 - y0) / 2);
    }
    const frames = [];
    let cs = -1;
    for (let x = 0; x < W; x++) {
      const loud = cols[x] > 0.04;
      if (loud && cs < 0) cs = x;
      if ((!loud || x === W - 1) && cs >= 0) {
        const w = x - cs;
        if (w > W * 0.02) frames.push([cs, x]);
        cs = -1;
      }
    }
    out.push({ y0, y1, frames });
  }
  return { W, H, bg, bands: out };
}, `data:image/png;base64,${b64}`);

// The title block and the wide bottom scene are not animation: drop any band
// whose frames are one very wide block, and any with a single frame.
const bands = result.bands.filter((b) => b.frames.length >= 2 && b.frames.some(([a, z]) => z - a < result.W * 0.4));

mkdirSync(outDir, { recursive: true });
const clips = {};
let cut = 0;
for (let i = 0; i < bands.length; i++) {
  const band = bands[i];
  const key = BAND_ORDER[i] ?? `band${i}`;
  const frames = band.frames.map(([x0, x1]) => ({ x: x0, y: band.y0, w: x1 - x0, h: band.y1 - band.y0 }));
  clips[key] = { frames, fps: key === "idle" ? 5 : 10, loop: key !== "die" };
  cut += frames.length;
}

writeFileSync(
  path.join(outDir, `${NAME}.json`),
  JSON.stringify({ sheet: path.basename(sheetPath), width: result.W, height: result.H, clips }, null, 2),
);

console.log(`${NAME}: ${bands.length} bands, ${cut} frames`);
for (const [k, v] of Object.entries(clips)) console.log(`  ${k.padEnd(8)} ${v.frames.length} frames  ${v.frames[0].w}x${v.frames[0].h}`);
if (DEBUG) console.log(JSON.stringify(result.bands.map((b) => ({ y: [b.y0, b.y1], n: b.frames.length })), null, 2));
console.log(`\nwrote ${path.join(outDir, NAME + ".json")}`);
console.log("Check the band names against the sheet's labels and rename in the JSON if they differ.");

await browser.close();
