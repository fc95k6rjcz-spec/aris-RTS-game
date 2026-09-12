/**
 * Terrain painter.
 *
 * The map is baked once into an offscreen canvas at 32 px per tile and blitted
 * each frame, so this can afford to be detailed. Three things do most of the work
 * of making ground look like ground rather than a grid:
 *
 *  - Value noise breaks the flat fill, so no two patches of grass match.
 *  - Terrain edges are dithered across the boundary instead of ending on a tile
 *    line, so dirt and sand blend into grass the way they do on a real map.
 *  - Scatter (tufts, pebbles, flowers) is placed from a hash of the tile
 *    coordinate, so it is dense, varied, and identical on every machine.
 *
 * Everything is deterministic: same map, same picture, no Math.random.
 */

import { Tile } from "../sim/types";
import type { GameMap } from "../sim/map";
import { iceTexture, waterTexture } from "./sprites";

/** Pixels per tile in the baked terrain canvas. */
export const T = 40;

// ───────────────────────────── deterministic noise ─────────────────────────────

function hash2(x: number, y: number, seed = 0): number {
  let h = x * 374761393 + y * 668265263 + seed * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise in tile space. `f` is cells per tile. */
function noise(x: number, y: number, f: number, seed: number): number {
  const px = x * f;
  const py = y * f;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const fx = smooth(px - x0);
  const fy = smooth(py - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** Two octaves, enough variation without looking noisy. */
function fbm(x: number, y: number, seed: number): number {
  return noise(x, y, 0.18, seed) * 0.65 + noise(x, y, 0.7, seed + 91) * 0.35;
}

// ───────────────────────────── palettes ─────────────────────────────

const GRASS = ["#375f26", "#3f6b2c", "#487733", "#508139", "#598c40"];
const DIRT = ["#4e3f27", "#5a482c", "#655132", "#705b39"];
const ROCKC = ["#5a5a5c", "#666668", "#727275", "#7e7e82"];

function pick(list: string[], v: number): string {
  return list[Math.min(list.length - 1, Math.max(0, Math.floor(v * list.length)))]!;
}

// ───────────────────────────── painters ─────────────────────────────

function paintGround(c: CanvasRenderingContext2D, map: GameMap, x: number, y: number, seed: number, disguised = false): void {
  const raw = map.get(x, y);
  // A gold tile is drawn as ordinary ground: the mine sprite brings its own rocky
  // base, and painting rock underneath left a grey square poking out around it.
  const t = disguised || raw === Tile.Gold ? Tile.Grass : raw;
  const base = t === Tile.Dirt ? DIRT : t === Tile.Rock ? ROCKC : GRASS;
  // Paint at quarter-tile resolution so the noise reads inside a single tile.
  const q = T / 4;
  for (let sy = 0; sy < 4; sy++)
    for (let sx = 0; sx < 4; sx++) {
      const n = fbm(x + sx / 4, y + sy / 4, seed);
      c.fillStyle = pick(base, n);
      c.fillRect(x * T + sx * q, y * T + sy * q, q + 1, q + 1);
    }
}

/**
 * Dither one tile's material a little way into its neighbours, so a dirt patch
 * ends in a ragged edge rather than on the tile boundary. Called for every tile
 * whose neighbour differs, after the base ground is down.
 */
function blendEdges(c: CanvasRenderingContext2D, map: GameMap, x: number, y: number, seed: number): void {
  const here = map.get(x, y);
  if (here === Tile.Water) return;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = x + dx;
    const ny = y + dy;
    if (!map.inBounds(nx, ny)) continue;
    const there = map.get(nx, ny);
    if (there === here || there === Tile.Water) continue;
    const pal = there === Tile.Dirt ? DIRT : there === Tile.Rock ? ROCKC : GRASS;
    // Sprinkle the neighbour's material into a strip along the shared edge, with
    // density falling off across it.
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < T; j += 2) {
        const depth = i / steps;
        if (hash2(x * 71 + i * 13 + j, y * 37 + i * 7, seed) > 0.75 - depth * 0.7) continue;
        const px = dx === 0 ? x * T + j : dx > 0 ? (x + 1) * T - 1 - i : x * T + i;
        const py = dy === 0 ? y * T + j : dy > 0 ? (y + 1) * T - 1 - i : y * T + i;
        c.fillStyle = pick(pal, fbm(nx + (j / T) * 0.5, ny + (i / T) * 0.5, seed));
        c.fillRect(px, py, 2, 2);
      }
    }
  }
}

