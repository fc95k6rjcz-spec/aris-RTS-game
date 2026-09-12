/**
 * Pre-scaled sprite cache.
 *
 * Canvas `drawImage` with a destination smaller than the source resamples the
 * source every single call. One tree does not matter; a forest does. On a
 * 160x160 board zoomed out, the view holds a couple of thousand trees, and
 * drawing each one straight from its full-size painting cost 31 ms a frame --
 * two frames' worth of budget, in one loop, and the single biggest cause of the
 * game feeling glitchy on a big map.
 *
 * So each distinct (sprite, size) pair is drawn once into a small canvas of
 * exactly the size it will appear, and every later draw is a 1:1 blit. Sizes are
 * quantised into buckets so that zooming does not mint a new canvas per frame,
 * and the whole cache is dropped when it gets large rather than tracked
 * individually -- these are cheap to rebuild and the working set is small.
 */

const cache = new Map<string, HTMLCanvasElement>();

/** How finely sprite sizes are bucketed, in pixels. */
const STEP = 3;

/** Above this many cached stamps, start again: the player has zoomed a lot. */
const LIMIT = 400;

/** Snap a size to its bucket, so nearby zoom levels share one stamp. */
export function bucket(px: number): number {
  return Math.max(STEP, Math.round(px / STEP) * STEP);
}

/**
 * A canvas of the given size, painted once by `paint` and cached under `key`.
 * `key` must already describe everything `paint` depends on apart from the size.
 */
export function stamp(key: string, w: number, h: number, paint: (c: CanvasRenderingContext2D, w: number, h: number) => void): HTMLCanvasElement {
  const k = `${key}|${w}x${h}`;
  const hit = cache.get(k);
  if (hit) return hit;
  if (cache.size > LIMIT) cache.clear();
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  paint(ctx, c.width, c.height);
  cache.set(k, c);
  return c;
}

/** Drop everything, for tests and for when the art finishes loading. */
export function clearStamps(): void {
  cache.clear();
}
