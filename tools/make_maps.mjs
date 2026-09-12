/**
 * Generate and grade candidate maps, then write the ones worth playing to
 * src/data/maps.ts.
 *
 * A hundred seeds is easy; a hundred seeds that are all PLAYABLE is the work.
 * Every candidate is checked for the things that make a map a waste of ten
 * minutes: starts that cannot reach each other over land, a start with no timber
 * or no gold within reach, no shoreline for a Shipyard, or so little open ground
 * that there is nowhere to build. Anything that fails is discarded and the seed
 * is never seen again.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const KINDS = ["lakeland", "gorge", "highlands", "plains", "islands"];
const WANT = 100;
/** Board edge in tiles. 160 is 6.25x the area of the old 64. */
const SIZE = 160;

const html = readFileSync("dist/index.html", "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setContent(html);
await page.waitForFunction(() => !!window.rts);

const graded = await page.evaluate(({ KINDS, WANT, SIZE }) => {
  const { GameMap, findPath, Tile } = window.rts;
  const W = SIZE, H = SIZE;

  const walkable = (m, x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const t = m.get(x, y);
    return t === Tile.Grass || t === Tile.Dirt;
  };

  /** Tiles of a kind within `r` of a point. */
  const near = (m, cx, cy, tile, r) => {
    let n = 0;
    for (let y = Math.max(0, cy - r); y < Math.min(H, cy + r); y++)
      for (let x = Math.max(0, cx - r); x < Math.min(W, cx + r); x++)
        if (m.get(x, y) === tile) n++;
    return n;
  };

  const grade = (m) => {
    const [a, b] = m.starts;
    // Land route between the two starts. This is the one that matters: without
    // it neither side can ever reach the other and the game cannot be won.
    const path = findPath(m, a.x, a.y, b.x, b.y, "land");
    const end = path[path.length - 1];
    const connected = !!end && Math.abs(end[0] - b.x) <= 2 && Math.abs(end[1] - b.y) <= 2;
    if (!connected) return { ok: false, why: "starts not joined by land" };

    for (const s of m.starts) {
      if (near(m, s.x, s.y, Tile.Tree, 20) < 60) return { ok: false, why: "a start has too little timber" };
      if (near(m, s.x, s.y, Tile.Gold, 14) < 4) return { ok: false, why: "a start has no gold" };
      if (near(m, s.x, s.y, Tile.Water, 30) < 14) return { ok: false, why: "a start has no shoreline" };
    }

    let open = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (walkable(m, x, y)) open++;
    const openFrac = open / (W * H);
    if (openFrac < 0.35) return { ok: false, why: "too little buildable ground" };

    return { ok: true, openFrac, len: path.length, water: near(m, 32, 32, Tile.Water, 32) };
  };

  const out = [];
  const rejected = {};
  // Walk seeds in step across the kinds, so the catalogue is an even mix rather
  // than every easy layout first.
  for (let seed = 1; out.length < WANT && seed < 4000; seed++) {
    for (const kind of KINDS) {
      if (out.length >= WANT) break;
      const m = GameMap.generate(W, H, seed * 7919 + kind.length, kind);
      const g = grade(m);
      if (!g.ok) {
        rejected[g.why] = (rejected[g.why] ?? 0) + 1;
        continue;
      }
      out.push({ kind, seed: seed * 7919 + kind.length, openFrac: +g.openFrac.toFixed(3), len: g.len, water: g.water });
    }
  }
  return { out, rejected };
}, { KINDS, WANT, SIZE });

console.log(`kept ${graded.out.length}, rejected:`, graded.rejected);

// Names, so a map is something you can ask for by name rather than by number.
const FIRST = {
  lakeland: ["Still", "Mirror", "Heron", "Reed", "Otter", "Willow", "Silver", "Marsh", "Pike", "Rush", "Tern", "Alder"],
  gorge: ["Iron", "Cleft", "Grim", "Narrow", "Hollow", "Black", "Sunder", "Deep", "Wolf", "Bitter", "Stone", "Cold"],
  highlands: ["High", "Crag", "Storm", "Eagle", "Bleak", "Granite", "Wind", "Frost", "Raven", "Shale", "Thorn", "Grey"],
  plains: ["Broad", "Golden", "Long", "Open", "Wheat", "Amber", "Wide", "Sun", "Far", "Bright", "Ember", "Fallow"],
  islands: ["Salt", "Gull", "Tide", "Coral", "Storm", "Drift", "Anchor", "Pearl", "Foam", "Mist", "Kelp", "Harbour"],
};
const SECOND = {
  lakeland: ["Water", "Mere", "Basin", "Shallows", "Bend", "Reach", "Pool", "Lake"],
  gorge: ["Gorge", "Pass", "Cut", "Ravine", "Chasm", "Gate", "Defile", "Crossing"],
  highlands: ["Ridge", "Tor", "Bluff", "Scarp", "Heights", "Crest", "Fell", "Moor"],
  plains: ["Fields", "Steppe", "Flats", "Meadow", "Downs", "Expanse", "Plain", "Run"],
  islands: ["Isles", "Sound", "Straits", "Shoals", "Chain", "Reef", "Skerries", "Bay"],
};
const used = new Set();
const rows = graded.out.map((m, i) => {
  const f = FIRST[m.kind];
  const s = SECOND[m.kind];
  let name = "";
  for (let k = 0; k < 200; k++) {
    name = `${f[(i * 5 + k) % f.length]} ${s[(i * 3 + k) % s.length]}`;
    if (!used.has(name)) break;
  }
  used.add(name);
  return { ...m, name };
});

const byKind = {};
for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
console.log("by kind:", byKind);

const body = rows
  .map((r) => `  { id: "${r.kind}-${r.seed}", name: ${JSON.stringify(r.name)}, kind: "${r.kind}", seed: ${r.seed}, size: ${SIZE}, open: ${r.openFrac} },`)
  .join("\n");

writeFileSync(
  "src/data/maps.ts",
  `/**
 * The map catalogue.
 *
 * Generated by tools/make_maps.mjs, which builds candidates across every layout
 * and throws away the ones that are not worth playing: starts with no land route
 * between them, a start short of timber, gold or shoreline, or a board with too
 * little open ground to build on. Only survivors are listed here, so every entry
 * is known-playable rather than merely known-different.
 *
 * Regenerate with: node tools/make_maps.mjs
 */

import type { MapKind } from "../sim/map";

export interface MapDef {
  id: string;
  name: string;
  kind: MapKind;
  seed: number;
  /** Board edge in tiles. */
  size: number;
  /** Fraction of the board that is open ground, as a rough openness rating. */
  open: number;
}

export const MAPS: MapDef[] = [
${body}
];

export const MAP_BY_ID = new Map(MAPS.map((m) => [m.id, m]));

/** Human-readable blurb for a layout, for the map picker. */
export const KIND_BLURB: Record<MapKind, string> = {
  lakeland: "A great lake with rivers running east and west. Open and even.",
  gorge: "A broad river cuts the board, crossed in only a few places.",
  highlands: "Rock ridges everywhere. Armies wind between walls.",
  plains: "Open ground and heavy timber. Fast, and nowhere to hide.",
  islands: "Water is the rule and land the exception. Shorelines everywhere.",
  seas: "Open water, with land in scattered holdings. Naval.",
};
`,
);
console.log("wrote src/data/maps.ts");
await browser.close();
