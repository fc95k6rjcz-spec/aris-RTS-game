import { Tile } from "./types";
import { Rng } from "./rng";
import type { EntityId } from "./types";
import type { Domain } from "../data/units";

/** The layouts a map can be generated in. */
export type MapKind = "lakeland" | "gorge" | "highlands" | "plains" | "islands" | "seas";

/**
 * What each layout means, as numbers the generator reads.
 *
 * Every kind keeps some water, because a Shipyard needs a shoreline and a map
 * with none quietly removes a third of the building list. Every kind keeps its
 * halves joined by land, because an army that cannot reach the enemy is not a
 * map, it is a stalemate -- which is exactly what an early build shipped before
 * fords existed.
 */
interface Shape {
  lakeRadius: number;
  rivers: number;
  riverWidth: number;
  fords: number;
  ponds: number;
  ridges: number;
  forestClumps: number;
}

const SHAPES: Record<MapKind, Shape> = {
  /** The original: a great lake with rivers east and west. Open, watery, fair. */
  lakeland: { lakeRadius: 7, rivers: 2, riverWidth: 2, fords: 2, ponds: 0, ridges: 0, forestClumps: 14 },
  /** One broad river cutting the map, crossed in three places. Chokepoint play. */
  gorge: { lakeRadius: 4, rivers: 2, riverWidth: 4, fords: 3, ponds: 1, ridges: 2, forestClumps: 10 },
  /** Rock ridges everywhere and little water. Ground armies wind between walls. */
  highlands: { lakeRadius: 3, rivers: 1, riverWidth: 2, fords: 2, ponds: 3, ridges: 7, forestClumps: 16 },
  /** Open ground and heavy timber. Fast, bloody, nowhere to hide. */
  plains: { lakeRadius: 4, rivers: 1, riverWidth: 2, fords: 3, ponds: 2, ridges: 0, forestClumps: 22 },
  /** A huge lake and long rivers: land is the exception, shorelines everywhere. */
  islands: { lakeRadius: 12, rivers: 4, riverWidth: 3, fords: 3, ponds: 4, ridges: 1, forestClumps: 12 },
  /**
   * Mostly water. An experiment: see the note in tools/make_maps.mjs about what
   * this needs before it is a game rather than a stalemate.
   */
  seas: { lakeRadius: 20, rivers: 6, riverWidth: 4, fords: 0, ponds: 8, ridges: 0, forestClumps: 8 },
};

/**
 * How much of each layout's open water is frozen. Dry maps have none: a floe in
 * the middle of a pond is scenery, not a decision.
 */
const ICE_COVER: Partial<Record<MapKind, number>> = {
  lakeland: 0.18,
  gorge: 0.12,
  islands: 0.3,
  seas: 0.42,
};

/**
 * Tile grid with an occupancy layer. Buildings and resource nodes reserve tiles;
 * units are free-moving but path around blocked tiles.
 */
