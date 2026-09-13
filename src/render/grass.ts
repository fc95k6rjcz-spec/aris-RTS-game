/**
 * Ground cover, in fourteen variants.
 *
 * The map used to be one photographed grass tile repeated, mirrored into a 2x2
 * block to hide the seam. Mirroring hides a join but it also builds a butterfly
 * out of whatever is in the picture, and at any distance the eye finds the
 * repeat anyway -- a field read as wallpaper.
 *
 * The sheet carries thirty-five: lush grass through clover and daisies to
 * scuffed earth with stones in it. Only the fourteen greenest are used, and
 * that is the whole lesson of a first attempt that used all of them -- dropped
 * at random into neighbouring tiles, a range that wide reads as a quilt rather
 * than as a meadow, because the eye reads the brightness step at every tile
 * edge as a boundary. How worn a tile is already has its own art laid over the
 * top, in render/ground.ts; this is the ground before anybody walked on it, and
 * untouched ground does not vary from lawn to bare earth in a single stride.
 *
 * One is chosen per tile from the tile's own coordinates, so the choice is
 * stable -- a tile looks the same every time it is baked, and two machines in a
 * network game paint the same field -- while the field has no pattern in it.
 */

import g0_0 from "../assets/grass/g0_0.jpg";
import g0_1 from "../assets/grass/g0_1.jpg";
import g0_2 from "../assets/grass/g0_2.jpg";
import g0_3 from "../assets/grass/g0_3.jpg";
import g0_4 from "../assets/grass/g0_4.jpg";
import g0_5 from "../assets/grass/g0_5.jpg";
import g0_6 from "../assets/grass/g0_6.jpg";
import g1_0 from "../assets/grass/g1_0.jpg";
import g1_1 from "../assets/grass/g1_1.jpg";
import g1_2 from "../assets/grass/g1_2.jpg";
import g1_3 from "../assets/grass/g1_3.jpg";
import g1_4 from "../assets/grass/g1_4.jpg";
import g1_5 from "../assets/grass/g1_5.jpg";
import g1_6 from "../assets/grass/g1_6.jpg";

import { spriteImage } from "./sprites";

const VARIANTS: string[] = [
  g0_0,
  g0_1,
  g0_2,
  g0_3,
  g0_4,
  g0_5,
  g0_6,
  g1_0,
  g1_1,
  g1_2,
  g1_3,
  g1_4,
  g1_5,
  g1_6,
];

/**
 * Which variant this tile wears.
 *
 * Hashed from the coordinates rather than drawn from a generator, so it depends
 * on nothing but where the tile is.
 */
export function grassVariantFor(x: number, y: number): string {
  const h = ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) % VARIANTS.length;
  return VARIANTS[h]!;
}

export function grassVariantCount(): number {
  return VARIANTS.length;
}

/**
 * Whether every variant has arrived.
 *
 * Terrain is baked into chunks and the chunks are cached, so a bake that ran
 * before the images loaded would fall back to the old single texture and then
 * stay that way for the rest of the match. The renderer watches this and throws
 * its bakes away once, the moment it turns true.
 */
export function grassReady(): boolean {
  for (const v of VARIANTS) if (!spriteImage(v)) return false;
  return true;
}
