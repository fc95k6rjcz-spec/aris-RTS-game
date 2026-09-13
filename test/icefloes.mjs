/**
 * Pack ice comes in sheets, and the sea stays sailable.
 *
 * Two things have to hold together, and they pull against each other. A floe
 * has to be a sheet -- something you sail around or send an Icebreaker through
 * -- rather than a sprinkle of single tiles, which is neither. And it must not
 * seal the sea: a ship that cannot leave its own bay is a broken match, not a
 * hard one.
 *
 * The first was broken for a long time in a way that hid the second. Ice was
 * written into the same grid it was testing, and a tile only qualifies if all
 * eight of its neighbours are open water, so the moment one tile froze its
 * neighbours never could. Ice landed on alternating tiles only -- a perfect
 * chequerboard -- which both looked wrong and quietly suppressed three quarters
 * of the ice the map asked for.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.game);

const runs = await page.evaluate(() => {
  const ICE = 6, WATER = 2;
  const out = [];
  for (const mapId of ["islands-7926", "islands-31683", "lakeland-7927", "islands-47521"]) {
    const g = window.game;
    g.settingsForTest.wildlife = false;
    g.settingsForTest.crowning = false;
    g.settingsForTest.mapId = mapId;
    g.start("none");
    const m = g.world.map;

    let ice = 0, water = 0, lonely = 0;
    for (let y = 0; y < m.height; y++)
      for (let x = 0; x < m.width; x++) {
        const t = m.get(x, y);
        if (t === WATER) water++;
        if (t !== ICE) continue;
        ice++;
        // A floe with no ice against any of its four sides is a single tile
        // floating on its own, which is the sprinkle this is meant not to be.
        let touching = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
          if (m.inBounds(x + dx, y + dy) && m.get(x + dx, y + dy) === ICE) touching++;
        if (touching === 0) lonely++;
      }

    // Can a ship still get about? Count how much of the open water is reachable
    // from the largest single body of it.
    const seen = new Uint8Array(m.width * m.height);
    let bestBody = 0;
    for (let sy = 0; sy < m.height; sy++)
      for (let sx = 0; sx < m.width; sx++) {
        const i0 = sy * m.width + sx;
        if (seen[i0] || m.get(sx, sy) !== WATER) continue;
        let n = 0;
        const st = [i0];
        seen[i0] = 1;
        while (st.length) {
          const p = st.pop();
          n++;
          const px = p % m.width, py = (p / m.width) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = px + dx, ny = py + dy;
            if (!m.inBounds(nx, ny)) continue;
            const q = ny * m.width + nx;
            if (seen[q] || m.get(nx, ny) !== WATER) continue;
            seen[q] = 1;
            st.push(q);
          }
        }
        if (n > bestBody) bestBody = n;
      }

    out.push({
      map: g.map.name,
      ice,
      water,
      lonelyPct: ice ? Math.round((lonely / ice) * 100) : 0,
      icePct: Math.round((ice / Math.max(1, ice + water)) * 100),
      largestSeaPct: Math.round((bestBody / Math.max(1, water)) * 100),
    });
  }
  return out;
});
await browser.close();

for (const r of runs) {
  console.log(`${r.map.padEnd(16)} ice ${String(r.ice).padStart(5)} (${r.icePct}% of the sea)  single-tile floes ${r.lonelyPct}%  largest connected sea ${r.largestSeaPct}% of open water`);
}

const fail = [];
for (const r of runs) {
  if (r.ice > 0 && r.lonelyPct > 25) fail.push(`${r.map}: ${r.lonelyPct}% of floes are single tiles -- that is a sprinkle, not pack ice`);
  if (r.largestSeaPct < 55) fail.push(`${r.map}: the open water is broken into pools (largest is only ${r.largestSeaPct}%)`);
}
if (fail.length) { console.log("FAIL: " + fail.join("; ")); process.exit(1); }
console.log("PASS: ice forms sheets and the sea stays in one piece");
