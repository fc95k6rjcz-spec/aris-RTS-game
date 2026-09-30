/**
 * Wars: the single-player campaign.
 *
 * A hundred battles in ten chapters. Each chapter raises the level cap by one,
 * so Chapter 1 is fought with nothing but level 1 buildings and Chapter 10 has
 * everything. A battle is a small map, a starting force, a set of goals and
 * sometimes an enemy -- the Orc Horde on a script, or a rival lord run by the AI.
 *
 * Win a battle to unlock the next. Stars for speed: three for beating par,
 * two for twice par, one for winning at all.
 */

export type WarGoal =
  | { kind: "build"; def: string; count: number }
  | { kind: "train"; def: string; count: number }
  | { kind: "stock"; res: "gold" | "lumber" | "food"; amount: number }
  | { kind: "survive"; seconds: number }
  | { kind: "clearHorde" }
  | { kind: "destroy" }
  | { kind: "hallLevel"; level: number };

export interface WarRaid {
  /** Seconds into the battle. */
  at: number;
  defs: string[];
  shout: string;
  role?: "scout" | "raid";
}

export interface Battle {
  id: number;
  chapter: number;
  title: string;
  story: string;
  goals: WarGoal[];
  /** Seconds for three stars. */
  par: number;
  /** Lose if the goals are not met by then. */
  timeLimit?: number;
  /** Highest level anything may be upgraded to. */
  cap: number;
  /** Buildings that may be raised; everything else is hidden. */
  allowed: string[];
  purse: { gold: number; lumber: number; food: number };
  /** Extra soldiers at the start, beside the hall. */
  army?: string[];
  /** Bears and wolves on the map. */
  wildlife?: number;
  raids?: WarRaid[];
  /** A rival lord, played by the AI. */
  enemy?: "easy" | "normal" | "hard";
  seed: number;
  size?: number;
}

export const CHAPTERS = [
  "The First Village",
  "Timber and Stone",
  "The Long Road",
  "Iron and Faith",
  "The Walled Town",
  "Horse and Harbour",
  "The Horde Rises",
  "Towers of the Mage",
  "Fire and Oil",
  "The Seat of Kings",
];

const CH1_ALLOWED = ["townhall", "farm", "barracks", "lumbermill", "tower", "wall", "gate"];
const START = { gold: 1200, lumber: 800, food: 400 };

export const BATTLES: Battle[] = [
  {
    id: 1, chapter: 1, title: "First Stones", seed: 1101, cap: 1, allowed: CH1_ALLOWED, purse: { gold: 1600, lumber: 1000, food: 400 }, par: 300,
    story: "A new hall on empty ground. Before anything else, a village needs food and men to guard it.",
    goals: [{ kind: "build", def: "barracks", count: 1 }, { kind: "build", def: "farm", count: 3 }],
  },
  {
    id: 2, chapter: 1, title: "Timber Season", seed: 1102, cap: 1, allowed: CH1_ALLOWED, purse: START, par: 300,
    story: "Winter is coming and the stores are thin. Raise a Lumber Mill and fill the woodpile.",
    goals: [{ kind: "build", def: "lumbermill", count: 1 }, { kind: "stock", res: "lumber", amount: 1500 }],
  },
  {
    id: 3, chapter: 1, title: "Gold in the Hills", seed: 1103, cap: 1, allowed: CH1_ALLOWED, purse: START, par: 300,
    story: "There is gold in the hills. Put more hands to the mine and fill the treasury.",
    goals: [{ kind: "train", def: "worker", count: 8 }, { kind: "stock", res: "gold", amount: 2500 }],
  },
  {
    id: 4, chapter: 1, title: "The Muster", seed: 1104, cap: 1, allowed: CH1_ALLOWED, purse: { gold: 2000, lumber: 1000, food: 500 }, par: 360,
    story: "Rumours of raiders. Call the men of the village to arms.",
    goals: [{ kind: "build", def: "barracks", count: 1 }, { kind: "train", def: "footman", count: 6 }],
  },
  {
    id: 5, chapter: 1, title: "Wolves at the Door", seed: 1105, cap: 1, allowed: CH1_ALLOWED, purse: START, par: 300, wildlife: 16,
    army: ["footman", "footman"],
    story: "The forest is full of wolves and bears this year. Hold the village for five minutes.",
    goals: [{ kind: "survive", seconds: 300 }, { kind: "build", def: "farm", count: 2 }],
  },
  {
    id: 6, chapter: 1, title: "Watch the Road", seed: 1106, cap: 1, allowed: CH1_ALLOWED, purse: { gold: 2200, lumber: 1600, food: 400 }, par: 420,
    story: "Travellers bring news of Orcs in the east. Put up watch towers and a wall.",
    goals: [{ kind: "build", def: "tower", count: 2 }, { kind: "build", def: "wall", count: 10 }],
  },
  {
    id: 7, chapter: 1, title: "Eyes in the Trees", seed: 1107, cap: 1, allowed: CH1_ALLOWED, purse: START, par: 360,
    army: ["footman", "footman", "footman"],
    raids: [
      { at: 60, defs: ["grunt", "grunt"], shout: "Orc scouts sighted", role: "raid" },
      { at: 150, defs: ["grunt", "grunt", "grunt"], shout: "More Orc scouts", role: "raid" },
    ],
    story: "Orc scouts are watching the village. Hunt every one of them down.",
    goals: [{ kind: "clearHorde" }],
  },
  {
    id: 8, chapter: 1, title: "Feed the Village", seed: 1108, cap: 1, allowed: CH1_ALLOWED, purse: { gold: 1600, lumber: 1200, food: 150 }, par: 420,
    story: "Hungry mouths and an empty granary. Build farms before the people starve.",
    goals: [{ kind: "build", def: "farm", count: 5 }, { kind: "stock", res: "food", amount: 800 }],
  },
  {
    id: 9, chapter: 1, title: "The First Raid", seed: 1109, cap: 1, allowed: CH1_ALLOWED, purse: { gold: 1800, lumber: 1200, food: 500 }, par: 480,
    army: ["footman", "footman"],
    raids: [{ at: 180, defs: ["grunt", "grunt", "grunt", "grunt", "direwolf", "grunt"], shout: "An Orc war band approaches", role: "raid" }],
    story: "An Orc war band is coming in three minutes. Build, train and drive them off.",
    goals: [{ kind: "clearHorde" }],
  },
  {
    id: 10, chapter: 1, title: "The Rival Lord", seed: 1110, cap: 1, allowed: CH1_ALLOWED, purse: START, par: 900, enemy: "easy", size: 80,
    story: "A rival lord has built his hall across the valley and means to take yours. Burn him out.",
    goals: [{ kind: "destroy" }],
  },
];

export const BATTLE_COUNT = 100;
export function battle(id: number): Battle | undefined { return BATTLES.find((b) => b.id === id); }

/** One line per goal, for the briefing. */
export function describeGoal(g: WarGoal, name: (def: string) => string): string {
  switch (g.kind) {
    case "build": return `Build ${g.count} ${name(g.def)}${g.count > 1 ? "s" : ""}`;
    case "train": return `Have ${g.count} ${name(g.def)}${g.count > 1 ? "s" : ""}`;
    case "stock": return `Store ${g.amount} ${g.res === "lumber" ? "wood" : g.res}`;
    case "survive": return `Hold out for ${Math.round(g.seconds / 60)} minutes`;
    case "clearHorde": return "Drive off every Orc";
    case "destroy": return "Destroy the rival lord";
    case "hallLevel": return `Raise your Town Hall to level ${g.level}`;
  }
}