function paintScatter(c: CanvasRenderingContext2D, map: GameMap, x: number, y: number, seed: number): void {
  const t = map.get(x, y);
  if (t !== Tile.Grass && t !== Tile.Dirt) return;
  const n = Math.floor(hash2(x, y, seed + 5) * 5);
  for (let i = 0; i < n; i++) {
    const hx = hash2(x * 13 + i, y * 29, seed + i);
    const hy = hash2(x * 31 + i, y * 17, seed + i + 3);
    const px = x * T + hx * (T - 4) + 2;
    const py = y * T + hy * (T - 4) + 2;
    const kind = hash2(x + i, y + i, seed + 11);
    if (t === Tile.Grass && kind > 0.82) {
      // Wildflower.
      c.fillStyle = kind > 0.94 ? "#e8dc7a" : "#d9d2e8";
      c.fillRect(px, py, 2, 2);
    } else if (t === Tile.Grass && kind > 0.4) {
      // Grass tuft: two blades with a darker root.
      c.strokeStyle = "rgba(30,60,20,0.5)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(px, py + 3);
      c.lineTo(px + 1, py);
      c.moveTo(px + 2, py + 3);
      c.lineTo(px + 3, py + 1);
      c.stroke();
      c.strokeStyle = "rgba(150,200,110,0.45)";
      c.beginPath();
      c.moveTo(px + 1, py + 3);
      c.lineTo(px + 2, py);
      c.stroke();
    } else {
      // Pebble with a lit top and a shadow.
      c.fillStyle = "rgba(0,0,0,0.22)";
      c.fillRect(px, py + 2, 3, 1);
      c.fillStyle = kind > 0.2 ? "#8a8578" : "#6f6a60";
      c.fillRect(px, py, 3, 2);
    }
  }
}

// Kept for reference: the procedural tree the painted sprite replaced.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function paintTree(c: CanvasRenderingContext2D, x: number, y: number, seed: number): void {
  const cx = x * T + T / 2;
  const cy = y * T + T / 2;
  const r = T * (0.36 + hash2(x, y, seed) * 0.12);
  const lean = (hash2(x, y, seed + 2) - 0.5) * T * 0.12;

  // Ground shadow, offset to match the buildings' lower-right light.
  c.fillStyle = "rgba(0,0,0,0.3)";
  c.beginPath();
  c.ellipse(cx + r * 0.35, cy + r * 0.55, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
  c.fill();

  // Trunk.
  c.strokeStyle = "#4a3320";
  c.lineWidth = Math.max(2, T * 0.07);
  c.beginPath();
  c.moveTo(cx, cy + r * 0.5);
  c.lineTo(cx + lean, cy - r * 0.1);
  c.stroke();

  // Canopy: three overlapping blobs, dark to light, so it reads as a mass.
  const blobs: Array<[number, number, number, string]> = [
    [lean - r * 0.35, -r * 0.15, r * 0.7, "#24471d"],
    [lean + r * 0.3, -r * 0.05, r * 0.62, "#2c5624"],
    [lean - r * 0.05, -r * 0.5, r * 0.6, "#35662a"],
  ];
  for (const [ox, oy, br, col] of blobs) {
    c.fillStyle = col;
    c.beginPath();
    c.arc(cx + ox, cy + oy, br, 0, Math.PI * 2);
    c.fill();
  }
  // Sun-side highlight.
  c.fillStyle = "rgba(126,178,84,0.75)";
  c.beginPath();
  c.arc(cx + lean - r * 0.3, cy - r * 0.55, r * 0.3, 0, Math.PI * 2);
  c.fill();
}

// Kept for reference: the procedural ore mound the painted mine sprite replaced.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function paintGoldVein(c: CanvasRenderingContext2D, x: number, y: number, seed: number): void {
  const cx = x * T + T / 2;
  const cy = y * T + T / 2;
  // Rock mound.
  c.fillStyle = "rgba(0,0,0,0.28)";
  c.beginPath();
  c.ellipse(cx + 2, cy + 3, T * 0.46, T * 0.34, 0, 0, Math.PI * 2);
  c.fill();
  for (const [r, col] of [[0.48, "#544a38"], [0.4, "#6b5f45"], [0.28, "#7d7050"]] as const) {
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(cx - T * 0.03, cy - T * 0.04, T * r, T * r * 0.78, 0, 0, Math.PI * 2);
    c.fill();
  }
  // Ore: a few irregular nuggets with a highlight, not a grid of squares.
  for (let i = 0; i < 5; i++) {
    const a = hash2(x * 7 + i, y * 11, seed) * Math.PI * 2;
    const d = 0.1 + hash2(x + i, y + i, seed + 4) * 0.28;
    const px = cx + Math.cos(a) * T * d;
    const py = cy + Math.sin(a) * T * d * 0.8;
    const s = T * (0.05 + hash2(x + i * 3, y, seed + 8) * 0.05);
    c.fillStyle = "#b8912a";
    c.beginPath();
    c.ellipse(px, py, s, s * 0.8, a, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#f2d264";
    c.beginPath();
    c.ellipse(px - s * 0.25, py - s * 0.25, s * 0.45, s * 0.35, a, 0, Math.PI * 2);
    c.fill();
  }
}

