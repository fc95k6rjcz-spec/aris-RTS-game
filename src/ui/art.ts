/**
 * Illustrations for the command bar and the selection panel.
 *
 * Cut from the interface mockups with tools/crop_rects.mjs. There is no art for
 * every command -- the mockups covered the six buildings you start with and the
 * three standing orders -- and everything else returns null and gets the plain
 * tile it had before. That is deliberate: a command bar where six tiles are
 * painted and the rest are flat reads as a work in progress, which it is,
 * rather than as a bug.
 */

import type { HudButton } from "./hud";

import townhall from "../assets/ui/townhall.jpg";
import farm from "../assets/ui/farm.jpg";
import lumbermill from "../assets/ui/lumbermill.jpg";
import golddepot from "../assets/ui/golddepot.jpg";
import barracks from "../assets/ui/barracks.jpg";
import tower from "../assets/ui/tower.jpg";
import orderAttack from "../assets/ui/order_attack.jpg";
import orderStop from "../assets/ui/order_stop.jpg";
import orderHarvest from "../assets/ui/order_harvest.jpg";
import portraitWorker from "../assets/ui/portrait_worker.jpg";
import portraitKing from "../assets/ui/portrait_king.jpg";
import bannerHumanSrc from "../assets/ui/banner_human.jpg";

const BUILDING: Record<string, string> = { townhall, farm, lumbermill, golddepot, barracks, tower };

/** The picture for a command tile, or null for the ones not yet painted. */
export function commandArt(a: HudButton["action"]): string | null {
  switch (a.type) {
    case "build":
      return BUILDING[a.def] ?? null;
    case "attack":
      return orderAttack;
    case "stop":
      return orderStop;
    case "harvest":
      return orderHarvest;
    default:
      return null;
  }
}

/**
 * A unit's face.
 *
 * Only two exist so far. A unit with no portrait gets the hatched placeholder,
 * which is at least honest about being a gap.
 */
export function portraitArt(def: string): string | null {
  if (def === "king" || def === "prince") return portraitKing;
  if (def === "worker") return portraitWorker;
  return null;
}

export const bannerHuman = bannerHumanSrc;
