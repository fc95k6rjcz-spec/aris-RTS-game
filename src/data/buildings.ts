import type { Cost } from "../sim/types";

export interface BuildingDef {
  id: string;
  name: string;
  /** Only a royal unit may place this. */
  royalOnly?: boolean;
  /** Faction-specific display names (falls back to `name`). */
  names?: Record<string, string>;
  hotkey: string;
  /** Footprint in tiles (square). */
  size: number;
  cost: Cost;
  hp: number;
  /** Ticks to construct with one worker (20 ticks = 1s). */
  buildTime: number;
  /** Unit ids this building can train. */
  trains: string[];
  /** Buildings required (completed) before this can be placed. */
  requires: string[];
  /** Resource drop-off point for these resources. */
  dropOff: ("gold" | "lumber")[];
  /** Supply (food) provided. */
  supply: number;
  /** Must touch water on at least one edge (docks). Trained units spawn on water. */
  coastal: boolean;
  description: string;
}

export const BUILDINGS: Record<string, BuildingDef> = {
  townhall: {
    id: "townhall",
    name: "Town Hall",
    hotkey: "H",
    size: 4,
    cost: { gold: 400, lumber: 250 },
    hp: 1200,
    buildTime: 20 * 60,
    trains: ["worker", "prince"],
    requires: [],
    dropOff: ["gold", "lumber"],
    supply: 12,
    royalOnly: true,
    coastal: false,
    description: "Trains Workers. Drop-off for gold and lumber. Provides supply.",
  },
  farm: {
    id: "farm",
    name: "Farm",
    hotkey: "Z",
    size: 4,
    cost: { gold: 120, lumber: 90 },
    hp: 500,
    buildTime: 20 * 32,
    trains: [],
    requires: ["townhall"],
    dropOff: [],
    supply: 0,
    coastal: false,
    description: "Feeds your kingdom. Each tier supports a larger army.",
  },
  golddepot: {
    id: "golddepot",
    name: "Gold Depot",
    hotkey: "G",
    size: 4,
    cost: { gold: 300, lumber: 260 },
    hp: 900,
    buildTime: 20 * 55,
    trains: [],
    requires: ["townhall"],
    dropOff: ["gold"],
    supply: 0,
    coastal: false,
    description: "Gold drop-off. Ore delivered here is worth a quarter more — build it beside a mine.",
  },
  lumbermill: {
    id: "lumbermill",
    name: "Lumber Mill",
    hotkey: "L",
    size: 3,
    cost: { gold: 120, lumber: 0 },
    hp: 600,
    buildTime: 20 * 35,
    trains: [],
    requires: ["townhall"],
    dropOff: ["lumber"],
    supply: 0,
    coastal: false,
    description: "Drop-off for lumber. Build it close to the forest.",
  },
  barracks: {
    id: "barracks",
    name: "Barracks",
    hotkey: "B",
    size: 3,
    cost: { gold: 200, lumber: 120 },
    hp: 800,
    buildTime: 20 * 45,
    trains: ["footman", "archer", "ballista"],
    requires: ["townhall"],
    dropOff: [],
    supply: 0,
    coastal: false,
    description: "Trains Footmen and Archers.",
  },
  shipyard: {
    id: "shipyard",
    name: "Shipyard",
    hotkey: "S",
    size: 3,
    cost: { gold: 250, lumber: 200 },
    hp: 900,
    buildTime: 20 * 50,
    trains: ["longboat", "transport", "tanker", "icebreaker", "submarine", "battleship"],
    requires: ["lumbermill"],
    dropOff: [],
    supply: 0,
    coastal: true,
    description: "Must be built on the shoreline. Trains Longboats.",
  },

  church: {
    id: "church",
    name: "Church",
    hotkey: "C",
    size: 3,
    cost: { gold: 260, lumber: 160 },
    hp: 700,
    buildTime: 20 * 50,
    trains: [],
    requires: ["townhall"],
    dropOff: [],
    supply: 0,
    coastal: false,
    description: "Heals nearby friendly units. Higher tiers heal faster and reach further.",
  },
  oilrig: {
    id: "oilrig",
    name: "Oil Rig",
    hotkey: "O",
    size: 3,
    cost: { gold: 240, lumber: 220 },
    hp: 700,
    buildTime: 20 * 55,
    trains: [],
    requires: ["shipyard"],
    dropOff: [],
    supply: 0,
    coastal: true,
    description: "Built on the shoreline. Pumps crude oil every second.",
  },
  refinery: {
    id: "refinery",
    name: "Oil Refinery",
    hotkey: "R",
    size: 3,
    cost: { gold: 280, lumber: 240 },
    hp: 800,
    buildTime: 20 * 58,
    trains: [],
    requires: ["oilrig"],
    dropOff: [],
    supply: 0,
    coastal: false,
    description: "Multiplies the oil every rig you own produces.",
  },
  stables: {
    id: "stables",
    name: "Stables",
    hotkey: "E",
    size: 3,
    cost: { gold: 240, lumber: 180 },
    hp: 750,
    buildTime: 20 * 48,
    trains: ["knight"],
    requires: ["barracks"],
    dropOff: [],
    supply: 0,
    coastal: false,
    description: "Trains fast, hard-hitting cavalry.",
  },
  magetower: {
    id: "magetower",
    name: "Mage Tower",
    hotkey: "M",
    size: 3,
    cost: { gold: 320, lumber: 200 },
    hp: 650,
    buildTime: 20 * 60,
    trains: ["mage"],
    requires: ["church"],
    dropOff: [],
    supply: 0,
    coastal: false,
    description: "Trains Mages and reveals the ground around it. Tiers raise spell power.",
  },
  foundry: {
    id: "foundry",
    name: "Foundry",
    hotkey: "F",
    size: 3,
    cost: { gold: 300, lumber: 200 },
    hp: 900,
    buildTime: 20 * 55,
    trains: ["cannon"],
    requires: ["barracks"],
    dropOff: [],
    supply: 0,
    coastal: false,
    description: "Plates your units in armour and casts Cannons. Every tier adds max HP to all your units.",
  },
  airfactory: {
    id: "airfactory",
    name: "Aeroplane Factory",
    hotkey: "P",
    size: 4,
    cost: { gold: 420, lumber: 320 },
    hp: 1000,
    buildTime: 20 * 70,
    trains: ["scout", "bomber"],
    requires: ["barracks"],
    dropOff: [],
    supply: 0,
    coastal: false,
    description: "Builds aircraft, which fly over water, forest and rock.",
  },
  tower: {
    id: "tower",
    name: "Watch Tower",
    hotkey: "T",
    size: 2,
    cost: { gold: 140, lumber: 90 },
    hp: 500,
    buildTime: 20 * 30,
    trains: [],
    requires: ["barracks"],
    dropOff: [],
    supply: 0,
    coastal: false,
    description: "Watches the ground around it. Higher tiers see further.",
  },
  // ───────────────────────────── the Blackrock ─────────────────────────────
  //
  // Deliberately absent from BUILD_BASIC and BUILD_ADVANCED below, which is the
  // whole of what stops a player raising one: the build menu is an explicit
  // list, not a filter over this table.

  stronghold: {
    id: "stronghold",
    name: "Stronghold",
    hotkey: "",
    size: 4,
    // Not for sale. A camp arrives with the map.
    cost: { gold: 0, lumber: 0 },
    hp: 1500,
    buildTime: 20 * 60,
    // A camp replaces what it loses, slowly, which is why clearing one is a
    // job you finish rather than a job you start.
    trains: ["grunt", "axethrower", "wargrider", "ogre"],
    requires: [],
    dropOff: [],
    supply: 0,
    coastal: false,
    description: "The heart of a Blackrock war camp. Pull it down and the camp stops coming back.",
  },
  warhut: {
    id: "warhut",
    name: "War Hut",
    hotkey: "",
    size: 2,
    cost: { gold: 0, lumber: 0 },
    hp: 450,
    buildTime: 20 * 30,
    trains: ["grunt"],
    requires: [],
    dropOff: [],
    supply: 0,
    coastal: false,
    description: "Hide, bone and sharpened timber. Turns out grunts for as long as it stands.",
  },
};

