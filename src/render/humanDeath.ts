import source from "../assets/motion-v2/human-death-v2.png";
import { spriteImage } from "./sprites";

// Individual cell bounds preserve the longer silhouettes of the fallen bodies.
const BOUNDS = {
  worker: [[52,235],[363,571],[702,965],[1025,1328],[1401,1729],[1805,2129]],
  footman: [[29,261],[350,587],[684,993],[1006,1356],[1389,1761],[1794,2164]],
} as const;

export function humanDeathFrame(age: number): number {
  // Brief recoil, knees give way, faster drop, then a held resting pose.
  return age < 3 ? 0 : age < 7 ? 1 : age < 11 ? 2 : age < 16 ? 3 : age < 22 ? 4 : 5;
}

export function drawHumanDeath(ctx: CanvasRenderingContext2D, def: "worker" | "footman", facing: number,
  x: number, y: number, size: number, age: number, animated: boolean): boolean {
  const img = spriteImage(source);
  if (!img) return false;
  const frame = animated ? humanDeathFrame(age) : 5;
  const [left, right] = BOUNDS[def][frame]!;
  const worker = def === "worker";
  const top = worker ? 0 : 374, bottom = worker ? 373 : 704;
  const baseline = worker ? 365 : 697;
  const scale = size * 1.4 / (worker ? 293 : 320);
  const width = right - left;
  ctx.save();
  ctx.translate(x, y + size * .45);
  if (facing === 0 || facing === 1 || facing === 7) ctx.scale(-1, 1);
  ctx.drawImage(img, left, top, width, bottom - top,
    -width * scale / 2, -(baseline - top) * scale, width * scale, (bottom - top) * scale);
  ctx.restore();
  return true;
}
