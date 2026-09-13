/**
 * Crop named rectangles out of a mockup.
 *
 * The interface sheets are not tile sheets -- they are pictures of a finished
 * HUD, laid out for a person to look at rather than for a program to cut up.
 * There is no grid to detect and nothing repeats, so the rectangles are simply
 * measured off a ruler render (tools/_ruler.mjs draws one) and named here by
 * whoever is doing the cutting. Trying to find them automatically would be
 * guessing at a layout that is only ever going to be cut once.
 *
 * Usage:
 *   node tools/crop_rects.mjs <sheet.png> <out-dir> --rects "name:x,y,w,h;name2:..." [--size 256]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const [sheetPath, outDir] = argv;
const flag = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const RECTS = (flag("--rects") ?? "").split(";").filter(Boolean).map((r) => {
  const [name, nums] = r.split(":");
  const [x, y, w, h] = nums.split(",").map(Number);
  return { name: name.trim(), x, y, w, h };
});
const MAXW = Number(flag("--size") ?? 256);
const QUALITY = Number(flag("--quality") ?? 0.84);
if (!sheetPath || !outDir || !RECTS.length) {
  console.log('usage: node tools/crop_rects.mjs <sheet.png> <out-dir> --rects "name:x,y,w,h;..." [--size 256]');
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const page = await browser.newPage();
const b64 = readFileSync(sheetPath).toString("base64");
const outs = await page.evaluate(async ([dataUrl, rects, maxw, q]) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const made = [];
  for (const r of rects) {
    const scale = Math.min(1, maxw / r.w);
    const c = document.createElement("canvas");
    c.width = Math.round(r.w * scale);
    c.height = Math.round(r.h * scale);
    const x = c.getContext("2d");
    x.imageSmoothingQuality = "high";
    x.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    made.push({ name: r.name, url: c.toDataURL("image/jpeg", q), w: c.width, h: c.height });
  }
  return made;
}, [`data:image/png;base64,${b64}`, RECTS, MAXW, QUALITY]);

mkdirSync(outDir, { recursive: true });
for (const o of outs) {
  writeFileSync(path.join(outDir, `${o.name}.jpg`), Buffer.from(o.url.split(",")[1], "base64"));
  console.log(`${o.name}  ${o.w}x${o.h}`);
}
await browser.close();
