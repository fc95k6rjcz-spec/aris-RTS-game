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

import type { MapKind } from "../sim/map";
import { TOWNHALL_LEVELS } from "./levels";

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
  /** Map layout; plains unless the battle needs water. */
  kind?: MapKind;
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

/* ---- Chapters 2-10 --------------------------------------------------------
 * Each chapter opens one more Town Hall level and the buildings the hall needs
 * to reach it, so a chapter always teaches what the next one builds on.
 * Planes only arrive in Chapter 9; oil only where there is oil ground.
 */
const OPEN: Record<number, string[]> = {
  2: ["golddepot", "shelter", "torch"],
  3: ["church", "stables"],
  4: ["foundry", "magetower"],
  5: [],
  6: ["shipyard"],
  7: ["gryphonaviary"],
  8: [],
  9: ["oilrig", "refinery", "airfactory"],
  10: [],
};
function allowedFor(ch: number): string[] {
  const out = [...CH1_ALLOWED];
  for (let c = 2; c <= ch; c++) out.push(...(OPEN[c] ?? []));
  return out;
}
/** A purse that grows with the chapter. */
function purseFor(ch: number, more = 1): { gold: number; lumber: number; food: number } {
  return { gold: Math.round((1200 + ch * 500) * more), lumber: Math.round((800 + ch * 320) * more), food: Math.round((400 + ch * 80) * more) };
}
/** What it costs to raise a hall from level 1 to `to`, plus the chapter purse. */
function hallPurse(ch: number, to: number): { gold: number; lumber: number; food: number } {
  const base = purseFor(ch);
  for (const l of TOWNHALL_LEVELS) if (l.level > 1 && l.level <= to) { base.gold += l.cost.gold; base.lumber += l.cost.lumber; }
  return base;
}
/** n grunts, w dire wolves and b barbarians, mixed through the band. */
function band(n: number, w = 0, b = 0): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.max(n, w, b); i++) {
    if (i < n) out.push("grunt");
    if (i < w) out.push("direwolf");
    if (i < b) out.push("barbarian");
  }
  return out;
}
function many(def: string, n: number): string[] { return Array.from({ length: n }, () => def); }

type Draft = Omit<Battle, "id" | "chapter" | "seed" | "cap" | "allowed" | "purse"> & { purse?: Battle["purse"] };

function chapter(ch: number, drafts: Draft[]): Battle[] {
  return drafts.map((d, i) => ({
    ...d,
    id: (ch - 1) * 10 + i + 1,
    chapter: ch,
    seed: 1000 + ch * 100 + i + 1,
    cap: ch,
    allowed: allowedFor(ch),
    purse: d.purse ?? purseFor(ch),
  }));
}