function paintRock(c: CanvasRenderingContext2D, x: number, y: number, seed: number): void {
  const cx = x * T + T / 2;
  const cy = y * T + T / 2;
  c.fillStyle = "rgba(0,0,0,0.28)";
  c.beginPath();
  c.ellipse(cx + 2, cy + 3, T * 0.42, T * 0.3, 0, 0, Math.PI * 2);
  c.fill();
  for (let i = 0; i < 3; i++) {
    const ox = (hash2(x + i, y, seed) - 0.5) * T * 0.4;
    const oy = (hash2(x, y + i, seed + 1) - 0.5) * T * 0.3;
    const s = T * (0.18 + hash2(x + i, y + i, seed + 2) * 0.14);
    c.fillStyle = "#5f5f62";
    c.beginPath();
    c.moveTo(cx + ox - s, cy + oy + s * 0.6);
    c.lineTo(cx + ox - s * 0.4, cy + oy - s * 0.7);
    c.lineTo(cx + ox + s * 0.6, cy + oy - s * 0.4);
    c.lineTo(cx + ox + s, cy + oy + s * 0.6);
    c.closePath();
    c.fill();
    c.fillStyle = "#83838a";
    c.beginPath();
    c.moveTo(cx + ox - s * 0.4, cy + oy - s * 0.7);
    c.lineTo(cx + ox + s * 0.6, cy + oy - s * 0.4);
    c.lineTo(cx + ox, cy + oy);
    c.closePath();
    c.fill();
  }
}

/**
 * Pack ice: a pale slab with a wet rim and a few pressure cracks.
 *
 * Drawn from the tile's own hash, so a floe is the same every time the chunk is
 * re-baked and neighbouring tiles do not repeat. The rim matters more than the
 * surface: what the player needs to read at a glance is where the ice ends and
 * the water begins, because that edge is where the fleet has to stop.
 */
function paintIce(c: CanvasRenderingContext2D, map: GameMap, x: number, y: number, seed: number, pat: CanvasPattern | null = null): void {
  if (pat) {
    c.save();
    c.fillStyle = pat;
    c.fillRect(x * T, y * T, T, T);
    c.restore();
    // The rim still gets drawn below: where the floe ends is the thing the
    // player has to read, and a photograph does not know where the tile stops.
  }
  const px = x * T;
  const py = y * T;
  const h = hash2(x, y, seed + 77);
  if (!pat) {
    c.fillStyle = `hsl(197, ${16 + h * 10}%, ${80 + h * 8}%)`;
    c.fillRect(px, py, T, T);
  }
  // Meltwater where the floe meets open sea.
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    if (!map.inBounds(x + dx, y + dy) || map.get(x + dx, y + dy) !== Tile.Water) continue;
    c.fillStyle = "rgba(120,170,205,0.55)";
    c.fillRect(px + (dx > 0 ? T - T * 0.16 : 0), py + (dy > 0 ? T - T * 0.16 : 0), dx !== 0 ? T * 0.16 : T, dy !== 0 ? T * 0.16 : T);
  }
  // Pressure ridges.
  c.strokeStyle = "rgba(150,180,200,0.5)";
  c.lineWidth = Math.max(1, T * 0.03);
  for (let i = 0; i < 2; i++) {
    const a = hash2(x, y, seed + i * 31) * Math.PI;
    const cx = px + T * (0.25 + hash2(x, y, seed + i * 13) * 0.5);
    const cy = py + T * (0.25 + hash2(x, y, seed + i * 17) * 0.5);
    const r = T * (0.2 + hash2(x, y, seed + i * 19) * 0.3);
    c.beginPath();
    c.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r);
    c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    c.stroke();
  }
}

