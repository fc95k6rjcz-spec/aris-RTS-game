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
  wall: { id: "wall", name: "Wall", hotkey: "W", size: 1, cost: { gold: 23, lumber: 53 }, hp: 650, buildTime: 20 * 10, trains: [], requires: ["barracks"], dropOff: [], supply: 0, coastal: false, description: "Defensive stone wall. Kings build 50% faster and repair twice as quickly, without needing Barracks. Hold Shift to place more." },
  shelter: { id: "shelter", name: "Rain Shelter", hotkey: "S", size: 2, cost: { gold: 60, lumber: 105 }, hp: 260, buildTime: 20 * 15, trains: [], requires: [], dropOff: [], supply: 0, coastal: false, description: "Timber shelter. Idle allies within 3 tiles recover 1 health per second while it rains." },
  townhall: {
    id: "townhall",
    name: "Town Hall",
    hotkey: "H",
    size: 4,
    cost: { gold: 600, lumber: 375 },
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
    cost: { gold: 180, lumber: 135 },
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
    cost: { gold: 450, lumber: 390 },
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
    cost: { gold: 180, lumber: 0 },
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
    cost: { gold: 300, lumber: 180 },
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
    cost: { gold: 375, lumber: 300 },
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
    cost: { gold: 390, lumber: 240 },
    hp: 700,
    buildTime: 20 * 50,
    trains: ["priest"],
    requires: ["townhall"],
    dropOff: [],
    supply: 0,
    coastal: false,
    description: "Heals nearby friendly units and trains Priests. Higher tiers heal faster and reach further.",
  },
  oilrig: {
    id: "oilrig",
    name: "Oil Rig",
    hotkey: "O",
    size: 3,
    cost: { gold: 360, lumber: 330 },
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
    cost: { gold: 420, lumber: 360 },
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
    cost: { gold: 360, lumber: 270 },
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
    cost: { gold: 480, lumber: 300 },
    hp: 650,
    buildTime: 20 * 60,
    trains: ["mage"],
    requires: ["church"],
    dropOff: [],
    supply: 0,
    coastal: false,
    description: "Trains Mages and reveals the ground around it. Tiers raise spell power.",
  },
  gryphonaviary: {
    id: "gryphonaviary",
    name: "Gryphon Aviary",
    hotkey: "Y",
    size: 3,
    cost: { gold: 540, lumber: 390 },
    hp: 850,
    buildTime: 20 * 62,
    trains: ["gryphon"],
    requires: ["stables", "magetower"],
    dropOff: [],
    supply: 0,
    coastal: false,
    description: "Breeds and equips Gryphon Riders. Requires both cavalry craft and arcane training.",
  },
  foundry: {
    id: "foundry",
    name: "Foundry",
    hotkey: "F",
    size: 3,
    cost: { gold: 450, lumber: 300 },
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
    cost: { gold: 630, lumber: 480 },
    hp: 1000,
    buildTime: 20 * 70,
    trains: ["scout", "bomber"],
    requires: ["barracks"],
    dropOff: [],
    supply: 0,
    coastal: false,
    description: "Builds aircraft, which fly over water, forest and rock.",
  },
  torch: {
    id: "torch",
    name: "Torch",
    hotkey: "Q",
    size: 1,
    cost: { gold: 38, lumber: 30 },
    hp: 120,
    buildTime: 20 * 10,
    trains: [],
    requires: ["townhall"],
    dropOff: [],
    supply: 0,
    coastal: false,
    description: "Lights roads and bases at night. Upgrade it from a small torch into an enormous beacon with much greater light and vision.",
  },
  tower: {
    id: "tower",
    name: "Watch Tower",
    hotkey: "T",
    size: 3,
    cost: { gold: 210, lumber: 135 },
    hp: 500,
    buildTime: 20 * 30,
    trains: [],
    requires: ["barracks"],
    dropOff: [],
    supply: 0,
    coastal: false,
    description: "Defensive lookout. Automatically fires on enemy forces; higher tiers shoot farther, harder and more often.",
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
export const BUILD_BASIC: string[] = ["townhall", "farm", "lumbermill", "golddepot", "barracks", "tower", "torch", "wall", "shelter"];
export const BUILD_ADVANCED: string[] = ["church", "stables", "shipyard", "magetower", "gryphonaviary", "foundry", "oilrig", "refinery", "airfactory"];
export const BUILD_MENU: string[] = [...BUILD_BASIC, ...BUILD_ADVANCED];
