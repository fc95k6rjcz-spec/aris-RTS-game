/**
 * Fog of war: what each player can see, and what they merely remember.
 *
 * Three states per tile, per player:
 *
 *   0  unexplored -- black. Nobody of yours has ever been near it.
 *   1  explored   -- dim. You have been here; you know the ground, but what is
 *                   standing on it now is anyone's guess.
 *   2  visible    -- lit. Something of yours can see it right now.
 *
 * This lives in the simulation rather than the renderer, and that is the whole
 * design decision. Visibility has to decide what a player may target and what
 * their AI may know, so it must be computed identically on every machine from
 * the same commands -- exactly like everything else in sim/. A renderer-side fog
 * would look right and be a lie: you would still be able to click what you
 * cannot see, and in a lockstep game the two players would disagree about it.
 *
 * Cost is the reason for the design. A naive version recomputes a disc around
 * every unit every tick: with 60 units and a 9-tile radius that is about 15,000
 * tile writes a tick, 300,000 a second. Instead the visible set is rebuilt only
 * every few ticks, and the discs are precomputed offset tables rather than a
 * distance test per tile.
 */

import { SUB } from "./types";

export const UNEXPLORED = 0;
export const EXPLORED = 1;
export const VISIBLE = 2;

/** Ticks between rebuilds of the visible set. */
export const VISION_INTERVAL = 4;

/** Offsets making up a filled disc of a given radius, computed once per radius. */
const DISCS = new Map<number, Int32Array>();

function disc(r: number): Int32Array {
  const key = Math.round(r * 2);
  const cached = DISCS.get(key);
  if (cached) return cached;
  const rr = key / 2;
  const out: number[] = [];
  const n = Math.ceil(rr);
  for (let dy = -n; dy <= n; dy++)
    for (let dx = -n; dx <= n; dx++) {
      if (dx * dx + dy * dy > rr * rr) continue;
      out.push(dx, dy);
    }
  const arr = Int32Array.from(out);
  DISCS.set(key, arr);
  return arr;
}

/**
 * One player's knowledge of the map.
 *
 * `explored` is permanent and only ever grows. `visible` is rebuilt from
 * scratch each time, because a unit walking away has to take its light with it.
 */
export class Vision {
  readonly explored: Uint8Array;
  private readonly visible: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.explored = new Uint8Array(width * height);
    this.visible = new Uint8Array(width * height);
  }

  /** 0 unexplored, 1 explored, 2 visible. */
  at(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return UNEXPLORED;
    const i = ty * this.width + tx;
    return this.visible[i] ? VISIBLE : this.explored[i] ? EXPLORED : UNEXPLORED;
  }

  /** Whether a point in world sub-units is in sight right now. */
  seesPoint(x: number, y: number): boolean {
    return this.at(Math.floor(x / SUB), Math.floor(y / SUB)) === VISIBLE;
  }

  /**
   * Recompute the visible set from a list of watchers, each a world position
   * and a sight radius in tiles.
   */
  update(watchers: Iterable<{ x: number; y: number; r: number; elevated?: boolean }>, blocks: (x: number, y: number) => boolean = () => false): void {
    this.visible.fill(0);
    for (const w of watchers) {
      const cx = Math.floor(w.x / SUB);
      const cy = Math.floor(w.y / SUB);
      const d = disc(w.r);
      for (let i = 0; i < d.length; i += 2) {
        const x = cx + d[i]!;
        const y = cy + d[i + 1]!;
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
        if (!w.elevated && !clearSight(cx, cy, x, y, blocks)) continue;
        const k = y * this.width + x;
        this.visible[k] = 1;
        this.explored[k] = 1;
      }
    }
  }

  /** Reveal the whole board. Used by the sandbox and by the map tools. */
  revealAll(): void {
    this.explored.fill(1);
    this.visible.fill(1);
  }
}

/** The blocking tile is visible, but ground behind it is not. No diagonal pinholes. */
export function clearSight(x0: number,y0: number,x1: number,y1: number,blocks:(x:number,y:number)=>boolean):boolean {
  let x=x0,y=y0;const dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=Math.sign(x1-x0),sy=Math.sign(y1-y0);let err=dx-dy;
  while(x!==x1 || y!==y1){
    const twice=2*err;let nx=x,ny=y;
    if(twice>-dy){err-=dy;nx+=sx;}if(twice<dx){err+=dx;ny+=sy;}
    if(nx!==x&&ny!==y&&blocks(nx,y)&&blocks(x,ny)) return false;
    x=nx;y=ny;if(x===x1&&y===y1)return true;if(blocks(x,y))return false;
  }return true;
}

