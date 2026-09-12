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
    levels: [{ cost: { gold: 300, lumber: 250 }, time: 20 * 60, ground: true }],
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
      { cost: { gold: 200, lumber: 150 }, time: 20 * 40, damage: 4, armour: 1 },
      { cost: { gold: 340, lumber: 260 }, time: 20 * 55, damage: 5, armour: 1 },
      { cost: { gold: 520, lumber: 400 }, time: 20 * 75, damage: 6, armour: 2 },
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
      { cost: { gold: 150, lumber: 90 }, time: 20 * 35, damage: 3 },
      { cost: { gold: 260, lumber: 160 }, time: 20 * 50, damage: 4 },
      { cost: { gold: 400, lumber: 250 }, time: 20 * 68, damage: 5 },
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
      { cost: { gold: 140, lumber: 110 }, time: 20 * 35, damage: 2, range: 0.5 },
      { cost: { gold: 240, lumber: 190 }, time: 20 * 50, damage: 3, range: 0.5 },
      { cost: { gold: 370, lumber: 290 }, time: 20 * 68, damage: 3, range: 1 },
    ],
  },
};

/** Upgrades a given building can research. */
export function upgradesFor(buildingDef: string): UpgradeDef[] {
  return Object.values(UPGRADES).filter((u) => u.host === buildingDef);
}

/** Total bonus a unit gets from a player's researched levels. */
export function researchBonus(unitDef: string, levels: Record<string, number>): { damage: number; armour: number; range: number } {
  const out = { damage: 0, armour: 0, range: 0 };
  for (const up of Object.values(UPGRADES)) {
    if (!up.units.includes(unitDef)) continue;
    const have = levels[up.id] ?? 0;
    for (let i = 0; i < have && i < up.levels.length; i++) {
      const lv = up.levels[i]!;
      out.damage += lv.damage ?? 0;
      out.armour += lv.armour ?? 0;
      out.range += lv.range ?? 0;
    }
  }
  return out;
}
