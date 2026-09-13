/**
 * Cut a regular tile sheet into individual ground tiles.
 *
 * Far simpler than the character sheets, because this one really is a grid: a
 * near-black page with bright square cells laid out in labelled bands. So the
 * cells can be found by brightness alone -- rows of bright pixels give the
 * bands, columns of bright pixels within a band give the cells -- with none of
 * the contrast and chroma work the figures needed.
 *
 * Usage:
 *   node tools/slice_tiles.mjs <sheet.png> <out-dir> --rows dry,wet,stone,wetstone [--size 128]
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const [sheetPath, outDir] = argv;
const flag = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
if (!sheetPath || !outDir) {
  console.log("usage: node tools/slice_tiles.mjs <sheet.png> <out-dir> --rows dry,wet,stone,wetstone [--size 128]");
  process.exit(1);
}
const ROWS = (flag("--rows") ?? "").split(",").filter(Boolean);
const SIZE = Number(flag("--size") ?? 128);
const PER_ROW = Number(flag("--per") ?? 10);
const INSET = Number(flag("--inset") ?? 0.06);
const NORM = argv.includes("--normalise");

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const page = await browser.newPage();
const b64 = readFileSync(sheetPath).toString("base64");

const cut = await page.evaluate(async ([dataUrl, S, PER_ROW, INSET, NORM]) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, W, H).data;
  const lum = (px, py) => { const i = (py * W + px) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; };

  const runs = (n, bright) => {
    const out = [];
    let s = -1;
    for (let i = 0; i <= n; i++) {
      const on = i < n && bright(i);
      if (on && s < 0) s = i;
      if (!on && s >= 0) { out.push([s, i]); s = -1; }
    }
    return out;
  };

  // Bands: rows where a good share of the width is well above the page black.
  const rowBright = [];
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let px = 0; px < W; px += 3) if (lum(px, y) > 52) n++;
    rowBright.push(n / (W / 3));
  }
  const bands = runs(H, (y) => rowBright[y] > 0.5).filter(([a, b]) => b - a > H * 0.05);

  const out = [];
  for (const [y0, y1] of bands) {
    const colBright = [];
    for (let px = 0; px < W; px++) {
      let n = 0;
      for (let y = y0; y < y1; y += 3) if (lum(px, y) > 52) n++;
      colBright.push(n / ((y1 - y0) / 3));
    }
    // The gaps between cells are narrow and the cells are evenly spaced, so
    // thresholding for them gave 8, 9, 10 and 12 on a sheet that plainly has ten
    // in every row. Take the band's bright extent instead and divide it, which
    // is exact for a regular grid and has nothing to tune.
    const lit = runs(W, (px) => colBright[px] > 0.35);
    const x0 = lit.length ? lit[0][0] : 0;
    const x1 = lit.length ? lit[lit.length - 1][1] : W;
    const per = (x1 - x0) / PER_ROW;
    const cells = [];
    for (let i = 0; i < PER_ROW; i++) cells.push([Math.round(x0 + i * per), Math.round(x0 + (i + 1) * per)]);
    out.push({ y0, y1, cells, per });
  }

  // Re-render each cell square, at the size the game wants.
  const tile = document.createElement("canvas");
  tile.width = S; tile.height = S;
  const t = tile.getContext("2d", { willReadFrequently: true });
  t.imageSmoothingQuality = "high";
  const images = [];
  // Two passes when normalising: measure every cell's average colour first,
  // then pull each one onto the shared average.
  const means = [];
  const rawCells = [];
  for (const band of out) {
    const row = [];
    for (const [cx0, cx1] of band.cells) {
      // Inset a little: the cells carry a thin border that would tile as a grid.
      // The cells are square, so the side comes from the width and the vertical
      // position from the band's centre -- the detected band height varies by a
      // few percent with the threshold and would otherwise squash a row.
      const inset = Math.round((cx1 - cx0) * INSET);
      const side = cx1 - cx0 - inset * 2;
      const sx = cx0 + inset;
      const sy = Math.round((band.y0 + band.y1) / 2 - side / 2);
      t.clearRect(0, 0, S, S);
      t.drawImage(img, sx, sy, side, side, 0, 0, S, S);
      if (NORM) {
        const px = t.getImageData(0, 0, S, S);
        let r = 0, g2 = 0, b2 = 0;
        for (let i = 0; i < px.data.length; i += 4) { r += px.data[i]; g2 += px.data[i + 1]; b2 += px.data[i + 2]; }
        const n = px.data.length / 4;
        means.push([r / n, g2 / n, b2 / n]);
        rawCells.push(px);
        row.push(null);
      } else {
        row.push(tile.toDataURL("image/jpeg", 0.86));
      }
    }
    images.push(row);
  }

  if (NORM) {
    // The shared average, and a per-tile gain that brings each one onto it.
    //
    // This is what stops a field of thirty-five photographs reading as a
    // chequerboard. The variants differ in overall tone as much as in detail --
    // one is a shade darker, the next a shade yellower -- and laid edge to edge
    // the eye takes that step for a boundary and sees squares. Matching the
    // averages leaves every blade, daisy and stone exactly where it was and
    // removes the only thing that was drawing the grid.
    const target = [0, 1, 2].map((k) => means.reduce((a, m) => a + m[k], 0) / means.length);
    let at = 0;
    for (const row of images) {
      for (let i = 0; i < row.length; i++) {
        const px = rawCells[at];
        const m = means[at];
        at++;
        const gain = [0, 1, 2].map((k) => target[k] / Math.max(1, m[k]));
        for (let j = 0; j < px.data.length; j += 4) {
          px.data[j] = Math.min(255, px.data[j] * gain[0]);
          px.data[j + 1] = Math.min(255, px.data[j + 1] * gain[1]);
          px.data[j + 2] = Math.min(255, px.data[j + 2] * gain[2]);
        }
        t.putImageData(px, 0, 0);
        row[i] = tile.toDataURL("image/jpeg", 0.86);
      }
    }
  }
  return { W, H, bands: out.map((b) => ({ y: [b.y0, b.y1], n: b.cells.length })), images };
}, [`data:image/png;base64,${b64}`, SIZE, PER_ROW, INSET, NORM]);

console.log(`${path.basename(sheetPath)} ${cut.W}x${cut.H}`);
cut.bands.forEach((b, i) => console.log(`band ${i} (${ROWS[i] ?? "?"})  y=${b.y[0]}..${b.y[1]}  cells=${b.n}`));

if (ROWS.length) {
  mkdirSync(outDir, { recursive: true });
  let n = 0;
  cut.images.forEach((row, bi) => {
    const name = ROWS[bi];
    if (!name) return;
    row.forEach((url, ci) => {
      writeFileSync(path.join(outDir, `${name}_${ci}.jpg`), Buffer.from(url.split(",")[1], "base64"));
      n++;
    });
  });
  console.log(`wrote ${n} tiles at ${SIZE}px into ${outDir}`);
} else {
  console.log("\nno --rows given, nothing written");
}
await browser.close();
