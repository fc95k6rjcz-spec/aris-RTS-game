import type { GameMap } from "./map";
import type { Domain } from "../data/units";
import { Tile } from "./types";

/** Swimming is slower than walking, so water costs a swimmer more to cross. */
const SWIM_PENALTY = 2.2;

/** Binary min-heap keyed on f-score. */
class Heap {
  private a: number[] = [];
  private f: number[] = [];
  get size(): number {
    return this.a.length;
  }
  push(node: number, f: number): void {
    this.a.push(node);
    this.f.push(f);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[p]! <= this.f[i]!) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.a[0]!;
    const last = this.a.pop()!;
    const lf = this.f.pop()!;
    if (this.a.length > 0) {
      this.a[0] = last;
      this.f[0] = lf;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let s = i;
        if (l < this.a.length && this.f[l]! < this.f[s]!) s = l;
        if (r < this.a.length && this.f[r]! < this.f[s]!) s = r;
        if (s === i) break;
        this.swap(i, s);
        i = s;
      }
    }
    return top;
  }
  private swap(i: number, j: number): void {
    [this.a[i], this.a[j]] = [this.a[j]!, this.a[i]!];
    [this.f[i], this.f[j]] = [this.f[j]!, this.f[i]!];
  }
}

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 10],
  [-1, 0, 10],
  [0, 1, 10],
  [0, -1, 10],
  [1, 1, 14],
  [-1, 1, 14],
  [1, -1, 14],
  [-1, -1, 14],
];

/**
 * A* over the tile grid. Returns a list of tile coords from start (exclusive) to goal.
 * If the goal is blocked, paths to the nearest reachable tile instead.
 * Deterministic: iteration order is fixed and ties break on node index.
 */
export function findPath(
  map: GameMap,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  domain: Domain = "land",
  maxNodes = 0,
): Array<[number, number]> {
  if (sx === gx && sy === gy) return [];
  // Walled off? Say so now.
  //
  // A search that fails has to expand every reachable tile before it can admit
  // defeat, which is the most expensive thing this function ever does -- and
  // once bases start ringed by forest, failing searches are the common case. A
  // component map answers "is there any route at all" in one array lookup, and
  // costs a single flood fill each time the ground actually changes. It took the
  // simulation from 3.0 ms a tick back to 0.4 on a walled 160x160 board.
  const cutOff =
    map.isWalkable(sx, sy, domain) && map.isWalkable(gx, gy, domain) && !map.connected(sx, sy, gx, gy, domain);
  const W = map.width;
  // Budget enough expansions to search the whole board and then some.
  //
  // This was a flat 4000 on a 64x64 board -- 4096 tiles -- so any route that had
  // to look at most of the map ran out and returned a partial path instead. That
  // is exactly what happens when buildings are packed tightly: the direct line is
  // walled off, the search fans out around the obstruction, exhausts its budget,
  // and hands back a route that walks the unit into the wall and stops. The unit
  // then re-paths, gets the same truncated answer, and stands there. Searching a
  // whole 64x64 board costs well under a millisecond, so the cap was buying
  // nothing and costing the thing the player actually notices.
  let budget = maxNodes > 0 ? maxNodes : Math.max(4000, map.width * map.height * 2);
  // Ordered somewhere with no route to it -- the far side of a wall, another
  // island. The answer is still "walk as far towards it as you can", because a
  // unit that simply ignores the order looks broken, but there is no point
  // expanding the whole reachable world to discover what the component map
  // already said. A short search finds the near side of the obstacle and stops.
  if (cutOff) budget = Math.min(budget, 3000);
  const start = sy * W + sx;
  const goal = gy * W + gx;
  const gScore = new Map<number, number>();
  const came = new Map<number, number>();
  const closed = new Set<number>();
  const open = new Heap();
  const h = (n: number) => {
    const dx = Math.abs((n % W) - gx);
    const dy = Math.abs(Math.floor(n / W) - gy);
    return 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy);
  };
  gScore.set(start, 0);
  open.push(start, h(start));
  let best = start;
  let bestH = h(start);
  let expanded = 0;

  while (open.size > 0 && expanded < budget) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    expanded++;
    if (cur === goal) {
      best = cur;
      break;
    }
    const hc = h(cur);
    if (hc < bestH) {
      bestH = hc;
      best = cur;
    }
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    const g = gScore.get(cur)!;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      const n = ny * W + nx;
      const isGoal = n === goal;
      if (!isGoal && !map.isWalkable(nx, ny, domain)) continue;
      // No corner cutting through blocked tiles on diagonals.
      if (dx !== 0 && dy !== 0 && (!map.isWalkable(cx + dx, cy, domain) || !map.isWalkable(cx, cy + dy, domain))) continue;
      if (closed.has(n)) continue;
      let ng = g + cost;
      if (domain === "amphibious" && map.inBounds(nx, ny) && map.get(nx, ny) === Tile.Water) ng = g + cost * SWIM_PENALTY;
      const old = gScore.get(n);
      if (old === undefined || ng < old) {
        gScore.set(n, ng);
        came.set(n, cur);
        open.push(n, ng + h(n));
      }
    }
  }

  const path: Array<[number, number]> = [];
  let n = best;
  while (n !== start) {
    path.push([n % W, Math.floor(n / W)]);
    const p = came.get(n);
    if (p === undefined) break;
    n = p;
  }
  path.reverse();
  // If the goal itself is blocked (a building or resource), stop adjacent to it.
  if (path.length > 0 && best === goal && !map.isWalkable(gx, gy, domain)) path.pop();
  return path;
}
