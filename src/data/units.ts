import type { Cost } from "../sim/types";

/**
 * How a unit crosses the map. "amphibious" walks like land but can also swim,
 * slowly — pathfinding prices water higher so a swimmer only takes to the water
 * when going round would be worse.
 */
export type Domain = "land" | "sea" | "air" | "amphibious" | "icebreaker";

export interface UnitDef {
  id: string;
  name: string;
  hotkey: string;
  cost: Cost;
  hp: number;
  /**
   * Sub-tile units per tick. 1 tile = 64 sub-units; 20 ticks/s.
   *
   * Men on foot sit around 6, which is a walk: about two tiles a second. They
   * used to be at 10 to 12, which is a dead sprint kept up indefinitely, and it
   * made the map feel small and the marches feel weightless. Horses are twice
   * that. A bear outruns every man on foot -- you do not outrun a bear, you
   * fight it or you have friends -- with one exception, and he does not run
   * from bears anyway. A crowned King is the quickest thing on two legs in the
   * game, which is deliberate: the opening is one man crossing a continent
   * alone and the player is watching every step of it.
   */
  speed: number;
  /** Ticks to train. */
  trainTime: number;
  supply: number;
  domain: Domain;
  canBuild: boolean;
  canGather: boolean;
  /** Amount of resource carried per trip. */
  carry: number;
  carryByResource?: { gold: number; lumber: number };
  /** Damage per attack. 0 means the unit cannot fight. */
  damage: number;
  /** Attack range in tiles. Anything above 1.5 fires a projectile. */
  range: number;
  /** Ticks between attacks. */
  cooldown: number;
  /** Flat damage subtracted from each hit taken. */
  armour: number;
  /** Amount restored when this support unit heals an ally. */
  heal?: number;
  /** Healing reach in tiles. */
  healRange?: number;
  /**
   * How far this unit sees, in tiles. Scouts and archers see further than they
   * shoot; siege engines are half blind and want a spotter.
   */
  sight?: number;
  /**
   * How many land units this hull can carry. Loaded units are held inside the
   * ship: they cannot be shot at, and they cannot shoot.
   */
  capacity?: number;
  /**
   * Runs below the surface. Nothing sees it except things standing almost on top
   * of it, which is the submarine's whole character: it is not tough, it is
   * unseen.
   */
  submerged?: boolean;
  /**
   * Can strike a submerged target. Almost nothing can: a submarine is fought by
   * the two things with a reason to look under the water -- a ballista's plunging
   * shot, and another submarine.
   */
  hitsSubmerged?: boolean;
  /** Grinds pack ice into open water, opening a lane for the rest of the fleet. */
  breaksIce?: boolean;
  /**
   * Wildlife. Belongs to nobody, wanders its own patch of country, and goes for
   * anything that comes too close.
   */
  beast?: boolean;
  /**
   * Runs rather than fights.
   *
   * A skittish beast bolts from anything that comes near and keeps bolting
   * while it is being chased, which is what makes hunting a thing you do rather
   * than a thing that happens to you.
   */
  skittish?: boolean;
  /** Meat, to whoever kills it. */
  food?: number;
  /** Gold paid to whoever kills this, for the hide. */
  bounty?: number;
  /**
   * Only a unit with this may found a Town Hall. It is the whole point of the
   * royal line: expanding means walking your most valuable piece across
   * contested ground, or paying dearly for an heir to do it for you.
   */
  royal?: boolean;
  /**
   * How wide this unit's damage swings, as a fraction of `damage`. 0.3 means a
   * blow lands anywhere from 70% to 130% of the listed figure. A swordsman is
   * consistent; a cannon is not.
   */
  spread?: number;
  description: string;
  /** Faction-specific display names (falls back to `name`). */
  names?: Record<string, string>;
}

export function unitName(def: string, faction: string): string {
  const d = UNITS[def];
  return d ? (d.names?.[faction] ?? d.name) : def;
}