function paintWater(c: CanvasRenderingContext2D, map: GameMap, x: number, y: number, seed: number, pat: CanvasPattern | null = null): void {
  // With a photograph to hand, lay it down first and let the painted detail
  // below add depth and shoreline shading over the top. Without one, the painted
  // version alone still holds up -- which is why it is still here.
  // Depth: water next to land is shallow and lighter. Ice does not count -- a
  // floe is floating on the same sea, and treating it as a shore turned every
  // water tile beside the pack pale, which read as a chequerboard.
  let land = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
    if (!map.inBounds(x + dx, y + dy)) continue;
    const n = map.get(x + dx, y + dy);
    if (n !== Tile.Water && n !== Tile.Ice) land++;
  }
  const shallow = land > 0;
  if (pat) {
    // The photograph is the water. All the painting does over the top is the one
    // thing a photograph cannot know: where the bottom comes up. Laying the
    // painted quads on top as well, as the first attempt did, buried the
    // picture completely and the sea looked exactly as it had before.
    c.save();
    c.fillStyle = pat;
    c.fillRect(x * T, y * T, T, T);
    c.fillStyle = "rgba(16,48,96,0.28)";
    c.fillRect(x * T, y * T, T, T);
    // Shallows are drawn as a band on the sides that actually face the shore,
    // faded outward, rather than as a flat wash over the whole tile: a tile-wide
    // wash puts a hard square edge in the middle of open water.
    if (shallow)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n = map.inBounds(x + dx, y + dy) ? map.get(x + dx, y + dy) : Tile.Grass;
        if (n === Tile.Water || n === Tile.Ice) continue;
        const gx0 = x * T + (dx > 0 ? T : 0);
        const gy0 = y * T + (dy > 0 ? T : 0);
        const grad = c.createLinearGradient(gx0, gy0, gx0 - dx * T * 0.7, gy0 - dy * T * 0.7);
        grad.addColorStop(0, "rgba(120,185,205,0.45)");
        grad.addColorStop(1, "rgba(120,185,205,0)");
        c.fillStyle = grad;
        c.fillRect(x * T, y * T, T, T);
      }
    c.restore();
    return;
  }
  const q = T / 4;
  for (let sy = 0; sy < 4; sy++)
    for (let sx = 0; sx < 4; sx++) {
      const n = fbm(x + sx / 4, y + sy / 4, seed + 40);
      const deep = shallow ? 0.35 + n * 0.2 : 0.05 + n * 0.25;
      const r = Math.round(28 + deep * 60);
      const g = Math.round(74 + deep * 80);
      const b = Math.round(130 + deep * 60);
      c.fillStyle = `rgb(${r},${g},${b})`;
      c.fillRect(x * T + sx * q, y * T + sy * q, q + 1, q + 1);
    }
  // Ripples.
  c.strokeStyle = "rgba(255,255,255,0.16)";
  c.lineWidth = 1;
  for (let i = 0; i < 2; i++) {
    const ry = y * T + 6 + i * 12 + hash2(x, y + i, seed) * 6;
    const rx = x * T + 3 + hash2(x + i, y, seed) * 8;
    c.beginPath();
    c.moveTo(rx, ry);
    c.quadraticCurveTo(rx + 6, ry - 2, rx + 12, ry);
    c.stroke();
  }
}

/**
 * Foam where water meets land, drawn on the water side of the boundary.
 *
 * This used to be a scatter of 2x2 white squares, which at close zoom read as a
 * crust of dirty snow round every lake rather than as surf. It is a gradient
 * now -- bright against the sand and gone within two-thirds of a tile -- with a
 * broken line riding on top of it so the edge is not a perfect ruler-straight
 * band. Corners get a smaller wash of their own, which is what stops a bay from
 * looking like it was cut out with scissors.
 */
