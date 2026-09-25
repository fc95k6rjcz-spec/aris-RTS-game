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

import torch from "../assets/motion-v2/campfire.webp";
import wall from "../assets/walls/10.webp";
import shelter from "../assets/motion-v2/shelter-v2.webp";
import type { HudButton } from "./hud";
import type { Building } from "../sim/entities";
import { tierArtSource } from "../render/sprites";
import { redesignedArt } from "../render/redesign";
import { artFor } from "../render/buildingArt";
import church from "../assets/church_1.png";
import stables from "../assets/stables_1.png";
import shipyard from "../assets/shipyard_1.png";
import magetower from "../assets/magetower_1.png";
import foundry from "../assets/foundry_1.png";
import oilrig from "../assets/oilrig_1.png";
import refinery from "../assets/refinery_1.png";
import airfactory from "../assets/airfactory_1.png";
import gryphonaviary from "../assets/gryphonaviary_1.png";

import townhall from "../assets/royal/hall-1.webp";
import farm from "../assets/ui/farm.jpg";
import lumbermill from "../assets/ui/lumbermill.jpg";
import golddepot from "../assets/ui/golddepot.jpg";
import barracks from "../assets/ui/barracks.jpg";
import tower from "../assets/royal/outpost-1.webp";
import orderAttack from "../assets/ui/order_attack.jpg";
import orderStop from "../assets/ui/order_stop.jpg";
import orderHarvest from "../assets/ui/order_harvest.jpg";
import portraitWorker from "../assets/ui/portrait_worker.jpg";
import portraitKing from "../assets/ui/portrait_king.jpg";
import bannerHumanSrc from "../assets/ui/banner_human.jpg";

const BUILDING: Record<string, string> = { torch, wall, shelter, townhall, farm, lumbermill, golddepot, barracks, tower,
  church, stables, shipyard, magetower, gryphonaviary, foundry, oilrig, refinery, airfactory };

function buildingArt(def: string): string | null {
  const redesigned = redesignedArt(def,'level',1);
  if(redesigned)return redesigned;
  if (BUILDING[def]) return BUILDING[def]!;
  const draw = artFor("human", def);
  if (!draw) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  draw({ ctx, faction: "human", def, x: 16, y: 12, w: 224, color: "#3b82f6", progress: 1, tick: 0, level: 1 });
  return BUILDING[def] = canvas.toDataURL();
}

/** The picture for a command tile, or null for the ones not yet painted. */
export function commandArt(a: HudButton["action"], building?: Building, faction = "human"): string | null {
  switch (a.type) {
    case "upgrade":
    case "cancelUpgrade":
      return building ? tierArtSource(building.def, building.upgrade?.toLevel ?? building.level + 1, faction) ?? buildingArt(building.def) : null;
    case "battleRally":
      return portraitKing;
    case "train":
      return portraitArt(a.def);
    case "build":
      return buildingArt(a.def);
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
