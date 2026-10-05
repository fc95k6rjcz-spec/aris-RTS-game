/**
 * Unit upgrades: permanent improvements a building researches once and every unit
 * of that type keeps, now and in future.
 *
 * `host` is the building that researches it, which is NOT always the building that
 * trains the unit — Warcraft II researched arrow upgrades at the Lumber Mill, not
 * the Barracks, and that separation is a real design lever: it makes a building
 * worth keeping after its units are obsolete. Moving an upgrade is a one-line
 * change here, so the split is data rather than something baked into the code.
 */

import type { Cost } from "../sim/types";

export interface UpgradeLevel {
  cost: Cost;
  /** Ticks to research (20 ticks = 1s). */
  time: number;
  /** Added to each affected unit's attack damage. */
  damage?: number;
  /** Subtracted from damage each affected unit takes. */
  armour?: number;
  /** Added to attack range, in tiles. */
  range?: number;
  /** Added to each support heal. */
  heal?: number;
  /** Added to support healing range, in tiles. */
  healRange?: number;
  /**
   * Marks an upgrade that changes the ground rather than a unit.
   *
   * Every other upgrade here makes a named unit better. Paving makes the roads
   * better, which is to say it makes everything that walks on them better, so
   * it has no unit list and nothing reads its numbers except the movement code.
   * The field exists so the HUD can tell the difference and describe it without
   * claiming a Knight got thicker plate.
   */
  ground?: boolean;
}

export interface UpgradeDef {
  id: string;
  name: string;
  /** Building that researches it. */
  host: string;
  /** Unit ids the upgrade applies to. */
  units: string[];
  hotkey: string;
  description: string;
  /** One entry per level, in order. */
  levels: UpgradeLevel[];
}