function paintShore(c: CanvasRenderingContext2D, map: GameMap, x: number, y: number, seed: number): void {
  if (map.get(x, y) !== Tile.Water) return;
  const px = x * T;
  const py = y * T;
  c.save();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = x + dx;
    const ny = y + dy;
    if (!map.inBounds(nx, ny) || map.get(nx, ny) === Tile.Water) continue;

    // From the shared edge inward, fading out.
    const ex = px + (dx > 0 ? T : 0);
    const ey = py + (dy > 0 ? T : 0);
    const grad = c.createLinearGradient(ex, ey, ex - dx * T * 0.62, ey - dy * T * 0.62);
    grad.addColorStop(0, "rgba(232,244,252,0.72)");
    grad.addColorStop(0.35, "rgba(214,236,248,0.3)");
    grad.addColorStop(1, "rgba(200,230,245,0)");
    c.fillStyle = grad;
    c.fillRect(px, py, T, T);

    // A broken line of surf a short way off the sand, wobbling along the edge
    // so the boundary is not a straight rule.
    c.strokeStyle = "rgba(255,255,255,0.5)";
    c.lineWidth = Math.max(1, T * 0.045);
    c.beginPath();
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const wob = (hash2(x * 17 + i, y * 31, seed) - 0.5) * T * 0.13;
      const off = T * 0.16 + wob;
      const ax = dx === 0 ? px + t * T : ex - dx * off;
      const ay = dy === 0 ? py + t * T : ey - dy * off;
      if (i === 0) c.moveTo(ax, ay);
      else c.lineTo(ax, ay);
    }
    c.stroke();
  }
  c.restore();
}

// ───────────────────────────── entry point ─────────────────────────────

/**
 * Bake the whole map. Order matters: ground, then edge blending, then scatter,
 * then the things that stand up off the ground (trees, rocks, ore) so their
 * shadows fall over the detail rather than under it.
 */
/**
 * Build a repeating grass fill from the photographic texture.
 *
 * The texture is mirrored into a 2x2 block before repeating, which hides the seam
 * where copies meet — a photograph never tiles cleanly on its own. One texture
 * covers two map tiles, so blades stay legible instead of mushing together.
 */
/**
 * A repeating fill from a photograph, with the seam blended out instead of
 * mirrored away.
 *
 * The sea had a choice of two bad options. Mirroring hides the join but turns
 * every wave into a butterfly, so the sea was left on a plain repeat -- which
 * put a hard vertical and horizontal line through the water every few tiles,
 * and once you have seen it you cannot stop seeing it.
 *
 * This is the third option. The cell is drawn, then a half-offset copy of
 * itself is laid over the top, feathered to nothing at its own edges. The
 * offset copy's solid middle sits exactly where the original's seams were and
 * covers them; the offset copy's own edges are transparent by the time they
 * reach the cell boundary, so they add no seam of their own. Nothing is
 * mirrored, so a wave stays a wave.
 */
function blendedPattern(c: CanvasRenderingContext2D, img: HTMLImageElement, tiles: number): CanvasPattern | null {
  const cell = T * tiles;
  const base = document.createElement("canvas");
  base.width = cell;
  base.height = cell;
  const b = base.getContext("2d")!;
  b.drawImage(img, 0, 0, cell, cell);

  // The same picture, faded out towards all four of its edges.
  const soft = document.createElement("canvas");
  soft.width = cell;
  soft.height = cell;
  const o = soft.getContext("2d")!;
  o.drawImage(img, 0, 0, cell, cell);
  o.globalCompositeOperation = "destination-in";
  const feather = Math.round(cell * 0.28);
  for (const horizontal of [true, false]) {
    const g = horizontal ? o.createLinearGradient(0, 0, cell, 0) : o.createLinearGradient(0, 0, 0, cell);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(feather / cell, "rgba(0,0,0,1)");
    g.addColorStop(1 - feather / cell, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    o.fillStyle = g;
    o.fillRect(0, 0, cell, cell);
  }

  // Four placements, so the overlay wraps round the cell rather than stopping
  // at its edge.
  b.globalCompositeOperation = "source-over";
  const half = cell / 2;
  for (const dx of [-half, half]) for (const dy of [-half, half]) b.drawImage(soft, dx, dy);
  return c.createPattern(base, "repeat");
}

function grassPattern(c: CanvasRenderingContext2D, img: HTMLImageElement, tiles = 2, mirror = true): CanvasPattern | null {
  const cell = T * tiles;
  if (!mirror) {
    // Plain repeat. Mirroring hides a seam, but it also builds a butterfly out
    // of whatever is in the picture, and on pack ice that read as a kaleidoscope
    // rather than as floes. Grass is fine-grained enough to get away with the
    // trick; sea and ice are not.
    const one = document.createElement("canvas");
    one.width = cell;
    one.height = cell;
    one.getContext("2d")!.drawImage(img, 0, 0, cell, cell);
    return c.createPattern(one, "repeat");
  }
  const block = document.createElement("canvas");
  block.width = cell * 2;
  block.height = cell * 2;
  const b = block.getContext("2d")!;
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      b.save();
      b.translate((x + (x ? 1 : 0)) * cell, (y + (y ? 1 : 0)) * cell);
      b.scale(x ? -1 : 1, y ? -1 : 1);
      b.drawImage(img, 0, 0, cell, cell);
      b.restore();
    }
  return c.createPattern(block, "repeat");
}

