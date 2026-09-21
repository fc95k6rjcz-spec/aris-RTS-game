import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
try {
  const page = await browser.newPage();
  const frames = await page.evaluate(async src => {
    const img = new Image(); img.src = src; await img.decode();
    const out = [];
    for (let level = 0; level < 10; level++) {
      const col = level % 5, row = Math.floor(level / 5);
      const x = Math.round(col * img.width / 5) + 6;
      const y = row === 0 ? 205 : 727;
      const w = Math.floor(img.width / 5) - 12;
      const h = row === 0 ? 430 : 490;
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d"); ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      const pixels = ctx.getImageData(0, 0, w, h), d = pixels.data;
      // Grass key, then retain the building component rather than sheet debris.
      const solid = new Uint8Array(w * h);
      for (let i = 0; i < solid.length; i++) {
        const k = i * 4, r = d[k], g = d[k + 1], b = d[k + 2];
        solid[i] = g > r * 1.035 && g > b * 1.28 ? 0 : 1;
      }
      const seen = new Uint8Array(w * h); let largest = [];
      for (let i = 0; i < solid.length; i++) {
        if (!solid[i] || seen[i]) continue;
        const q = [i]; seen[i] = 1;
        for (let j = 0; j < q.length; j++) {
          const p = q[j], px = p % w;
          for (const n of [px ? p - 1 : -1, px < w - 1 ? p + 1 : -1, p - w, p + w]) {
            if (n < 0 || n >= solid.length || seen[n] || !solid[n]) continue;
            seen[n] = 1; q.push(n);
          }
        }
        if (q.length > largest.length) largest = q;
      }
      const keep = new Uint8Array(w * h);
      let left = w, right = 0, top = h, bottom = 0;
      for (const p of largest) {
        keep[p] = 1; const px = p % w, py = Math.floor(p / w);
        left = Math.min(left, px); right = Math.max(right, px);
        top = Math.min(top, py); bottom = Math.max(bottom, py);
      }
      for (let i = 0; i < keep.length; i++) if (!keep[i]) d[i * 4 + 3] = 0;
      ctx.putImageData(pixels, 0, 0);
      const result = document.createElement("canvas");
      result.width = right - left + 5; result.height = bottom - top + 5;
      result.getContext("2d").drawImage(c, -left + 2, -top + 2);
      out.push(result.toDataURL("image/png").split(",")[1]);
    }
    return out;
  }, `data:image/png;base64,${readFileSync(process.argv[2]).toString("base64")}`);
  frames.forEach((data, i) => writeFileSync(`src/assets/gryphonaviary_${i + 1}.png`, Buffer.from(data, "base64")));
  console.log(`Extracted ${frames.length} Gryphon Aviary tiers`);
} finally { await browser.close(); }