/** Display name for a building in a given faction's language. */
export function buildingName(def: string, faction: string): string {
  const d = BUILDINGS[def];
  return d ? (d.names?.[faction] ?? d.name) : def;
}

/**
 * The build menu is split across two pages because thirteen buildings do not fit
 * the nine slots of a 3 x 3 command card: seven basic structures plus a "More"
 * button, and the advanced structures behind it plus "Back".
 */
/**
 * The command card holds fifteen slots: twelve for structures, and a fixed bottom
 * row of Attack, Stop and the page toggle. Twelve of the fourteen buildings fit on
 * the first page; the rest sit behind "More".
 */
/**
 * The two build tabs.
 *
 * Split six and eight rather than twelve and two. Twelve tiles in one grid was
 * the "thirteen-button wall" the interface was redesigned to get rid of: at
 * that count each tile is too small to carry its own cost and hotkey, which is
 * exactly the information you need to decide between them. Six is the first
 * things you build in any match; everything with a prerequisite behind it is a
 * tab away.
 */
export const BUILD_BASIC: string[] = ["townhall", "farm", "lumbermill", "golddepot", "barracks", "tower"];
export const BUILD_ADVANCED: string[] = ["church", "stables", "shipyard", "magetower", "foundry", "oilrig", "refinery", "airfactory"];
export const BUILD_MENU: string[] = [...BUILD_BASIC, ...BUILD_ADVANCED];