export const UNITS: Record<string, UnitDef> = {
  grunt: {id:"grunt",name:"Grunt",hotkey:"",cost: {gold: 0,lumber: 0},hp:145,speed:6,trainTime:0,supply:0,domain:"land",canBuild:false,canGather:false,carry:0,damage:16,range:1.1,cooldown:30,armour:2,sight:6,spread:.2,beast:true,bounty:40,description:"A brutal roaming enemy with a heavy axe."},
  direwolf: {id:"direwolf",name:"Dire Wolf",hotkey:"",cost: {gold: 0,lumber: 0},hp:160,speed:9,trainTime:0,supply:0,domain:"land",canBuild:false,canGather:false,carry:0,damage:18,range:1.1,cooldown:26,armour:1,sight:7,spread:.2,beast:true,bounty:45,description:"A fast woodland predator."},
  dragon: {id:"dragon",name:"Dragon",hotkey:"",cost: {gold: 0,lumber: 0},hp:700,speed:8,trainTime:0,supply:0,domain:"air",canBuild:false,canGather:false,carry:0,damage:38,range:4,cooldown:40,armour:4,sight:9,spread:.15,beast:true,bounty:250,description:"A rare late-game roaming threat with burning breath."},
  barbarian: { id:"barbarian",name:"Barbarian",hotkey:"",cost: {gold: 0,lumber: 0},hp:95,speed:6,trainTime:0,supply:0,domain:"land",canBuild:false,canGather:false,carry:0,damage:11,range:1.1,cooldown:28,armour:1,sight:6,spread:0,beast:true,bounty:25,description:"Roaming raider. Travels with a band and attacks intruders." },
  worker: {
    id: "worker",
    name: "Worker",
    hotkey: "W",
    cost: { gold: 90, lumber: 0 },
    hp: 40,
    speed: 6,
    trainTime: 20 * 15,
    supply: 1,
    domain: "amphibious",
    canBuild: true,
    canGather: true,
    carry: 100,
    carryByResource: { gold: 100, lumber: 50 },
    damage: 4,
    range: 1.0,
    cooldown: 22,
    armour: 0,
    sight: 5,
    spread: 0.5,
    description: "Builds, gathers, swims. Carries 100 gold or 50 wood per trip.",
  },
  footman: {
    id: "footman",
    name: "Footman",
    hotkey: "F",
    cost: { gold: 180, lumber: 0, food: 40 },
    hp: 120,
    speed: 6,
    trainTime: 20 * 20,
    supply: 2,
    domain: "land",
    canBuild: false,
    canGather: false,
    carry: 0,
    damage: 14,
    range: 1.0,
    cooldown: 18,
    armour: 2,
    sight: 6,
    spread: 0.22,
    description: "Sturdy melee infantry.",
  },
  archer: {
    id: "archer",
    name: "Archer",
    hotkey: "A",
    cost: { gold: 150, lumber: 60, food: 35 },
    hp: 70,
    speed: 7,
    trainTime: 20 * 22,
    supply: 2,
    domain: "land",
    canBuild: false,
    canGather: false,
    carry: 0,
    damage: 9,
    range: 5.0,
    cooldown: 24,
    armour: 0,
    sight: 8,
    spread: 0.3,
    description: "Ranged infantry.",
  },
  knight: {
    id: "knight",
    name: "Knight",
    hotkey: "K",
    cost: { gold: 300, lumber: 90, food: 70 },
    hp: 240,
    speed: 12,
    trainTime: 20 * 30,
    supply: 3,
    domain: "land",
    canBuild: false,
    canGather: false,
    carry: 0,
    damage: 22,
    range: 1.2,
    cooldown: 20,
    armour: 3,
    sight: 8,
    spread: 0.26,
    description: "Fast heavy cavalry. Rides down anything that cannot hold a line.",
  },
  mage: {
    id: "mage",
    name: "Mage",
    hotkey: "M",
    cost: { gold: 330, lumber: 60, food: 60 },
    hp: 65,
    speed: 6,
    trainTime: 20 * 35,
    supply: 2,
    domain: "land",
    canBuild: false,
    canGather: false,
    carry: 0,
    damage: 16,
    range: 6.0,
    cooldown: 34,
    armour: 0,
    sight: 9,
    spread: 0.35,
    description: "Fragile spellcaster. Arcane bolts splash through clustered enemies, and Mage Tower tiers amplify the spell.",
  },
  priest: {
    id: "priest",
    name: "Priest",
    hotkey: "P",
    cost: { gold: 255, lumber: 60, food: 45 },
    hp: 82,
    speed: 6,
    trainTime: 20 * 32,
    supply: 2,
    domain: "land",
    canBuild: false,
    canGather: false,
    carry: 0,
    damage: 0,
    range: 0,
    cooldown: 26,
    armour: 0,
    heal: 11,
    healRange: 5.5,
    sight: 8,
    spread: 0,
    description: "Support caster. Automatically heals the most wounded nearby ally and belongs behind the battle line.",
  },
  ballista: {
    id: "ballista",
    name: "Ballista",
    hotkey: "V",
    cost: { gold: 450, lumber: 330, food: 50 },
    hp: 150,
    speed: 4,
    trainTime: 20 * 45,
    supply: 4,
    domain: "land",
    canBuild: false,
    canGather: false,
    carry: 0,
    damage: 55,
    range: 8,
    cooldown: 70,
    armour: 0,
    sight: 5,
    spread: 0.4,
    hitsSubmerged: true,
    description: "Siege engine. Enormous reach, a punishing bolt, and the only shot on land that reaches a submarine.",
  },
  bear: {
    id: "bear",
    name: "Bear",
    hotkey: "",
    // Not trainable: bears are not recruited, they are met.
    cost: { gold: 0, lumber: 0 },
    hp: 260,
    speed: 14,
    trainTime: 0,
    supply: 0,
    domain: "land",
    canBuild: false,
    canGather: false,
    carry: 0,
    damage: 26,
    range: 1.2,
    cooldown: 22,
    armour: 2,
    sight: 7,
    spread: 0.45,
    beast: true,
    bounty: 60,
    description: "Wild, territorial, and more than a match for one man. Worth sixty gold in hide.",
  },
  deer: {
    id: "deer",
    name: "Deer",
    hotkey: "",
    // Not trainable: you do not recruit a deer, you hunt one.
    cost: { gold: 0, lumber: 0 },
    hp: 70,
    speed: 15,
    trainTime: 0,
    supply: 0,
    domain: "land",
    canBuild: false,
    canGather: false,
    carry: 0,
    // It will not fight. A cornered stag in a real wood would; a stag that
    // fights back here would just be a weaker bear, and the whole point of
    // putting deer on the map is that some of the wildlife is an opportunity
    // rather than a threat.
    damage: 0,
    range: 0,
    cooldown: 0,
    armour: 0,
    sight: 9,
    spread: 0.35,
    beast: true,
    skittish: true,
    food: 120,
    description: "Quick, watchful, and worth a great deal of meat to whoever can catch one.",
  },
  cow: {
    id: "cow",
    name: "Cow",
    hotkey: "",
    cost: { gold: 0, lumber: 0 },
    hp: 110,
    speed: 4,
    trainTime: 0,
    supply: 0,
    domain: "land",
    canBuild: false,
    canGather: false,
    carry: 0,
    damage: 0,
    range: 0,
    cooldown: 0,
    armour: 0,
    sight: 5,
    spread: 0.4,
    beast: true,
    food: 180,
    description: "Slow, placid and full of dinner. Wanders the open ground near water.",
  },
  king: {
    id: "king",
    name: "King",
    hotkey: "K",
    // Not trainable -- there is exactly one, and he arrives with you.
    cost: { gold: 0, lumber: 0 },
    hp: 520,
    // A King outpaces everything else on foot. He is one man crossing a
    // continent alone for the first part of the game, and the whole opening is
    // watching him do it.
    speed: 16,
    trainTime: 0,
    supply: 0,
    domain: "land",
    canBuild: true,
    canGather: false,
    royal: true,
    carry: 0,
    damage: 42,
    range: 1.2,
    cooldown: 16,
    armour: 6,
    sight: 8,
    spread: 0.3,
    description: "Your sovereign. Only he or a prince may found a Town Hall. Formidable, and mortal.",
  },
  prince: {
    id: "prince",
    name: "Prince",
    hotkey: "R",
    cost: { gold: 525, lumber: 180 },
    hp: 300,
    speed: 9,
    trainTime: 20 * 50,
    supply: 3,
    domain: "land",
    canBuild: true,
    canGather: false,
    royal: true,
    carry: 0,
    damage: 26,
    range: 1.2,
    cooldown: 18,
    armour: 4,
    sight: 8,
    spread: 0.3,
    description: "An heir. May found a Town Hall, and inherits the crown if the King falls.",
  },
  cannon: {
    id: "cannon",
    name: "Cannon",
    hotkey: "N",
    cost: { gold: 600, lumber: 270, food: 60 },
    hp: 180,
    speed: 3,
    trainTime: 20 * 55,
    supply: 5,
    domain: "land",
    canBuild: false,
    canGather: false,
    carry: 0,
    // Hits harder than the Ballista and reaches a tile less far, on a longer
    // reload: the two siege engines are a choice, not a straight upgrade.
    damage: 75,
    range: 7,
    cooldown: 90,
    armour: 2,
    sight: 5,
    spread: 0.5,
    description: "Heavy siege gun. Cast at the Foundry. Enormous punch, slow to reload, and helpless if reached.",
  },
  scout: {
    id: "scout",
    name: "Scout Plane",
    hotkey: "S",
    cost: { gold: 210, lumber: 135, oil: 30, food: 25 },
    hp: 90,
    speed: 22,
    trainTime: 20 * 25,
    supply: 2,
    domain: "air",
    canBuild: false,
    canGather: false,
    carry: 0,
    damage: 7,
    range: 3.0,
    cooldown: 16,
    armour: 0,
    sight: 12,
    spread: 0.3,
    description: "Fast flyer. Crosses water, forest and cliffs alike.",
  },
  bomber: {
    id: "bomber",
    name: "Bomber",
    hotkey: "B",
    cost: { gold: 390, lumber: 270, oil: 70, food: 45 },
    hp: 220,
    speed: 15,
    trainTime: 20 * 40,
    supply: 3,
    domain: "air",
    canBuild: false,
    canGather: false,
    carry: 0,
    damage: 34,
    range: 2.5,
    cooldown: 48,
    armour: 1,
    sight: 8,
    spread: 0.45,
    description: "Heavy aircraft. Slow, tough, and ignores the ground entirely.",
  },
  gryphon: {
    id: "gryphon",
    name: "Gryphon Rider",
    hotkey: "G",
    cost: { gold: 495, lumber: 210, food: 90 },
    hp: 285,
    speed: 17,
    trainTime: 20 * 48,
    supply: 4,
    domain: "air",
    canBuild: false,
    canGather: false,
    carry: 0,
    damage: 31,
    range: 1.4,
    cooldown: 30,
    armour: 2,
    sight: 10,
    spread: 0.3,
    description: "Elite fantasy air cavalry. Fast, durable and deadly when it dives onto exposed troops or siege.",
  },
  longboat: {
    id: "longboat",
    name: "Longboat",
    hotkey: "L",
    cost: { gold: 225, lumber: 180 },
    hp: 200,
    speed: 22,
    trainTime: 20 * 30,
    supply: 2,
    domain: "sea",
    canBuild: false,
    canGather: false,
    carry: 0,
    // Unarmed on purpose: she is eyes, not teeth. A scout that can also fight
    // gets used as a warship and dies, and then nobody knows anything.
    damage: 0,
    range: 0,
    cooldown: 0,
    armour: 2,
    sight: 14,
    spread: 0,
    description: "Scout. The fastest thing afloat and the furthest-seeing, and she carries no weapon at all. Needs no oil.",
  },
  transport: {
    id: "transport",
    name: "Transport",
    hotkey: "T",
    cost: { gold: 300, lumber: 270, oil: 60 },
    hp: 320,
    speed: 15,
    trainTime: 20 * 35,
    supply: 2,
    domain: "sea",
    canBuild: false,
    canGather: false,
    carry: 0,
    damage: 0,
    range: 0,
    cooldown: 0,
    armour: 3,
    sight: 8,
    spread: 0,
    capacity: 6,
    description: "Carries six across water and puts them ashore. Unarmed: send an escort.",
  },
  submarine: {
    id: "submarine",
    name: "Submarine",
    hotkey: "U",
    cost: { gold: 525, lumber: 150, oil: 220 },
    hp: 260,
    speed: 14,
    trainTime: 20 * 45,
    supply: 3,
    domain: "sea",
    canBuild: false,
    canGather: false,
    carry: 0,
    damage: 55,
    range: 6.0,
    cooldown: 55,
    armour: 1,
    sight: 10,
    spread: 0.35,
    submerged: true,
    hitsSubmerged: true,
    description: "Runs submerged. It can strike anything; only ballistae and other submarines can strike back.",
  },
  battleship: {
    id: "battleship",
    name: "Battleship",
    hotkey: "B",
    cost: { gold: 1350, lumber: 450, oil: 500 },
    hp: 1600,
    speed: 9,
    trainTime: 20 * 90,
    supply: 6,
    domain: "sea",
    canBuild: false,
    canGather: false,
    carry: 0,
    damage: 40,
    range: 9.0,
    cooldown: 100,
    armour: 6,
    sight: 12,
    spread: 0.5,
    description: "Outranges any shore battery and takes a beating. Forty a shell, fired slowly: she wins by staying afloat.",
  },
  tanker: {
    id: "tanker",
    name: "Oil Tanker",
    hotkey: "O",
    cost: { gold: 600, lumber: 375, oil: 100 },
    hp: 700,
    speed: 8,
    trainTime: 20 * 60,
    supply: 3,
    domain: "sea",
    canBuild: false,
    canGather: false,
    carry: 0,
    damage: 0,
    range: 0,
    cooldown: 0,
    armour: 4,
    sight: 7,
    spread: 0,
    description: "Runs crude from an offshore rig to the shore. Unarmed, enormous, and worth sinking.",
  },
  icebreaker: {
    id: "icebreaker",
    name: "Icebreaker",
    hotkey: "K",
    cost: { gold: 450, lumber: 300, oil: 180 },
    hp: 520,
    speed: 11,
    trainTime: 20 * 50,
    supply: 3,
    domain: "icebreaker",
    canBuild: false,
    canGather: false,
    carry: 0,
    damage: 20,
    range: 3.0,
    cooldown: 60,
    armour: 5,
    sight: 9,
    spread: 0.3,
    breaksIce: true,
    description: "Grinds pack ice into open water, and can drive her bow up a beach. Opens a lane no other hull can take.",
  },
};