function CHAPTERS_2_TO_10(): Battle[] {
  return [
    ...chapter(2, [
      { title: "The Second Bell", par: 480, purse: hallPurse(2, 2),
        story: "The village has outgrown its shack. Raise the hall into a proper Lodge.",
        goals: [{ kind: "hallLevel", level: 2 }] },
      { title: "Stone for the Walls", par: 420,
        story: "Quarrymen have found good stone. Wall the village and leave a gate for the carts.",
        goals: [{ kind: "build", def: "wall", count: 20 }, { kind: "build", def: "gate", count: 1 }] },
      { title: "The Gold Road", par: 480,
        story: "The mine is a long walk from the hall. Put a Gold Depot beside it and fill the treasury.",
        goals: [{ kind: "build", def: "golddepot", count: 1 }, { kind: "stock", res: "gold", amount: 3500 }] },
      { title: "Lights in the Dark", par: 420,
        story: "Things move in the forest at night. Light torches and raise towers to watch the treeline.",
        goals: [{ kind: "build", def: "torch", count: 3 }, { kind: "build", def: "tower", count: 2 }] },
      { title: "Bowmen of the Glade", par: 420,
        story: "Swords alone won't hold the treeline. Train archers who can strike first.",
        goals: [{ kind: "train", def: "archer", count: 6 }] },
      { title: "Bear Country", par: 420, wildlife: 24, army: many("footman", 3),
        story: "The bears are hungry and bold this spring. Hold the village for six minutes.",
        goals: [{ kind: "survive", seconds: 360 }, { kind: "build", def: "farm", count: 3 }] },
      { title: "Night Raiders", par: 420, army: many("footman", 2),
        raids: [
          { at: 90, defs: band(4), shout: "Orc raiders in the fields", role: "raid" },
          { at: 240, defs: band(5, 1), shout: "A second band is coming", role: "raid" },
        ],
        story: "Orcs strike after dark and run before dawn. Catch them both times.",
        goals: [{ kind: "clearHorde" }] },
      { title: "The Woodpile", par: 480,
        story: "Every house needs beams and every wall needs scaffolding. Two mills, and a full woodpile.",
        goals: [{ kind: "build", def: "lumbermill", count: 2 }, { kind: "stock", res: "lumber", amount: 2500 }] },
      { title: "Hold the Ford", par: 540, army: ["footman", "footman", "archer", "archer"],
        raids: [
          { at: 100, defs: band(4), shout: "Orcs at the ford", role: "raid" },
          { at: 220, defs: band(5, 1), shout: "More are wading across", role: "raid" },
          { at: 340, defs: band(6, 2), shout: "The war band crosses", role: "raid" },
        ],
        story: "Three bands mean to cross the river. Not one of them reaches the hall.",
        goals: [{ kind: "clearHorde" }] },
      { title: "The Rival Returns", par: 1000, enemy: "easy", size: 80,
        story: "The rival lord has rebuilt, stronger than before. Finish it this time.",
        goals: [{ kind: "destroy" }] },
    ]),

    ...chapter(3, [
      { title: "Timber and Stone", par: 600, purse: hallPurse(3, 3),
        story: "A Lodge is not a town. Raise the hall again; it will want a mill and a tower first.",
        goals: [{ kind: "hallLevel", level: 3 }] },
      { title: "The Chapel", par: 480,
        story: "The sick need tending and the dead need burying. Build a chapel and call priests.",
        goals: [{ kind: "build", def: "church", count: 1 }, { kind: "train", def: "priest", count: 2 }] },
      { title: "Horses from the South", par: 540,
        story: "Traders have brought warhorses up the long road. Build stables and mount your first knights.",
        goals: [{ kind: "build", def: "stables", count: 1 }, { kind: "train", def: "knight", count: 2 }] },
      { title: "Caravan Guards", par: 480, army: [...many("footman", 4), "archer", "archer"],
        raids: [
          { at: 60, defs: band(5), shout: "Orcs on the caravan road", role: "raid" },
          { at: 180, defs: band(6, 2), shout: "They've come back for the wagons", role: "raid" },
        ],
        story: "The caravans keep the town alive. Drive the Orcs off the road.",
        goals: [{ kind: "clearHorde" }] },
      { title: "Roadside Towers", par: 540,
        story: "A tower every mile and a wall where the road is narrow.",
        goals: [{ kind: "build", def: "tower", count: 4 }, { kind: "build", def: "wall", count: 15 }] },
      { title: "The Wolf Winter", par: 540, wildlife: 30, purse: { gold: 2200, lumber: 1600, food: 120 },
        story: "Deep snow, empty stores, and wolves in the lanes. Feed the town and see out the winter.",
        goals: [{ kind: "survive", seconds: 480 }, { kind: "build", def: "farm", count: 4 }] },
      { title: "Riders in the Dust", par: 600,
        story: "Mounted knights with bowmen behind them: the army the long road demands.",
        goals: [{ kind: "train", def: "knight", count: 4 }, { kind: "train", def: "archer", count: 4 }] },
      { title: "A Long Siege", par: 720, army: [...many("footman", 3), ...many("archer", 3)],
        raids: [
          { at: 100, defs: band(5), shout: "The siege begins", role: "raid" },
          { at: 220, defs: band(6, 1), shout: "Fresh Orcs at the walls", role: "raid" },
          { at: 340, defs: band(6, 2), shout: "They bring wolves", role: "raid" },
          { at: 460, defs: band(8, 2), shout: "The last assault", role: "raid" },
        ],
        story: "Ten minutes of attack after attack. Hold, and break every wave.",
        goals: [{ kind: "survive", seconds: 600 }, { kind: "clearHorde" }] },
      { title: "The Toll Bridge", par: 600,
        story: "The bridge earns gold from every traveller. Fill the strongroom and the timber yard.",
        goals: [{ kind: "stock", res: "gold", amount: 4500 }, { kind: "stock", res: "lumber", amount: 3000 }] },
      { title: "Lord of the Long Road", par: 1100, enemy: "normal", size: 80,
        story: "A lord in a stone hall taxes the road and hangs your traders. Pull down his hall.",
        goals: [{ kind: "destroy" }] },
    ]),

    ...chapter(4, [
      { title: "Bells of the Manor", par: 720, purse: hallPurse(4, 4),
        story: "A lord's hall needs a church and a stable. Raise the Manor Hall.",
        goals: [{ kind: "hallLevel", level: 4 }] },
      { title: "The Forge Fire", par: 600,
        story: "Smiths have come down from the hills. Light the foundry and cast your first cannon.",
        goals: [{ kind: "build", def: "foundry", count: 1 }, { kind: "train", def: "cannon", count: 2 }] },
      { title: "Students of the Arcane", par: 600,
        story: "Strange lights at the old tower. Rebuild it and train mages.",
        goals: [{ kind: "build", def: "magetower", count: 1 }, { kind: "train", def: "mage", count: 3 }] },
      { title: "Healers' March", par: 600, army: many("footman", 5),
        raids: [
          { at: 120, defs: band(6, 1), shout: "Orcs fall on the pilgrims", role: "raid" },
          { at: 260, defs: band(7, 2), shout: "They're back", role: "raid" },
        ],
        story: "The soldiers will hold only if someone heals them. Train priests and stand fast.",
        goals: [{ kind: "train", def: "priest", count: 4 }, { kind: "clearHorde" }] },
      { title: "Iron Wall", par: 660,
        story: "A wall with towers on it and gates you can close.",
        goals: [{ kind: "build", def: "wall", count: 30 }, { kind: "build", def: "gate", count: 2 }, { kind: "build", def: "tower", count: 4 }] },
      { title: "Cannon Fodder", par: 600, army: [...many("footman", 4), "cannon", "cannon"],
        raids: [
          { at: 90, defs: band(8), shout: "A great Orc host", role: "raid" },
          { at: 240, defs: band(8, 3), shout: "The host returns with wolves", role: "raid" },
        ],
        story: "Packed ranks of Orcs are exactly what cannon are for.",
        goals: [{ kind: "clearHorde" }] },
      { title: "The Pilgrims", par: 540, wildlife: 20,
        story: "Pilgrims are walking a dangerous road to you. Build them two churches and keep the beasts off.",
        goals: [{ kind: "survive", seconds: 420 }, { kind: "build", def: "church", count: 2 }] },
      { title: "Wizards' Duel", par: 1100, enemy: "normal", size: 72, army: ["mage", "mage"],
        story: "A rival lord has hired mages of his own. Yours are better.",
        goals: [{ kind: "destroy" }] },
      { title: "Iron Hoard", par: 720,
        story: "War is coming. Stock gold, timber and grain for a long one.",
        goals: [{ kind: "stock", res: "gold", amount: 6000 }, { kind: "stock", res: "lumber", amount: 4000 }, { kind: "stock", res: "food", amount: 1500 }] },
      { title: "The Iron Baron", par: 1200, enemy: "normal", size: 88,
        story: "The Iron Baron owns every forge in the north. Take them from him.",
        goals: [{ kind: "destroy" }] },
    ]),

    ...chapter(5, [
      { title: "A Castle at Last", par: 900, purse: hallPurse(5, 5),
        story: "Foundry and mage tower: the town is ready for a castle. Raise it.",
        goals: [{ kind: "hallLevel", level: 5 }] },
      { title: "Ring of Stone", par: 720,
        story: "Close the circle. Walls, gates and towers all the way round.",
        goals: [{ kind: "build", def: "wall", count: 40 }, { kind: "build", def: "gate", count: 4 }, { kind: "build", def: "tower", count: 4 }] },
      { title: "Siege Season", par: 780, army: [...many("footman", 4), ...many("archer", 4)],
        raids: [
          { at: 90, defs: band(6, 1), shout: "The siege season begins", role: "raid" },
          { at: 210, defs: band(7, 2), shout: "Ladders at the walls", role: "raid" },
          { at: 330, defs: band(8, 2, 2), shout: "Barbarians join the Orcs", role: "raid" },
          { at: 460, defs: band(10, 3, 2), shout: "The whole host is coming", role: "raid" },
        ],
        story: "Four assaults in one season. Ten minutes behind the walls.",
        goals: [{ kind: "survive", seconds: 600 }, { kind: "clearHorde" }] },
      { title: "The Town Watch", par: 660,
        story: "A walled town needs a garrison. Eight swords and six bows.",
        goals: [{ kind: "train", def: "footman", count: 8 }, { kind: "train", def: "archer", count: 6 }] },
      { title: "Sally Forth", par: 600, army: many("knight", 6),
        raids: [
          { at: 60, defs: band(8, 2), shout: "Orcs camp below the walls", role: "raid" },
          { at: 200, defs: band(8, 3), shout: "More pour in", role: "raid" },
          { at: 340, defs: band(10, 3, 2), shout: "Their chieftain rides out", role: "raid" },
        ],
        story: "Open the gates and ride them down.",
        goals: [{ kind: "clearHorde" }] },
      { title: "The Granary", par: 660,
        story: "A town that can't feed itself falls to the first siege. Eight farms and a full granary.",
        goals: [{ kind: "build", def: "farm", count: 8 }, { kind: "stock", res: "food", amount: 2500 }] },
      { title: "Night of Torches", par: 600,
        raids: [
          { at: 150, defs: band(6, 2), shout: "Shapes moving in the dark", role: "raid" },
          { at: 300, defs: band(8, 3), shout: "They're over the wall", role: "raid" },
        ],
        story: "Light every corner of the town and man the towers before the night attack.",
        goals: [{ kind: "build", def: "torch", count: 6 }, { kind: "build", def: "tower", count: 6 }, { kind: "clearHorde" }] },
      { title: "Masters of Siege", par: 720,
        story: "Cannon and ballistae: the engines that take castles.",
        goals: [{ kind: "train", def: "cannon", count: 4 }, { kind: "train", def: "ballista", count: 2 }] },
      { title: "The Breach", par: 1200, enemy: "normal", size: 80, army: many("cannon", 4),
        story: "The enemy hides behind stone. You brought cannon.",
        goals: [{ kind: "destroy" }] },
      { title: "The Walled King", par: 1400, enemy: "hard", size: 88,
        story: "A king in a castle as strong as yours. Only one of you keeps a crown.",
        goals: [{ kind: "destroy" }] },
    ]),

    ...chapter(6, [
      { title: "The Harbour", par: 600, kind: "lakeland",
        story: "The town has reached the water. Build a shipyard and launch your first boats.",
        goals: [{ kind: "build", def: "shipyard", count: 1 }, { kind: "train", def: "longboat", count: 2 }] },
      { title: "Stronghold", par: 1080, kind: "lakeland", purse: hallPurse(6, 6),
        story: "A harbour and a gold depot: the castle can become a Stronghold.",
        goals: [{ kind: "hallLevel", level: 6 }] },
      { title: "The Ferrymen", par: 720, kind: "lakeland",
        story: "Knights who can cross water win wars. Mount them and build the boats to carry them.",
        goals: [{ kind: "train", def: "transport", count: 2 }, { kind: "train", def: "knight", count: 4 }] },
      { title: "Battleships", par: 840, kind: "lakeland",
        story: "Longboats won't hold the lake. Build ships of the line.",
        goals: [{ kind: "build", def: "shipyard", count: 1 }, { kind: "train", def: "battleship", count: 2 }] },
      { title: "Cavalry Charge", par: 660, army: many("knight", 8),
        raids: [
          { at: 60, defs: band(10, 2), shout: "Orcs in the open", role: "raid" },
          { at: 200, defs: band(10, 3, 2), shout: "More on the hills", role: "raid" },
          { at: 340, defs: band(12, 4, 2), shout: "The great host", role: "raid" },
        ],
        story: "Open ground and a horde in the middle of it. Charge.",
        goals: [{ kind: "clearHorde" }] },
      { title: "Merchant Fleet", par: 840, kind: "lakeland",
        story: "Two shipyards and a treasury fat with lake trade.",
        goals: [{ kind: "build", def: "shipyard", count: 2 }, { kind: "stock", res: "gold", amount: 8000 }] },
      { title: "Under the Water", par: 840, kind: "lakeland",
        story: "Shipwrights swear a boat can sail beneath the waves. Prove it.",
        goals: [{ kind: "train", def: "submarine", count: 2 }] },
      { title: "The Horse Fair", par: 840,
        story: "Every lord in the land comes to see your horses. Show them ten knights.",
        goals: [{ kind: "build", def: "stables", count: 2 }, { kind: "train", def: "knight", count: 10 }] },
      { title: "Storm Coast", par: 780, kind: "lakeland", wildlife: 20, army: [...many("footman", 4), ...many("archer", 4)],
        raids: [
          { at: 120, defs: band(8, 2), shout: "Orcs land on the beach", role: "raid" },
          { at: 300, defs: band(10, 3, 2), shout: "Another landing", role: "raid" },
          { at: 480, defs: band(12, 4, 3), shout: "The whole Orc fleet", role: "raid" },
        ],
        story: "Bears in the dunes and Orcs on the beach. Ten minutes on the storm coast.",
        goals: [{ kind: "survive", seconds: 600 }, { kind: "clearHorde" }] },
      { title: "Admiral of the Lake", par: 1500, enemy: "hard", size: 96, kind: "lakeland",
        story: "The lake has room for one fleet. Sink his, then burn his town.",
        goals: [{ kind: "destroy" }] },
    ]),

    ...chapter(7, [
      { title: "Wings over the Keep", par: 1260, purse: hallPurse(7, 7),
        story: "Build the gryphon aviary and raise your Stronghold into a Keep.",
        goals: [{ kind: "hallLevel", level: 7 }] },
      { title: "Gryphon Riders", par: 780,
        story: "Gryphons hatched in the high crags. Raise the aviary and train riders.",
        goals: [{ kind: "build", def: "gryphonaviary", count: 1 }, { kind: "train", def: "gryphon", count: 3 }] },
      { title: "The Horde Rises", par: 780, army: [...many("footman", 6), ...many("archer", 4)],
        raids: [
          { at: 90, defs: band(8, 2), shout: "War drums in the east", role: "raid" },
          { at: 220, defs: band(10, 3), shout: "The Horde is coming", role: "raid" },
          { at: 360, defs: band(12, 4, 2), shout: "They don't stop", role: "raid" },
          { at: 500, defs: band(14, 4, 3), shout: "The Horde rises", role: "raid" },
        ],
        story: "The clans have united. Four great waves, one behind the other.",
        goals: [{ kind: "clearHorde" }] },
      { title: "Last Light", par: 900, army: [...many("footman", 4), ...many("knight", 4)],
        raids: [
          { at: 60, defs: band(6, 2), shout: "Dusk falls", role: "raid" },
          { at: 180, defs: band(8, 2, 2), shout: "They come with the dark", role: "raid" },
          { at: 300, defs: band(9, 3, 2), shout: "Midnight", role: "raid" },
          { at: 420, defs: band(10, 4, 3), shout: "The darkest hour", role: "raid" },
          { at: 560, defs: band(12, 4, 4), shout: "Before the dawn", role: "raid" },
        ],
        story: "Twelve minutes to sunrise. Keep the lights burning.",
        goals: [{ kind: "survive", seconds: 720 }, { kind: "clearHorde" }] },
      { title: "The Hunting Party", par: 720, wildlife: 30, army: many("gryphon", 4),
        raids: [
          { at: 90, defs: band(0, 6), shout: "Wolves on the hunt", role: "raid" },
          { at: 240, defs: band(2, 10), shout: "The great pack", role: "raid" },
        ],
        story: "Dire wolves are taking the herds. Hunt them from the sky.",
        goals: [{ kind: "clearHorde" }] },
      { title: "The Black Hand", par: 840, army: [...many("footman", 4), ...many("archer", 4), "cannon"],
        raids: [{ at: 300, defs: band(16, 4), shout: "The Black Hand war band", role: "raid" }],
        story: "The Black Hand comes in five minutes with twenty warriors. Be ready.",
        goals: [{ kind: "clearHorde" }] },
      { title: "Shield Wall", par: 900,
        story: "Fifty walls and eight towers. Let the Horde break its teeth on them.",
        goals: [{ kind: "build", def: "wall", count: 50 }, { kind: "build", def: "tower", count: 8 }] },
      { title: "The Muster of Kings", par: 1080,
        story: "Every banner in the land answers your call.",
        goals: [{ kind: "train", def: "footman", count: 12 }, { kind: "train", def: "archer", count: 8 }, { kind: "train", def: "knight", count: 6 }] },
      { title: "Two Fronts", par: 1500, enemy: "normal", size: 88,
        raids: [
          { at: 240, defs: band(8, 2), shout: "Orcs from the north", role: "raid" },
          { at: 600, defs: band(10, 3, 2), shout: "The Horde joins the war", role: "raid" },
        ],
        story: "A rival lord in the west and the Horde in the north. Beat both.",
        goals: [{ kind: "destroy" }, { kind: "clearHorde" }] },
      { title: "The Horde Warlord", par: 1080, army: [...many("knight", 6), ...many("archer", 6)],
        raids: [
          { at: 90, defs: band(10, 3), shout: "The Warlord's vanguard", role: "raid" },
          { at: 240, defs: band(12, 4, 2), shout: "The left wing", role: "raid" },
          { at: 390, defs: band(12, 4, 3), shout: "The right wing", role: "raid" },
          { at: 540, defs: band(14, 5, 3), shout: "The Warlord's guard", role: "raid" },
          { at: 690, defs: band(18, 6, 4), shout: "The Warlord himself", role: "raid" },
        ],
        story: "The Warlord brings everything he has. Break all five waves.",
        goals: [{ kind: "clearHorde" }] },
    ]),

    ...chapter(8, [
      { title: "The Mage Tower Ascendant", par: 900,
        story: "Two towers of the arcane, and a circle of mages to fill them.",
        goals: [{ kind: "build", def: "magetower", count: 2 }, { kind: "train", def: "mage", count: 8 }] },
      { title: "Arcane Defence", par: 780,
        raids: [
          { at: 180, defs: band(8, 2), shout: "Orcs test the wards", role: "raid" },
          { at: 360, defs: band(10, 3, 2), shout: "The wards are breaking", role: "raid" },
        ],
        story: "Towers and mages, ready before the wards fail.",
        goals: [{ kind: "build", def: "tower", count: 8 }, { kind: "train", def: "mage", count: 4 }, { kind: "clearHorde" }] },
      { title: "Spellfire", par: 720, army: [...many("mage", 6), ...many("footman", 4)],
        raids: [
          { at: 60, defs: band(10, 2), shout: "Massed Orcs", role: "raid" },
          { at: 200, defs: band(12, 3), shout: "Packed even tighter", role: "raid" },
          { at: 340, defs: band(14, 4, 2), shout: "A wall of axes", role: "raid" },
        ],
        story: "The Orcs march shoulder to shoulder. Spellfire splashes.",
        goals: [{ kind: "clearHorde" }] },
      { title: "Sky Patrol", par: 900,
        story: "Six gryphon riders to watch every road in the realm.",
        goals: [{ kind: "train", def: "gryphon", count: 6 }] },
      { title: "Battle Priests", par: 900,
        story: "Knights who never fall, because priests ride behind them.",
        goals: [{ kind: "train", def: "priest", count: 6 }, { kind: "train", def: "knight", count: 8 }] },
      { title: "The Burning Wood", par: 840, wildlife: 30, army: [...many("knight", 4), ...many("mage", 4)],
        raids: [
          { at: 150, defs: band(8, 4), shout: "Smoke in the forest", role: "raid" },
          { at: 330, defs: band(10, 5, 2), shout: "The wood is burning", role: "raid" },
          { at: 500, defs: band(12, 6, 3), shout: "They come through the flames", role: "raid" },
        ],
        story: "The Orcs have set the forest alight and the beasts are fleeing toward you.",
        goals: [{ kind: "survive", seconds: 600 }, { kind: "clearHorde" }] },
      { title: "The Wizards' Treasury", par: 1080,
        story: "Magic is expensive. Fill the vaults.",
        goals: [{ kind: "stock", res: "gold", amount: 12000 }, { kind: "stock", res: "lumber", amount: 8000 }] },
      { title: "The Grey Council", par: 1500, enemy: "hard", size: 88,
        story: "The Grey Council says no lord should have mages but them. Answer them.",
        goals: [{ kind: "destroy" }] },
      { title: "Storm of Wings", par: 900, army: [...many("gryphon", 6), ...many("archer", 4)],
        raids: [
          { at: 90, defs: band(10, 4), shout: "Orcs on every road", role: "raid" },
          { at: 250, defs: band(12, 5, 3), shout: "More from the hills", role: "raid" },
          { at: 410, defs: band(16, 6, 4), shout: "The Horde in full", role: "raid" },
        ],
        story: "The roads are full of Orcs. The sky is yours.",
        goals: [{ kind: "clearHorde" }] },
      { title: "The Archmage", par: 1800, enemy: "hard", size: 96, army: many("mage", 4),
        raids: [
          { at: 300, defs: band(10, 3, 2), shout: "The Archmage summons the Horde", role: "raid" },
          { at: 720, defs: band(14, 4, 3), shout: "A second summoning", role: "raid" },
        ],
        story: "The Archmage has bound the Horde to his will. Break him and his army.",
        goals: [{ kind: "destroy" }, { kind: "clearHorde" }] },
    ]),

    ...chapter(9, [
      { title: "Black Gold", par: 900,
        story: "Dark pools are seeping through the grass. Sink a well on the oil ground and refine it.",
        goals: [{ kind: "build", def: "oilrig", count: 1 }, { kind: "build", def: "refinery", count: 1 }] },
      { title: "The Citadel", par: 1500, purse: hallPurse(9, 8),
        story: "With oil flowing, the Keep can become a Citadel.",
        goals: [{ kind: "hallLevel", level: 8 }] },
      { title: "First Flight", par: 900,
        story: "Engineers say a machine can fly. Build the factory and the first scout plane.",
        goals: [{ kind: "build", def: "airfactory", count: 1 }, { kind: "train", def: "scout", count: 2 }] },
      { title: "Bombers", par: 960,
        story: "Planes that drop fire. Build four.",
        goals: [{ kind: "train", def: "bomber", count: 4 }] },
      { title: "The Fortress", par: 1800, purse: hallPurse(9, 9),
        story: "Oil, aeroplanes and every other trade the realm knows. Raise the Fortress.",
        goals: [{ kind: "hallLevel", level: 9 }] },
      { title: "Oil Barons", par: 1080,
        story: "Every seep on the map should be pumping for you.",
        goals: [{ kind: "build", def: "oilrig", count: 3 }, { kind: "build", def: "refinery", count: 2 }] },
      { title: "Air Raid", par: 900, army: [...many("bomber", 3), ...many("knight", 4)],
        raids: [
          { at: 90, defs: band(12, 3), shout: "Orcs in the valley", role: "raid" },
          { at: 250, defs: band(14, 4, 3), shout: "Another column", role: "raid" },
          { at: 410, defs: band(16, 5, 4), shout: "The whole Horde", role: "raid" },
        ],
        story: "The Horde marches in columns. Bombers love columns.",
        goals: [{ kind: "clearHorde" }] },
      { title: "The Iron Fleet", par: 1200, kind: "lakeland",
        story: "Oil-fired battleships and the tankers to fuel them.",
        goals: [{ kind: "train", def: "battleship", count: 4 }, { kind: "train", def: "tanker", count: 2 }] },
      { title: "Smoke on the Horizon", par: 1080, army: [...many("footman", 6), ...many("archer", 4), ...many("cannon", 2)],
        raids: [
          { at: 90, defs: band(10, 3), shout: "Smoke in the east", role: "raid" },
          { at: 240, defs: band(12, 4, 2), shout: "Smoke in the north", role: "raid" },
          { at: 390, defs: band(14, 4, 3), shout: "Smoke in the west", role: "raid" },
          { at: 540, defs: band(16, 5, 4), shout: "Smoke everywhere", role: "raid" },
          { at: 720, defs: band(20, 6, 4), shout: "The last of them", role: "raid" },
        ],
        story: "Fifteen minutes with the Horde coming from every side.",
        goals: [{ kind: "survive", seconds: 900 }, { kind: "clearHorde" }] },
      { title: "The Oil King", par: 1800, enemy: "hard", size: 96,
        story: "He owns the oil, the planes and half the realm. Take all of it.",
        goals: [{ kind: "destroy" }] },
    ]),

    ...chapter(10, [
      { title: "The Seat of Kings", par: 2400, purse: hallPurse(10, 10),
        story: "Every building, every trade, every tower. Raise the throne of the realm.",
        goals: [{ kind: "hallLevel", level: 10 }] },
      { title: "The Grand Army", par: 1500,
        story: "The greatest army the realm has ever seen, drawn up on one field.",
        goals: [{ kind: "train", def: "footman", count: 15 }, { kind: "train", def: "archer", count: 10 }, { kind: "train", def: "knight", count: 10 }] },
      { title: "Masters of the Sky", par: 1500,
        story: "Gryphons and bombers, wing to wing.",
        goals: [{ kind: "train", def: "bomber", count: 6 }, { kind: "train", def: "gryphon", count: 6 }] },
      { title: "The Endless Night", par: 1200, army: [...many("knight", 6), ...many("archer", 6), ...many("mage", 2)],
        raids: [
          { at: 60, defs: band(10, 3), shout: "Night falls", role: "raid" },
          { at: 200, defs: band(12, 4, 2), shout: "The Horde stirs", role: "raid" },
          { at: 340, defs: band(14, 4, 3), shout: "Midnight", role: "raid" },
          { at: 480, defs: band(16, 5, 4), shout: "The cold hour", role: "raid" },
          { at: 620, defs: band(18, 6, 4), shout: "No end to them", role: "raid" },
          { at: 760, defs: band(22, 6, 6), shout: "The last dark", role: "raid" },
        ],
        story: "The longest night of the year, and the Horde means to make it the last.",
        goals: [{ kind: "survive", seconds: 900 }, { kind: "clearHorde" }] },
      { title: "Two Kings", par: 1800, enemy: "hard", size: 96,
        story: "Another man calls himself King. There can only be one.",
        goals: [{ kind: "destroy" }] },
      { title: "Every Wall", par: 1200,
        story: "Sixty walls, six gates, ten towers. A kingdom nobody can walk into uninvited.",
        goals: [{ kind: "build", def: "wall", count: 60 }, { kind: "build", def: "gate", count: 6 }, { kind: "build", def: "tower", count: 10 }] },
      { title: "The Treasury of Ages", par: 1800,
        story: "A treasury that will outlast your grandchildren.",
        goals: [{ kind: "stock", res: "gold", amount: 20000 }, { kind: "stock", res: "lumber", amount: 15000 }, { kind: "stock", res: "food", amount: 5000 }] },
      { title: "The Horde's Last Stand", par: 1200, army: [...many("knight", 8), ...many("mage", 4), ...many("bomber", 2)],
        raids: [
          { at: 90, defs: band(14, 4), shout: "The Horde's last clans", role: "raid" },
          { at: 260, defs: band(16, 5, 4), shout: "Their shamans' guard", role: "raid" },
          { at: 430, defs: band(20, 6, 4), shout: "The Horde makes its stand", role: "raid" },
          { at: 600, defs: band(24, 8, 6), shout: "Every Orc left in the world", role: "raid" },
        ],
        story: "Finish the Horde for good.",
        goals: [{ kind: "clearHorde" }] },
      { title: "The Long War", par: 2400, enemy: "hard", size: 104,
        raids: [
          { at: 300, defs: band(12, 4, 2), shout: "The Horde takes his side", role: "raid" },
          { at: 900, defs: band(16, 5, 4), shout: "More Orcs for the false king", role: "raid" },
        ],
        story: "A rival king has made a pact with the Horde. Win the war that decides the realm.",
        goals: [{ kind: "destroy" }, { kind: "clearHorde" }] },
      { title: "King of the Realm", par: 3000, enemy: "hard", size: 112, purse: hallPurse(10, 10),
        raids: [
          { at: 420, defs: band(14, 4, 3), shout: "The Horde gathers", role: "raid" },
          { at: 1080, defs: band(20, 6, 6), shout: "The final Horde", role: "raid" },
        ],
        story: "The last battle. Raise the Seat of Kings, drive out the Horde, and pull down the last rival throne.",
        goals: [{ kind: "hallLevel", level: 10 }, { kind: "clearHorde" }, { kind: "destroy" }] },
    ]),
  ];
}

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
  ...CHAPTERS_2_TO_10(),
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
