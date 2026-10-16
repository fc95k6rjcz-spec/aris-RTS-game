/**
 * The eras of the realm.
 *
 * Your Town Hall's level is your era. Raising the hall carries the whole
 * kingdom forward and unlocks the next era's buildings and units, so swords
 * and bows come first and aeroplanes only at the very end.
 *
 * Anything not listed here (walls, gates, torches, the shelter, the Town Hall
 * itself, workers, Kings and Princes) is there from the start.
 */
export interface EraDef {
  /** 1-based era number. */
  n: number;
  name: string;
  /** The Town Hall level that begins this era. */
  hall: number;
  blurb: string;
  buildings: readonly string[];
  units: readonly string[];
}

export const ERAS: readonly EraDef[] = [
  {
    n: 1, name: "Village Era", hall: 1,
    blurb: "Swords, bows and a field to feed them.",
    buildings: ["farm", "lumbermill", "barracks", "tower"],
    units: ["footman", "archer"],
  },
  {
    n: 2, name: "Castle Era", hall: 3,
    blurb: "Knights ride out, priests heal, and the first ships take to the water.",
    buildings: ["stables", "church", "shipyard", "golddepot"],
    units: ["knight", "priest", "ballista", "longboat", "icebreaker"],
  },
  {
    n: 3, name: "Kingdom Era", hall: 6,
    blurb: "Mages and cannon, oil from the ground, steel ships, and gryphons in the sky.",
    buildings: ["magetower", "foundry", "oilrig", "refinery", "gryphonaviary"],
    units: ["mage", "cannon", "gryphon", "transport", "tanker", "battleship"],
  },
  {
    n: 4, name: "Age of Flight", hall: 9,
    blurb: "Engines and wings: the aeroplane changes everything.",
    buildings: ["airfactory"],
    units: ["scout", "bomber", "submarine"],
  },
];

const ERA_OF = new Map<string, EraDef>();
for (const e of ERAS) for (const id of [...e.buildings, ...e.units]) ERA_OF.set(id, e);

/** The era a building or unit belongs to, or undefined if it is there from the start. */
export function eraOf(id: string): EraDef | undefined {
  return ERA_OF.get(id);
}

/** The era a Town Hall level puts you in. */
export function eraForHall(level: number): EraDef {
  let era = ERAS[0]!;
  for (const e of ERAS) if (level >= e.hall) era = e;
  return era;
}

/** The era that begins at exactly this hall level, if one does. */
export function eraStartingAt(level: number): EraDef | undefined {
  return ERAS.find((e) => e.hall === level && e.n > 1);
}
