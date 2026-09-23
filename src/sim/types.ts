// Core simulation types. Everything in the sim is integer-based so that the same
// command stream produces bit-identical state on every machine (lockstep-ready).

export type EntityId = number;
export type PlayerId = number;

/** Positions are in "sub-tile" units. 1 tile = SUB units. */
export const SUB = 64;

export interface Vec {
  x: number;
  y: number;
}

export const enum Tile {
  Grass = 0,
  Dirt = 1,
  Water = 2,
  Tree = 3,
  Gold = 4,
  Rock = 5,
  /**
   * Pack ice. Thick enough to walk on and thick enough to stop a hull: land
   * units cross it like ground, ships are turned back by it, and an Icebreaker
   * grinds it into open water. It is the only terrain in the game that one unit
   * can permanently change on purpose.
   */
  Ice = 6,
}

export const enum Resource {
  Gold = "gold",
  Lumber = "lumber",
  Oil = "oil",
}

export interface Cost {
  gold: number;
  lumber: number;
  /** Oil, pumped by Oil Rigs. Ships and aircraft need it. */
  oil?: number;
  /** Food, from farms and from hunting. Soldiers eat. */
  food?: number;
}

/**
 * Playable factions. Only the Humans exist today, but names, building art and unit
 * art all resolve per faction, so adding a second one is data and sprites rather
 * than new plumbing.
 */
export const enum Faction {
  /** Humans — stone keeps, timber halls. */
  Human = "human",
  /** Orcs — bone, hide and red war-banners. */
  Orc = "orc",
  /** Dwarves — deep halls, powder and iron. */
  Dwarf = "dwarf",
  /** Barbarians — no walls worth the name, and no patience either. */
  Barbarian = "barbarian",
  /** Elves — bowmen and long sight. */
  Elf = "elf",
  /** The Ashen — volcanic country, fire and cinder. */
  Ashen = "ashen",
}

export interface Player {
  id: PlayerId;
  faction: Faction;
  gold: number;
  lumber: number;
  oil: number;
  food: number;
  /** Researched upgrade levels, by upgrade id. */
  research: Record<string, number>;
  /** Colour used purely by the renderer. */
  color: string;
}