/** Tiles per side of a near-detail terrain chunk. */
export const CHUNK = 16;

/** Pixels per tile in the zoomed-out bake. Coarse on purpose: see bakeRegion. */
export const T_FAR = 20;

/**
 * Bake one rectangle of the map into its own canvas.
 *
 * The map used to be baked whole, at 40 px a tile. That was fine at 64x64 and a
 * disaster at 160x160: a 6400x6400 canvas is 41 megapixels and about 160 MB of
 * image memory, and every frame asked the browser to high-quality-downscale a
 * multi-thousand-pixel slice of it. That is what the stutter was.
 *
 * So the bake is done in pieces instead. Painting is unchanged -- the painters
 * still work in whole-map tile coordinates -- and the region is selected purely
 * with a transform: scale for the resolution, translate so the requested tile
 * lands at the canvas origin. A one-tile margin is painted past every edge,
 * because edge blending, scatter and rocks all spill over a tile line and would
 * otherwise leave a visible seam down every chunk boundary.
 *
 * @param px pixels per tile; T for near detail, T_FAR for the zoomed-out copy.
 */
export function bakeRegion(
  map: GameMap,
  tx: number,
  ty: number,
  tw: number,
  th: number,
  px: number,
  seed = 1337,
  grass?: HTMLImageElement | null,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(tw * px));
  canvas.height = Math.max(1, Math.round(th * px));
  const c = canvas.getContext("2d")!;
  c.scale(px / T, px / T);
  c.translate(-tx * T, -ty * T);

  const x0 = Math.max(0, tx - 1);
  const y0 = Math.max(0, ty - 1);
  const x1 = Math.min(map.width - 1, tx + tw);
  const y1 = Math.min(map.height - 1, ty + th);

  // Lay continuous grass across the region first, then paint the tiles that are
  // not grass over the top. The pattern is drawn through the same transform, so
  // its phase follows world coordinates and neighbouring chunks line up.
  const pattern = grass ? grassPattern(c, grass) : null;
  // One texture covers two map tiles for grass; water and ice get three, because
  // a wave or a floe is a bigger thing than a blade of grass and repeating them
  // every two tiles reads as wallpaper.
  const waterImg = waterTexture();
  const iceImg = iceTexture();
  // Six tiles rather than four, and blended rather than plainly repeated: a
  // bigger cell means the eye has further to go before it finds the repeat.
  const waterPat = waterImg ? blendedPattern(c, waterImg, 6) : null;
  const icePat = iceImg ? blendedPattern(c, iceImg, 5) : null;
  if (pattern) {
    c.fillStyle = pattern;
    c.fillRect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
  }

  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const t = map.get(x, y);
      if (t === Tile.Water) paintWater(c, map, x, y, seed, waterPat);
      else if (t === Tile.Ice) paintIce(c, map, x, y, seed, icePat);
      else if (!pattern) paintGround(c, map, x, y, seed, map.isHidden(x, y));
      else if (t === Tile.Dirt || t === Tile.Rock) {
        // Wash the grass rather than replacing it, so a dirt patch keeps the
        // blade texture and reads as worn ground instead of a flat sticker.
        const wash = t === Tile.Dirt ? "rgba(96,74,44,0.82)" : "rgba(96,96,100,0.86)";
        c.fillStyle = wash;
        c.fillRect(x * T, y * T, T, T);
      }
    }

  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      blendEdges(c, map, x, y, seed);
      paintShore(c, map, x, y, seed);
    }

  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) paintScatter(c, map, x, y, seed);

  // Standing features last, top to bottom so nearer canopies overlap further ones.
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      // A hidden tile keeps its real type in the simulation but is drawn as the
      // plain ground already laid down, so nothing gives its position away.
      if (map.isHidden(x, y)) continue;
      // Trees and mines are sprites drawn by the renderer, so that felling a tree
      // or mining out a seam shows immediately without re-baking the whole map.
      if (map.get(x, y) === Tile.Rock) paintRock(c, x, y, seed);
    }

  return canvas;
}

/** The whole map in one canvas. Kept for tools and tests; the game uses chunks. */
export function bakeTerrain(map: GameMap, seed = 1337, grass?: HTMLImageElement | null): HTMLCanvasElement {
  return bakeRegion(map, 0, 0, map.width, map.height, T, seed, grass);
}