export class GameMap {
  readonly tiles: Uint8Array;
  /** Entity occupying each tile (0 = none). Buildings and resource nodes only. */
  readonly occupant: Int32Array;
  /** Remaining resource amount per tile for tree/gold tiles. */
  readonly amount: Int32Array;
  /**
   * Tiles where a tree once stood and has been cut down (1 = stump).
   *
   * Felling turns the tile back into plain grass so units and buildings can use
   * it, which left no trace at all: a worker could chop all morning and the wood
   * looked untouched, then a tree would vanish between frames. The stump is the
   * receipt. It is cosmetic -- nothing in the simulation reads it.
   */
  readonly felled: Uint8Array;
  /**
   * How worn each tile is, 0 to 255: the path people have beaten into it.
   *
   * Feet wear ground down. A tile that gets walked over repeatedly becomes a
   * track, and a track is easier going than raw grass, so the route your
   * workers actually use gets quicker the more they use it. It is the one piece
   * of terrain in the game the player shapes without deciding to -- the paths
   * between your hall, your wood and your mine draw themselves, and where they
   * run tells you what your economy has been doing.
   *
   * Part of the simulation, not the picture: it changes how fast units move, so
   * both machines in a network game must agree about it to the byte.
   */
  readonly wear: Uint8Array;
  /** Bumped whenever a tile type changes, so renderers can invalidate caches. */
  version = 0;
  /**
   * Tiles changed since a renderer last drained the list.
   *
   * The version number alone says only "something changed", and the renderer's
   * answer to that used to be to rebuild every baked canvas -- which meant that
   * felling a single tree re-painted the whole map. Knowing which tiles moved
   * lets it repaint a few squares instead. If the list ever runs away, the flag
   * says so and the caller falls back to a full rebuild.
   */
  readonly touched = new Set<number>();
  touchedOverflow = false;
  /**
   * Tiles that hold something not yet discovered. A hidden tile behaves as its
   * real type for the simulation but is drawn as plain ground until a unit walks
   * close enough to find it.
   */
  readonly hidden: Uint8Array;
  /** Centre of the buried seam, for the discovery check. */
  secret: { x: number; y: number; found: boolean } | null = null;
  /**
   * Where players begin, in tile coordinates, in player order. The generator
   * decides these rather than the game hard-coding two corners, so a map can
   * seat more than two and each layout can put them where it makes sense.
   */
  starts: Array<{ x: number; y: number }> = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.tiles = new Uint8Array(width * height);
    this.occupant = new Int32Array(width * height);
    this.amount = new Int32Array(width * height);
    this.felled = new Uint8Array(width * height);
    this.wear = new Uint8Array(width * height);
    this.hidden = new Uint8Array(width * height);
  }

  /**
   * Gold tiles grouped into seams (connected clusters), so a mine is drawn once
   * over the whole deposit rather than once per tile. Recomputed when the map
   * changes — a seam disappears as its last tile is mined out.
   */
  private seamCache: { version: number; seams: Array<{ x0: number; y0: number; x1: number; y1: number }> } | null = null;

  goldSeams(): Array<{ x0: number; y0: number; x1: number; y1: number }> {
    if (this.seamCache && this.seamCache.version === this.version) return this.seamCache.seams;
    const seen = new Uint8Array(this.width * this.height);
    const seams: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        const i = this.idx(x, y);
        if (seen[i] || this.get(x, y) !== Tile.Gold || this.hidden[i] === 1) continue;
        const stack: Array<[number, number]> = [[x, y]];
        seen[i] = 1;
        let x0 = x, y0 = y, x1 = x, y1 = y;
        while (stack.length) {
          const [cx, cy] = stack.pop()!;
          x0 = Math.min(x0, cx); y0 = Math.min(y0, cy);
          x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = cx + dx, ny = cy + dy;
            if (!this.inBounds(nx, ny)) continue;
            const ni = this.idx(nx, ny);
            if (seen[ni] || this.get(nx, ny) !== Tile.Gold || this.hidden[ni] === 1) continue;
            seen[ni] = 1;
            stack.push([nx, ny]);
          }
        }
        seams.push({ x0, y0, x1, y1 });
      }
    this.seamCache = { version: this.version, seams };
    return seams;
  }

  isHidden(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.hidden[this.idx(x, y)] === 1;
  }

  /** Reveal the buried seam. Returns true the first time it is found. */
  revealSecret(): boolean {
    if (!this.secret || this.secret.found) return false;
    this.secret.found = true;
    for (let i = 0; i < this.hidden.length; i++) this.hidden[i] = 0;
    this.version++;
    this.touchedOverflow = true;
    return true;
  }

  /**
   * Connected-component labels for one movement domain, rebuilt when the ground
   * changes. Two walkable tiles with different labels have no route between
   * them, whatever the pathfinder would have discovered the slow way.
   */
  private regionCache = new Map<string, { version: number; label: Int32Array }>();

  private regions(domain: Domain): Int32Array {
    const hit = this.regionCache.get(domain);
    if (hit && hit.version === this.version) return hit.label;
    const label = new Int32Array(this.width * this.height).fill(-1);
    let next = 0;
    const stack: number[] = [];
    for (let i = 0; i < label.length; i++) {
      if (label[i] !== -1) continue;
      const sx = i % this.width;
      const sy = (i / this.width) | 0;
      if (!this.isWalkable(sx, sy, domain)) continue;
      const id = next++;
      label[i] = id;
      stack.push(i);
      while (stack.length) {
        const k = stack.pop()!;
        const x = k % this.width;
        const y = (k / this.width) | 0;
        // Four-way, not eight: a diagonal between two blocked corners is not a
        // step a unit can take, and treating it as one would join regions that
        // are not really joined.
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
          const n = ny * this.width + nx;
          if (label[n] !== -1 || !this.isWalkable(nx, ny, domain)) continue;
          label[n] = id;
          stack.push(n);
        }
      }
    }
    this.regionCache.set(domain, { version: this.version, label });
    return label;
  }

  /** Whether two walkable tiles have any route between them at all. */
  connected(sx: number, sy: number, gx: number, gy: number, domain: Domain = "land"): boolean {
    if (!this.inBounds(sx, sy) || !this.inBounds(gx, gy)) return false;
    const label = this.regions(domain);
    const a = label[this.idx(sx, sy)]!;
    return a >= 0 && a === label[this.idx(gx, gy)]!;
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }
  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }
  get(x: number, y: number): Tile {
    return this.tiles[this.idx(x, y)] as Tile;
  }
  set(x: number, y: number, t: Tile): void {
    this.tiles[this.idx(x, y)] = t;
    this.version++;
    if (this.touched.size > 4096) this.touchedOverflow = true;
    else this.touched.add(this.idx(x, y));
  }

  /** Take the list of changed tiles and reset it. */
  drainTouched(): { tiles: number[]; all: boolean } {
    const out = { tiles: [...this.touched], all: this.touchedOverflow };
    this.touched.clear();
    this.touchedOverflow = false;
    return out;
  }

  /** Land units walk grass/dirt; sea units sail water; aircraft ignore the ground. */
  isWalkable(x: number, y: number, domain: Domain = "land"): boolean {
    if (!this.inBounds(x, y)) return false;
    if (domain === "air") return true;
    const t = this.get(x, y);
    if (domain === "amphibious") {
      // Woodland is passable, slowly, exactly as it is for a land unit. It used
      // to be a wall here and nowhere else, which made a peasant the only thing
      // on the field that a tree could stop -- so in the crowning opening, with
      // a stockade of forest around every base, the one man the whole match
      // waits on was the one man who could not walk out of it. The King could.
      // The speed penalty in World.followPath already covers both domains.
      if (t === Tile.Gold || t === Tile.Rock) return false;
      return this.occupant[this.idx(x, y)] === 0;
    }
    if (domain === "sea") return t === Tile.Water && this.occupant[this.idx(x, y)] === 0;
    if (domain === "icebreaker") {
      // Open water, pack ice, and the beach itself -- but no further. She can
      // put her bow on a shore tile and land what she is carrying; she cannot
      // go touring across the fields behind it.
      if (this.occupant[this.idx(x, y)] !== 0) return false;
      if (t === Tile.Water || t === Tile.Ice) return true;
      if (t === Tile.Grass || t === Tile.Dirt) return this.bordersWater(x, y);
      return false;
    }
    // Land: pack ice is frozen solid, and walking across it is exactly the sort
    // of thing that decides a game on a frozen map -- until someone breaks it.
    //
    // Woodland is passable, slowly. Treating a tree as a wall made the forest
    // ring round each base a genuine cage: with a thin lane the only way out,
    // the opening turned into a chore of chopping before the game could start.
    // A man can push through a wood; it just takes him three times as long. See
    // the speed penalty in World.followPath.
    if (t === Tile.Water || t === Tile.Gold || t === Tile.Rock) return false;
    return this.occupant[this.idx(x, y)] === 0;
  }

  /** True if this single tile has open water or ice against it. */
  bordersWater(x: number, y: number): boolean {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const t = this.inBounds(x + dx, y + dy) ? this.get(x + dx, y + dy) : null;
      if (t === Tile.Water || t === Tile.Ice) return true;
    }
    return false;
  }

  /** True if any tile bordering the footprint is water. */
  touchesWater(tx: number, ty: number, size: number): boolean {
    for (let y = ty - 1; y <= ty + size; y++)
      for (let x = tx - 1; x <= tx + size; x++) {
        const inside = x >= tx && x < tx + size && y >= ty && y < ty + size;
        if (!inside && this.inBounds(x, y) && this.get(x, y) === Tile.Water) return true;
      }
    return false;
  }

  isBuildable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const t = this.get(x, y);
    return (t === Tile.Grass || t === Tile.Dirt) && this.occupant[this.idx(x, y)] === 0;
  }

  /** Check a square footprint anchored at its top-left tile. */
  canPlace(tx: number, ty: number, size: number): boolean {
    for (let y = ty; y < ty + size; y++)
      for (let x = tx; x < tx + size; x++) if (!this.isBuildable(x, y)) return false;
    return true;
  }

  occupy(tx: number, ty: number, size: number, id: EntityId): void {
    for (let y = ty; y < ty + size; y++)
      for (let x = tx; x < tx + size; x++) this.occupant[this.idx(x, y)] = id;
  }
  release(tx: number, ty: number, size: number): void {
    for (let y = ty; y < ty + size; y++)
      for (let x = tx; x < tx + size; x++) this.occupant[this.idx(x, y)] = 0;
  }

  /**
   * Procedural map: grass with forests, a gold mine near each start, water.
   *
   * `kind` picks the shape of the world; the seed varies everything within it.
   * A hundred seeds of one layout is a hundred maps that all feel the same, so
   * the interesting variation lives here rather than in the noise.
   */
  static generate(width: number, height: number, seed: number, kind: MapKind = "lakeland", stockade = false): GameMap {
    const m = new GameMap(width, height);
    const rng = new Rng(seed);
    const base = SHAPES[kind] ?? SHAPES.lakeland;
    // Scale the layout with the board. The counts were tuned on 64x64; dropping
    // fourteen forests onto a map six times the area gives you six times the
    // emptiness, not a bigger map. Counts go with area, distances with width.
    const area = (width * height) / (64 * 64);
    const span = width / 64;
    const shape: Shape = {
      lakeRadius: Math.round(base.lakeRadius * span),
      rivers: base.rivers,
      riverWidth: Math.max(2, Math.round(base.riverWidth * Math.sqrt(span))),
      fords: Math.max(2, Math.round(base.fords * span)),
      ponds: Math.round(base.ponds * area),
      ridges: Math.round(base.ridges * area),
      forestClumps: Math.round(base.forestClumps * area),
    };

    // Base terrain with dirt patches.
    for (let i = 0; i < width * height; i++) m.tiles[i] = rng.next() < 0.08 ? Tile.Dirt : Tile.Grass;

    // Forest borders + clumps.
    const forest = (x: number, y: number) => {
      if (!m.inBounds(x, y)) return;
      m.set(x, y, Tile.Tree);
      // Four loads to fell, not ten. At a hundred a worker made ten round trips
      // for one trunk, so a morning's chopping changed nothing you could see and
      // the forest read as scenery rather than as a resource being spent.
      m.amount[m.idx(x, y)] = 40;
    };
    for (let x = 0; x < width; x++) {
      forest(x, 0);
      forest(x, 1);
      forest(x, height - 1);
      forest(x, height - 2);
    }
    for (let y = 0; y < height; y++) {
      forest(0, y);
      forest(1, y);
      forest(width - 1, y);
      forest(width - 2, y);
    }
    for (let c = 0; c < shape.forestClumps; c++) {
      const cx = 4 + rng.int(width - 8);
      const cy = 4 + rng.int(height - 8);
      const r = Math.round((2 + rng.int(3)) * Math.max(1, span * 0.7));
      for (let y = -r; y <= r; y++)
        for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r && rng.next() < 0.85) forest(cx + x, cy + y);
    }

    const water = (x: number, y: number) => {
      if (!m.inBounds(x, y)) return;
      m.set(x, y, Tile.Water);
      m.amount[m.idx(x, y)] = 0;
    };
    const rock = (x: number, y: number) => {
      if (!m.inBounds(x, y)) return;
      m.set(x, y, Tile.Rock);
      m.amount[m.idx(x, y)] = 0;
    };
    const lx = Math.floor(width / 2);
    const ly = Math.floor(height / 2);
    const riverY = new Map<number, number>();

    // A central lake, sized by the layout. Every kind gets some, because a
    // Shipyard needs a shoreline and a map with no water locks out half the
    // building list.
    const lr = shape.lakeRadius;
    if (lr > 0) {
      for (let y = -lr; y <= lr; y++)
        for (let x = -lr; x <= lr; x++) {
          const d = x * x + y * y;
          if (d <= lr * lr - rng.int(12)) water(lx + x, ly + y);
        }
    }

    // Rivers running out of the lake to the map edges.
    for (let i = 0; i < shape.rivers; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      let ry = ly + dir * (2 + rng.int(3));
      for (let x = lx; x >= 0 && x < width; x += dir) {
        if (rng.next() < 0.3) ry += rng.int(3) - 1;
        for (let w2 = 0; w2 < shape.riverWidth; w2++) water(x, ry + w2);
        riverY.set(x, ry);
      }
    }

    // Scattered ponds, for layouts that want shoreline without a great lake.
    for (let i = 0; i < shape.ponds; i++) {
      const px = 6 + rng.int(width - 12);
      const py = 6 + rng.int(height - 12);
      const pr = 2 + rng.int(3);
      for (let y = -pr; y <= pr; y++)
        for (let x = -pr; x <= pr; x++) if (x * x + y * y <= pr * pr) water(px + x, py + y);
    }

    // Rock ridges: walls that block land and sea alike, so armies must go round.
    for (let i = 0; i < shape.ridges; i++) {
      let rx = 8 + rng.int(width - 16);
      let ry = 8 + rng.int(height - 16);
      const len = 8 + rng.int(14);
      const horiz = rng.next() < 0.5;
      for (let k = 0; k < len; k++) {
        rock(rx, ry);
        if (rng.next() < 0.5) rock(rx + (horiz ? 0 : 1), ry + (horiz ? 1 : 0));
        if (horiz) rx += 1;
        else ry += 1;
        if (rng.next() < 0.25) {
          if (horiz) ry += rng.int(3) - 1;
          else rx += rng.int(3) - 1;
        }
      }
    }

    // Fords. Without them the rivers wall the two halves of the map off from each
    // other and a land army can never reach the enemy — which is exactly what an
    // unattended AI match turned up. Two crossings per river, well away from the
    // lake, keep the water meaningful without making it a barrier.
    const ford = (x: number) => {
      const ry = riverY.get(x);
      if (ry === undefined) return;
      for (let w2 = 0; w2 < 3; w2++)
        for (let y = ry - 1; y <= ry + shape.riverWidth + 1; y++)
          if (m.inBounds(x + w2, y) && m.get(x + w2, y) === Tile.Water) {
            m.set(x + w2, y, Tile.Dirt);
            m.amount[m.idx(x + w2, y)] = 0;
          }
    };
    for (const dir of [1, -1]) {
      const span = dir > 0 ? width - lx : lx;
      for (let f = 1; f <= shape.fords; f++) ford(lx + dir * Math.floor((span * f) / (shape.fords + 1)));
    }

    // Clear start areas (top-left and bottom-right) and drop a gold mine beside each.
    const clear = (cx: number, cy: number, r: number) => {
      for (let y = -r; y <= r; y++)
        for (let x = -r; x <= r; x++)
          if (m.inBounds(cx + x, cy + y)) {
            m.set(cx + x, cy + y, Tile.Grass);
            m.amount[m.idx(cx + x, cy + y)] = 0;
          }
    };
    const mine = (tx: number, ty: number) => {
      for (let y = 0; y < 3; y++)
        for (let x = 0; x < 3; x++) {
          m.set(tx + x, ty + y, Tile.Gold);
          m.amount[m.idx(tx + x, ty + y)] = 2000;
        }
    };
    // Seats sit a fixed fraction in from the corners, so they stay a sensible
    // distance apart whatever the board size.
    const inset = Math.max(10, Math.round(width * 0.09));
    m.starts = [
      { x: inset, y: inset },
      { x: width - inset - 1, y: height - inset - 1 },
    ];
    clear(inset, inset, 7);
    mine(inset - 6, inset - 1);
    clear(width - inset - 1, height - inset - 1, 7);
    mine(width - inset + 3, height - inset - 2);

    // A bay within reach of every seat.
    //
    // On a 64-tile board the central lake was close enough to everyone that a
    // Shipyard was always buildable. At 160 the same lake sits ninety tiles from
    // your capital, and the grader threw out 389 candidates in a row because one
    // side or the other had no coast -- which quietly deletes the Shipyard, the
    // Oil Rig, the Refinery and every ship from those maps. So each seat now
    // gets its own inlet, set back from the base and angled away from the middle
    // so it reads as a separate piece of water rather than an arm of the lake.
    for (const seat of m.starts) {
      const toMiddle = Math.atan2(height / 2 - seat.y, width / 2 - seat.x);
      // Out to the side of the line between the seat and the centre.
      const a2 = toMiddle + Math.PI * 0.62;
      const bx = Math.round(seat.x + Math.cos(a2) * 11);
      const by = Math.round(seat.y + Math.sin(a2) * 11);
      const br = 4 + rng.int(3);
      for (let y = -br; y <= br; y++)
        for (let x = -br; x <= br; x++) {
          if (x * x + y * y > br * br - rng.int(4)) continue;
          const px = bx + x;
          const py = by + y;
          // Never flood the seat itself or the ground its first buildings need.
          if (Math.abs(px - seat.x) < 6 && Math.abs(py - seat.y) < 6) continue;
          water(px, py);
        }
    }

    // Pack ice.
    //
    // Floes drift on the open water of the wetter layouts, in patches rather
    // than an even sprinkle -- a floe is something you sail around or send an
    // Icebreaker through, and a fair scatter of single tiles would be neither.
    // Two rules keep it from breaking a match: nothing within fourteen tiles of
    // a seat, so the bay a player needs for a Shipyard is never frozen shut at
    // the outset; and only water deep enough to have water all around it, so
    // shorelines stay open and a floe never seals a river mouth on tick one.
    const iceCover = ICE_COVER[kind] ?? 0;
    if (iceCover > 0) {
      const fx = 0.06 + rng.next() * 0.03;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (m.get(x, y) !== Tile.Water) continue;
          let openAround = true;
          for (let dy = -1; dy <= 1 && openAround; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (!m.inBounds(x + dx, y + dy) || m.get(x + dx, y + dy) !== Tile.Water) {
                openAround = false;
                break;
              }
          if (!openAround) continue;
          let nearSeat = false;
          for (const s of m.starts) if (Math.hypot(x - s.x, y - s.y) < 14) nearSeat = true;
          if (nearSeat) continue;
          // Smooth noise, so the ice comes in sheets with lanes between them.
          const n =
            Math.sin(x * fx) * Math.cos(y * fx * 1.3) +
            Math.sin((x + y) * fx * 0.6) * 0.7 +
            Math.sin(x * fx * 2.1 + y * fx * 0.4) * 0.4;
          if ((n + 2.1) / 4.2 < 1 - iceCover) continue;
          m.set(x, y, Tile.Ice);
        }
    }

    // A wall of forest around every seat.
    //
    // You begin fenced in by your own timber: there is no road out until someone
    // cuts one, so the first decision of the game is which way to open the gate.
    // It is drawn last, over land only -- a seat with an inlet can still sail out
    // -- and the ring is jittered so it reads as old woodland rather than a
    // fence. The gold and the ground the first buildings need are inside it.
    if (stockade)
      for (const seat of m.starts) {
        const R = 11;
        for (let y = -R - 3; y <= R + 3; y++)
          for (let x = -R - 3; x <= R + 3; x++) {
            const d = Math.hypot(x, y);
            // Thickness wanders with the angle, so the wall is two to four deep.
            const wobble = Math.sin(Math.atan2(y, x) * 3.1 + seat.x) * 0.9;
            if (d < R + wobble || d > R + 1.5 + wobble) continue;
            const px = seat.x + x;
            const py = seat.y + y;
            if (!m.inBounds(px, py)) continue;
            const t = m.get(px, py);
            if (t !== Tile.Grass && t !== Tile.Dirt) continue;
            if (m.occupant[m.idx(px, py)] !== 0) continue;
            m.set(px, py, Tile.Tree);
            // Thin and light on purpose: the wall is meant to be cut through in
            // a few minutes, not besieged, and every trunk in it is also lumber
            // in the bank. Two deep at 40 wood a tile is about ninety seconds
            // with three peasants on it.
            m.amount[m.idx(px, py)] = 40;
          }
      }

    // One buried seam, richer than the starting mines, hidden somewhere well away
    // from both bases. Finding it is a reward for scouting; its position comes from
    // the map seed, so it is the same for everyone playing that map and different
    // on every new one.
    const far = (x: number, y: number) => {
      let nearest = Infinity;
      for (const s of m.starts) nearest = Math.min(nearest, Math.hypot(x - s.x, y - s.y));
      return nearest > Math.max(width, height) * 0.3;
    };
    for (let attempt = 0; attempt < 400; attempt++) {
      const sx = 4 + rng.int(width - 10);
      const sy = 4 + rng.int(height - 10);
      if (!far(sx, sy)) continue;
      let ok = true;
      for (let y = sy; y < sy + 2 && ok; y++)
        for (let x = sx; x < sx + 2 && ok; x++)
          if (!m.inBounds(x, y) || m.get(x, y) === Tile.Water || m.occupant[m.idx(x, y)] !== 0) ok = false;
      if (!ok) continue;
      for (let y = sy; y < sy + 2; y++)
        for (let x = sx; x < sx + 2; x++) {
          m.set(x, y, Tile.Gold);
          m.amount[m.idx(x, y)] = 5000;
          m.hidden[m.idx(x, y)] = 1;
        }
      m.secret = { x: sx, y: sy, found: false };
      break;
    }
    m.version++;
    return m;
  }
}
