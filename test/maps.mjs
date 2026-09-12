import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.rts);

// Every map in the catalogue must still pass the bar it was selected against.
// The generator graded them once; this re-checks them against the code as it
// stands, so a change to terrain generation cannot quietly break the catalogue.
const maps = JSON.parse(readFileSync("src/data/maps.ts", "utf8").match(/export const MAPS: MapDef\[\] = \[([\s\S]*?)\n\];/)[1]
  .trim().split("\n").map((l) => l.trim().replace(/,$/, "").replace(/(\w+):/g, '"$1":')).join(",").replace(/^/, "[").replace(/$/, "]"));

const bad = await page.evaluate((maps) => {
  const { GameMap, findPath, Tile } = window.rts;
  const W = 64, H = 64;
  const near = (m, cx, cy, tile, r) => {
    let n = 0;
    for (let y = Math.max(0, cy - r); y < Math.min(H, cy + r); y++)
      for (let x = Math.max(0, cx - r); x < Math.min(W, cx + r); x++) if (m.get(x, y) === tile) n++;
    return n;
  };
  const bad = [];
  for (const def of maps) {
    const m = GameMap.generate(W, H, def.seed, def.kind);
    const [a, b] = m.starts;
    const path = findPath(m, a.x, a.y, b.x, b.y, "land");
    const end = path[path.length - 1];
    if (!end || Math.abs(end[0] - b.x) > 2 || Math.abs(end[1] - b.y) > 2) { bad.push(`${def.name}: no land route`); continue; }
    for (const s of m.starts) {
      if (near(m, s.x, s.y, Tile.Tree, 16) < 40) bad.push(`${def.name}: no timber`);
      else if (near(m, s.x, s.y, Tile.Gold, 14) < 4) bad.push(`${def.name}: no gold`);
      else if (near(m, s.x, s.y, Tile.Water, 22) < 12) bad.push(`${def.name}: no shoreline`);
    }
  }
  return bad;
}, maps);

console.log(`audited ${maps.length} maps; ${bad.length} failed`);
if (bad.length) throw new Error(bad.slice(0, 8).join("\n"));

// Names must be unique, or the picker shows two of the same thing.
const names = new Set(maps.map((m) => m.name));
console.log(`${names.size} distinct names across ${new Set(maps.map((m) => m.kind)).size} layouts`);
if (names.size !== maps.length) throw new Error("duplicate map names");

// A look at one of each layout.
const shots = [];
for (const kind of ["lakeland", "gorge", "highlands", "plains", "islands"]) {
  const def = maps.find((m) => m.kind === kind);
  await page.evaluate((id) => { window.game.settingsForTest.mapId = id; window.game.start("none"); window.game.cam.zoom = 16; window.game.cam.centerOn(32 * 64, 32 * 64); window.game.paused = true; }, def.id);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `/tmp/map-${kind}.png`, clip: { x: 0, y: 0, width: 1100, height: 510 } });
  shots.push(`${kind}: ${def.name}`);
}
console.log(shots.join(" | "));
await browser.close();
