/**
 * The ground, as it is worn, wetted and paved.
 *
 * Four rows of ten photographed tiles: fresh grass through to bare dirt, the
 * wet version of each, natural ground through to full stone, and the wet
 * version of that. They line up exactly with the three numbers the simulation
 * already keeps about a tile -- how worn it is, how churned it is, and whether
 * the clan walking it has laid stone -- which is why this art is a drop-in
 * rather than a redesign.
 *
 *   wear  0..255  ->  which of the ten stages
 *   mud   0..255  ->  how far towards the wet row
 *   paved         ->  the stone rows instead of the grass rows
 *
 * Paved roads use the wear stage too, so a route that carries traffic develops
 * from scattered stone through cobble to laid slabs. You do not place that; it
 * happens where your people actually walk, which is the same idea as the dirt
 * track it replaces.
 */

import dry0 from "../assets/terrain/dry_0.jpg";
import dry1 from "../assets/terrain/dry_1.jpg";
import dry2 from "../assets/terrain/dry_2.jpg";
import dry3 from "../assets/terrain/dry_3.jpg";
import dry4 from "../assets/terrain/dry_4.jpg";
import dry5 from "../assets/terrain/dry_5.jpg";
import dry6 from "../assets/terrain/dry_6.jpg";
import dry7 from "../assets/terrain/dry_7.jpg";
import dry8 from "../assets/terrain/dry_8.jpg";
import dry9 from "../assets/terrain/dry_9.jpg";
import wet0 from "../assets/terrain/wet_0.jpg";
import wet1 from "../assets/terrain/wet_1.jpg";
import wet2 from "../assets/terrain/wet_2.jpg";
import wet3 from "../assets/terrain/wet_3.jpg";
import wet4 from "../assets/terrain/wet_4.jpg";
import wet5 from "../assets/terrain/wet_5.jpg";
import wet6 from "../assets/terrain/wet_6.jpg";
import wet7 from "../assets/terrain/wet_7.jpg";
import wet8 from "../assets/terrain/wet_8.jpg";
import wet9 from "../assets/terrain/wet_9.jpg";
import stone0 from "../assets/terrain/stone_0.jpg";
import stone1 from "../assets/terrain/stone_1.jpg";
import stone2 from "../assets/terrain/stone_2.jpg";
import stone3 from "../assets/terrain/stone_3.jpg";
import stone4 from "../assets/terrain/stone_4.jpg";
import stone5 from "../assets/terrain/stone_5.jpg";
import stone6 from "../assets/terrain/stone_6.jpg";
import stone7 from "../assets/terrain/stone_7.jpg";
import stone8 from "../assets/terrain/stone_8.jpg";
import stone9 from "../assets/terrain/stone_9.jpg";
import wetstone0 from "../assets/terrain/wetstone_0.jpg";
import wetstone1 from "../assets/terrain/wetstone_1.jpg";
import wetstone2 from "../assets/terrain/wetstone_2.jpg";
import wetstone3 from "../assets/terrain/wetstone_3.jpg";
import wetstone4 from "../assets/terrain/wetstone_4.jpg";
import wetstone5 from "../assets/terrain/wetstone_5.jpg";
import wetstone6 from "../assets/terrain/wetstone_6.jpg";
import wetstone7 from "../assets/terrain/wetstone_7.jpg";
import wetstone8 from "../assets/terrain/wetstone_8.jpg";
import wetstone9 from "../assets/terrain/wetstone_9.jpg";

const DRY: string[] = [dry0, dry1, dry2, dry3, dry4, dry5, dry6, dry7, dry8, dry9];
const WET: string[] = [wet0, wet1, wet2, wet3, wet4, wet5, wet6, wet7, wet8, wet9];
const STONE: string[] = [stone0, stone1, stone2, stone3, stone4, stone5, stone6, stone7, stone8, stone9];
const WETSTONE: string[] = [wetstone0, wetstone1, wetstone2, wetstone3, wetstone4, wetstone5, wetstone6, wetstone7, wetstone8, wetstone9];

/** Ten stages, so a tile's wear picks one. */
export const STAGES = 10;

export function stageOf(wear: number): number {
  return Math.max(0, Math.min(STAGES - 1, Math.floor((wear / 256) * STAGES)));
}

/**
 * The two tiles to draw for a patch of ground, and how wet it is between them.
 *
 * Two rather than one because the dry and wet versions are cross-faded: mud
 * arrives over a couple of minutes of rain and dries over about four, and
 * snapping between two tiles at some threshold would throw all of that away.
 */
export function groundFor(wear: number, mud: number, paved: boolean, rain: number): { dry: string; wet: string; wetness: number } {
  const i = stageOf(wear);
  // A paved way never takes mud -- that is what it is for -- but it still looks
  // wet while it is raining.
  return paved
    ? { dry: STONE[i]!, wet: WETSTONE[i]!, wetness: rain }
    : { dry: DRY[i]!, wet: WET[i]!, wetness: mud / 255 };
}
