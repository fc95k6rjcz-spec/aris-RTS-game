/**
 * The weapon in the ground.
 *
 * A match does not begin with a king. It begins with one peasant, a purse, and
 * a rumour. Somewhere out past his own treeline lies the weapon his clan is
 * owed -- a sword for the Humans, an axe for the Dwarves, a spiked pick for the
 * Barbarians, a bow for the Elves, a brand for the Ashen -- and until he walks
 * to it and takes it up he is nobody. He cannot found a hall, because only the
 * royal line may found a hall, and there is no royal line yet.
 *
 * This is the whole reason the opening is worth playing. Every other game of
 * this kind starts you with a town and four workers and asks you to do the same
 * thing you did last time. This one starts you with a man in a wood, and the
 * first five minutes are about getting out of it.
 *
 * The weapon is placed outside the starting ring and under the fog, so it has to
 * be looked for rather than collected.
 */

import { Faction, type PlayerId } from "./types";

/** What each clan is looking for. */
export const WEAPON_OF: Record<Faction, { name: string; taken: string }> = {
  [Faction.Human]: { name: "sword", taken: "The sword is drawn. A King is born." },
  [Faction.Dwarf]: { name: "axe", taken: "The axe is lifted. A King is born." },
  [Faction.Barbarian]: { name: "spiked pick", taken: "The pick is hefted. A King is born." },
  [Faction.Elf]: { name: "bow", taken: "The bow is strung. A King is born." },
  [Faction.Ashen]: { name: "brand", taken: "The brand is lit. A King is born." },
  // The orcs are not a clan anybody plays, so no weapon waits in the ground for
  // them. The entry exists because the map is exhaustive over factions, and an
  // exhaustive map is the thing that will remind whoever makes them playable
  // that this is one of the places to look.
  [Faction.Orc]: { name: "cleaver", taken: "The cleaver is taken up. A warchief is made." },
};

/** One weapon, waiting in the ground for the man it belongs to. */
export interface Relic {
  /** Whose destiny this is. Another player's peasant walks straight past it. */
  owner: PlayerId;
  faction: Faction;
  /** Tile coordinates. */
  x: number;
  y: number;
  taken: boolean;
}

/** How close a man must come to take it up, in tiles. */
export const REACH = 1.4;