export const UPGRADES: Record<string, UpgradeDef> = {
  paving: {
    id: "paving",
    name: "Paved Ways",
    // The Mill cuts and hauls; laying a road is the same trade.
    host: "lumbermill",
    units: [],
    hotkey: "5",
    description: "Lay stone over the tracks your people have already beaten. Every worn path carries twice the advantage.",
    levels: [{ cost: { gold: 675, lumber: 563 }, time: 20 * 60, ground: true }],
  },
  barding: {
    id: "barding",
    name: "Barding",
    // Requested here rather than at the Stables: the Lumber Mill supplies the
    // timber and leather the harness is built on.
    host: "lumbermill",
    units: ["knight"],
    hotkey: "1",
    description: "Armoured harness for cavalry. More damage and thicker plate.",
    levels: [
      { cost: { gold: 450, lumber: 338 }, time: 20 * 40, damage: 4, armour: 1 },
      { cost: { gold: 765, lumber: 585 }, time: 20 * 55, damage: 5, armour: 1 },
      { cost: { gold: 1170, lumber: 900 }, time: 20 * 75, damage: 6, armour: 2 },
    ],
  },
  blades: {
    id: "blades",
    name: "Sharpened Blades",
    host: "barracks",
    units: ["footman"],
    hotkey: "2",
    description: "Better steel for the infantry. More damage per swing.",
    levels: [
      { cost: { gold: 338, lumber: 203 }, time: 20 * 35, damage: 3 },
      { cost: { gold: 585, lumber: 360 }, time: 20 * 50, damage: 4 },
      { cost: { gold: 900, lumber: 563 }, time: 20 * 68, damage: 5 },
    ],
  },
  fletching: {
    id: "fletching",
    name: "Fletching",
    host: "barracks",
    units: ["archer"],
    hotkey: "3",
    description: "Truer arrows. More damage and a longer reach.",
    levels: [
      { cost: { gold: 315, lumber: 248 }, time: 20 * 35, damage: 2, range: 0.5 },
      { cost: { gold: 540, lumber: 428 }, time: 20 * 50, damage: 3, range: 0.5 },
      { cost: { gold: 833, lumber: 653 }, time: 20 * 68, damage: 3, range: 1 },
    ],
  },
  sacredRites: {
    id: "sacredRites",
    name: "Sacred Rites",
    host: "church",
    units: ["priest"],
    hotkey: "1",
    description: "Deeper training lets Priests restore more health from farther behind the line.",
    levels: [
      { cost: { gold: 405, lumber: 180 }, time: 20 * 38, heal: 3, healRange: 0.5 },
      { cost: { gold: 675, lumber: 315 }, time: 20 * 55, heal: 4, healRange: 0.5 },
      { cost: { gold: 1035, lumber: 495 }, time: 20 * 72, heal: 5, healRange: 1.0 },
    ],
  },
  arcaneFocus: {
    id: "arcaneFocus",
    name: "Arcane Focus",
    host: "magetower",
    units: ["mage"],
    hotkey: "1",
    description: "Focus crystals strengthen Mage bolts and extend their reach.",
    levels: [
      { cost: { gold: 495, lumber: 225 }, time: 20 * 45, damage: 3, range: 0.25 },
      { cost: { gold: 855, lumber: 405 }, time: 20 * 62, damage: 4, range: 0.35 },
      { cost: { gold: 1305, lumber: 630 }, time: 20 * 82, damage: 5, range: 0.4 },
    ],
  },
  siegecraft: {
    id: "siegecraft",
    name: "Siegecraft",
    host: "foundry",
    units: ["ballista", "cannon"],
    hotkey: "1",
    description: "Better torsion, castings and armour make Human siege weapons hit harder and survive counter-fire.",
    levels: [
      { cost: { gold: 585, lumber: 405 }, time: 20 * 50, damage: 6, armour: 1 },
      { cost: { gold: 990, lumber: 675 }, time: 20 * 70, damage: 8, armour: 1 },
      { cost: { gold: 1530, lumber: 1013 }, time: 20 * 92, damage: 10, armour: 2 },
    ],
  },
  navalGunnery: {
    id: "navalGunnery",
    name: "Naval Gunnery",
    host: "shipyard",
    units: ["battleship", "submarine", "icebreaker"],
    hotkey: "1",
    description: "Improved sights, shells and torpedoes increase the fleet's striking power.",
    levels: [
      { cost: { gold: 675, lumber: 405, oil: 120 }, time: 20 * 55, damage: 5, range: 0.25 },
      { cost: { gold: 1125, lumber: 675, oil: 210 }, time: 20 * 75, damage: 7, range: 0.25 },
      { cost: { gold: 1710, lumber: 1035, oil: 330 }, time: 20 * 98, damage: 9, range: 0.5 },
    ],
  },
  aeronautics: {
    id: "aeronautics",
    name: "Aeronautics",
    host: "airfactory",
    units: ["scout", "bomber"],
    hotkey: "1",
    description: "Improved engines, airframes and weapons strengthen the mechanical air arm.",
    levels: [
      { cost: { gold: 540, lumber: 360, oil: 90 }, time: 20 * 48, damage: 3, armour: 1 },
      { cost: { gold: 923, lumber: 608, oil: 150 }, time: 20 * 66, damage: 4, armour: 1 },
      { cost: { gold: 1395, lumber: 923, oil: 240 }, time: 20 * 86, damage: 5, armour: 2 },
    ],
  },
  gryphonBarding: {
    id: "gryphonBarding",
    name: "Sky Barding",
    host: "gryphonaviary",
    units: ["gryphon"],
    hotkey: "1",
    description: "Light plate and reinforced tack let Gryphon Riders dive harder without losing speed.",
    levels: [
      { cost: { gold: 585, lumber: 338 }, time: 20 * 50, damage: 4, armour: 1 },
      { cost: { gold: 968, lumber: 563 }, time: 20 * 68, damage: 5, armour: 1 },
      { cost: { gold: 1463, lumber: 855 }, time: 20 * 90, damage: 6, armour: 2 },
    ],
  },
};

/** Upgrades a given building can research. */
export function upgradesFor(buildingDef: string): UpgradeDef[] {
  return Object.values(UPGRADES).filter((u) => u.host === buildingDef);
}

/** Total bonus a unit gets from a player's researched levels. */
export function researchBonus(
  unitDef: string,
  levels: Record<string, number>,
): { damage: number; armour: number; range: number; heal: number; healRange: number } {
  const out = { damage: 0, armour: 0, range: 0, heal: 0, healRange: 0 };
  for (const up of Object.values(UPGRADES)) {
    if (!up.units.includes(unitDef)) continue;
    const have = levels[up.id] ?? 0;
    for (let i = 0; i < have && i < up.levels.length; i++) {
      const lv = up.levels[i]!;
      out.damage += lv.damage ?? 0;
      out.armour += lv.armour ?? 0;
      out.range += lv.range ?? 0;
      out.heal += lv.heal ?? 0;
      out.healRange += lv.healRange ?? 0;
    }
  }
  return out;
}
