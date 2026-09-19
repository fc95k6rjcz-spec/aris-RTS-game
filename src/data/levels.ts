import type { Cost } from "../sim/types";

/**
 * Town Hall tiers 1–10. Each level is a separate painted sprite; upgrading is a
 * timed job at the building (like training) that raises HP, supply and, later,
 * what the player may build.
 */
export interface LevelDef {
  level: number;
  name: string;
  blurb: string;
  /** Cost to upgrade INTO this level (level 1 is free — it's the starting hall). */
  cost: Cost;
  /** Ticks to upgrade into this level. */
  time: number;
  hp: number;
  supply: number;
  /** Sprite footprint multiplier — higher tiers sprawl beyond the base footprint. */
  scale: number;
  /** Extra resource per gather trip delivered to this drop-off (Lumber Mill). */
  bonusCarry?: number;
  /** Training speed multiplier for units made here (Barracks, Shipyard). */
  trainSpeed?: number;
  /** HP restored per tick to friendly units in range (Church). */
  heal?: number;
  /** Radius in tiles this building affects — healing, vision or light. */
  radius?: number;
  /** Local night-light strength, 0..1 (Torch/Beacon). */
  light?: number;
  /** Fractional max-HP bonus this tier grants to every unit the owner has. */
  armour?: number;
  /** Crude oil pumped each second (Oil Rig). */
  oilPerSecond?: number;
  /** Fractional bonus applied to all this player's oil output (Refinery). */
  refine?: number;
  /** Fractional bonus to spell damage and range for this player's casters (Mage Tower). */
  spellPower?: number;
}

export const TOWNHALL_LEVELS: LevelDef[] = [
  { level: 1, name: "Meeting Hall", blurb: "A humble wooden meeting hall for a small village.", cost: { gold: 0, lumber: 0 }, time: 0, hp: 1200, supply: 12, scale: 1.0 },
  { level: 2, name: "Timber Hall", blurb: "A larger timber hall with a stone foundation.", cost: { gold: 300, lumber: 200 }, time: 20 * 45, hp: 1500, supply: 16, scale: 1.06 },
  { level: 3, name: "Reinforced Hall", blurb: "Reinforced with stone and better protection.", cost: { gold: 450, lumber: 300 }, time: 20 * 55, hp: 1900, supply: 20, scale: 1.12 },
  { level: 4, name: "Guarded Hall", blurb: "A strong and solid hall with guard towers.", cost: { gold: 650, lumber: 420 }, time: 20 * 70, hp: 2400, supply: 25, scale: 1.18 },
  { level: 5, name: "Grand Hall", blurb: "A grand hall with multiple sections and upgraded defenses.", cost: { gold: 900, lumber: 560 }, time: 20 * 85, hp: 3000, supply: 30, scale: 1.24 },
  { level: 6, name: "Stronghold", blurb: "An impressive stronghold with advanced architecture.", cost: { gold: 1200, lumber: 720 }, time: 20 * 100, hp: 3700, supply: 36, scale: 1.3 },
  { level: 7, name: "Mighty Keep", blurb: "A mighty keep with expanded walls and watchtowers.", cost: { gold: 1550, lumber: 900 }, time: 20 * 115, hp: 4500, supply: 42, scale: 1.36 },
  { level: 8, name: "City Heart", blurb: "The heart of a prosperous city. Tall, proud and formidable.", cost: { gold: 1950, lumber: 1100 }, time: 20 * 130, hp: 5400, supply: 48, scale: 1.42 },
  { level: 9, name: "Legendary Fortress", blurb: "A legendary fortress. Built to withstand any siege.", cost: { gold: 2400, lumber: 1350 }, time: 20 * 150, hp: 6400, supply: 55, scale: 1.48 },
  { level: 10, name: "Seat of Power", blurb: "The ultimate symbol of power and leadership. Unmatched.", cost: { gold: 3000, lumber: 1650 }, time: 20 * 175, hp: 7500, supply: 64, scale: 1.55 },
];

/**
 * Lumber Mill tiers 1–10. Each level makes every lumber trip delivered here carry
 * more, so upgrading the mill is a direct economy investment.
 */
export const LUMBERMILL_LEVELS: LevelDef[] = [
  { level: 1, name: "Basic Sawmill", blurb: "A basic sawmill. Crude but functional.", cost: { gold: 0, lumber: 0 }, time: 0, hp: 600, supply: 0, scale: 1.0, bonusCarry: 0 },
  { level: 2, name: "Upgraded Sawmill", blurb: "Upgraded tools and a stronger roof improve production.", cost: { gold: 150, lumber: 100 }, time: 20 * 35, hp: 750, supply: 0, scale: 1.06, bonusCarry: 2 },
  { level: 3, name: "Reinforced Mill", blurb: "Reinforced structure with better equipment and storage.", cost: { gold: 240, lumber: 160 }, time: 20 * 45, hp: 950, supply: 0, scale: 1.12, bonusCarry: 4 },
  { level: 4, name: "Sawing Works", blurb: "Increased capacity and efficiency with advanced sawing technology.", cost: { gold: 360, lumber: 240 }, time: 20 * 55, hp: 1200, supply: 0, scale: 1.18, bonusCarry: 6 },
  { level: 5, name: "Established Mill", blurb: "A well-established mill with improved log handling.", cost: { gold: 500, lumber: 340 }, time: 20 * 65, hp: 1500, supply: 0, scale: 1.24, bonusCarry: 8 },
  { level: 6, name: "Machined Mill", blurb: "Stronger machinery and expanded storage for higher output.", cost: { gold: 680, lumber: 450 }, time: 20 * 80, hp: 1850, supply: 0, scale: 1.3, bonusCarry: 10 },
  { level: 7, name: "Engineered Mill", blurb: "Advanced engineering allows for faster processing.", cost: { gold: 880, lumber: 580 }, time: 20 * 95, hp: 2250, supply: 0, scale: 1.36, bonusCarry: 12 },
  { level: 8, name: "Master Mill", blurb: "A masterfully built mill with maximum sawing efficiency.", cost: { gold: 1120, lumber: 730 }, time: 20 * 110, hp: 2700, supply: 0, scale: 1.42, bonusCarry: 15 },
  { level: 9, name: "Mechanised Mill", blurb: "Top-tier mill with mechanized systems and high capacity.", cost: { gold: 1400, lumber: 900 }, time: 20 * 125, hp: 3200, supply: 0, scale: 1.48, bonusCarry: 18 },
  { level: 10, name: "Grand Lumberworks", blurb: "The finest lumber mill. Built for unmatched productivity.", cost: { gold: 1750, lumber: 1100 }, time: 20 * 145, hp: 3800, supply: 0, scale: 1.55, bonusCarry: 22 },
];

export const MAX_TOWNHALL_LEVEL = TOWNHALL_LEVELS.length;

/**
 * Barracks tiers 1–10. Higher tiers train infantry faster and take more punishment.
 */
export const BARRACKS_LEVELS: LevelDef[] = [
  { level: 1, name: "Training Hall", blurb: "A simple training hall for basic infantry. Sturdy but spartan.", cost: { gold: 0, lumber: 0 }, time: 0, hp: 800, supply: 0, scale: 1.0, trainSpeed: 1.0 },
  { level: 2, name: "Improved Barracks", blurb: "Improved structure with better defences and more space.", cost: { gold: 200, lumber: 130 }, time: 20 * 40, hp: 1000, supply: 0, scale: 1.06, trainSpeed: 1.08 },
  { level: 3, name: "Reinforced Barracks", blurb: "Reinforced barracks with room for more soldiers and training.", cost: { gold: 310, lumber: 200 }, time: 20 * 50, hp: 1250, supply: 0, scale: 1.12, trainSpeed: 1.16 },
  { level: 4, name: "Fortified Barracks", blurb: "Stronger fortifications and expanded quarters for veteran troops.", cost: { gold: 450, lumber: 290 }, time: 20 * 62, hp: 1550, supply: 0, scale: 1.18, trainSpeed: 1.25 },
  { level: 5, name: "Garrison", blurb: "A well-defended barracks with advanced facilities and weapon racks.", cost: { gold: 620, lumber: 400 }, time: 20 * 75, hp: 1900, supply: 0, scale: 1.24, trainSpeed: 1.35 },
  { level: 6, name: "War Quarters", blurb: "Enhanced training grounds and strong stone fortifications.", cost: { gold: 820, lumber: 530 }, time: 20 * 90, hp: 2300, supply: 0, scale: 1.3, trainSpeed: 1.45 },
  { level: 7, name: "Elite Barracks", blurb: "Elite barracks with advanced equipment and a larger garrison.", cost: { gold: 1050, lumber: 680 }, time: 20 * 105, hp: 2750, supply: 0, scale: 1.36, trainSpeed: 1.56 },
  { level: 8, name: "War Stronghold", blurb: "A mighty stronghold for elite soldiers. Built for war and endurance.", cost: { gold: 1320, lumber: 850 }, time: 20 * 120, hp: 3250, supply: 0, scale: 1.42, trainSpeed: 1.68 },
  { level: 9, name: "Citadel Barracks", blurb: "The peak of military architecture. Unmatched training and defence.", cost: { gold: 1630, lumber: 1050 }, time: 20 * 138, hp: 3800, supply: 0, scale: 1.48, trainSpeed: 1.8 },
  { level: 10, name: "War Barracks", blurb: "The ultimate war barracks. Forged for legends and built to never fall.", cost: { gold: 2000, lumber: 1280 }, time: 20 * 160, hp: 4400, supply: 0, scale: 1.55, trainSpeed: 2.0 },
];

/**
 * Shipyard tiers 1–10. Higher tiers launch ships faster and hold the dock better.
 */
export const SHIPYARD_LEVELS: LevelDef[] = [
  { level: 1, name: "Fishing Dock", blurb: "A basic shipyard. Used to build small fishing boats.", cost: { gold: 0, lumber: 0 }, time: 0, hp: 900, supply: 0, scale: 1.0, trainSpeed: 1.0 },
  { level: 2, name: "Boatyard", blurb: "Upgraded facilities allow construction of larger boats.", cost: { gold: 220, lumber: 180 }, time: 20 * 45, hp: 1120, supply: 0, scale: 1.06, trainSpeed: 1.08 },
  { level: 3, name: "Reinforced Yard", blurb: "Reinforced structures and better equipment improve ship quality.", cost: { gold: 340, lumber: 270 }, time: 20 * 55, hp: 1400, supply: 0, scale: 1.12, trainSpeed: 1.16 },
  { level: 4, name: "Warship Yard", blurb: "Increased capacity and advanced tools enable warship construction.", cost: { gold: 500, lumber: 390 }, time: 20 * 68, hp: 1750, supply: 0, scale: 1.18, trainSpeed: 1.25 },
  { level: 5, name: "Naval Yard", blurb: "A well-established shipyard with improved defences.", cost: { gold: 690, lumber: 530 }, time: 20 * 82, hp: 2150, supply: 0, scale: 1.24, trainSpeed: 1.35 },
  { level: 6, name: "Great Docks", blurb: "Stronger docks and more workspace for building larger ships.", cost: { gold: 910, lumber: 700 }, time: 20 * 98, hp: 2600, supply: 0, scale: 1.3, trainSpeed: 1.45 },
  { level: 7, name: "Shipwright Works", blurb: "Elite shipwrights and advanced technology increase productivity.", cost: { gold: 1170, lumber: 900 }, time: 20 * 115, hp: 3100, supply: 0, scale: 1.36, trainSpeed: 1.56 },
  { level: 8, name: "Master Shipyard", blurb: "A master shipyard capable of building powerful battleships.", cost: { gold: 1470, lumber: 1120 }, time: 20 * 132, hp: 3650, supply: 0, scale: 1.42, trainSpeed: 1.68 },
  { level: 9, name: "Admiralty Yard", blurb: "The pinnacle of naval engineering. Legendary ships are born here.", cost: { gold: 1810, lumber: 1380 }, time: 20 * 152, hp: 4250, supply: 0, scale: 1.48, trainSpeed: 1.8 },
  { level: 10, name: "Grand Armoury Docks", blurb: "The ultimate shipyard. Home of the mightiest fleet.", cost: { gold: 2200, lumber: 1680 }, time: 20 * 175, hp: 4900, supply: 0, scale: 1.55, trainSpeed: 2.0 },
];

/**
 * Church tiers 1-10. A church heals friendly units standing near it; higher tiers
 * heal faster and cover more ground.
 */
export const CHURCH_LEVELS: LevelDef[] = [
  { level: 1, name: "Wayside Chapel", blurb: "A small chapel for worship and healing. Humble but sacred.", cost: { gold: 0, lumber: 0 }, time: 20 * 0, hp: 700, supply: 0, scale: 1.0, heal: 1, radius: 4 },
  { level: 2, name: "Village Chapel", blurb: "A larger chapel with stronger walls and room for more worshippers.", cost: { gold: 180, lumber: 120 }, time: 20 * 40, hp: 880, supply: 0, scale: 1.06, heal: 1, radius: 4.5 },
  { level: 3, name: "Stone Church", blurb: "Reinforced structure with stained glass windows and a taller bell tower.", cost: { gold: 280, lumber: 190 }, time: 20 * 50, hp: 1100, supply: 0, scale: 1.12, heal: 2, radius: 5 },
  { level: 4, name: "Grand Church", blurb: "A grand church with ornate windows and improved comfort for the faithful.", cost: { gold: 400, lumber: 270 }, time: 20 * 62, hp: 1370, supply: 0, scale: 1.18, heal: 2, radius: 5.5 },
  { level: 5, name: "Abbey", blurb: "An established church with a larger hall and dedicated areas for prayer and study.", cost: { gold: 550, lumber: 370 }, time: 20 * 75, hp: 1690, supply: 0, scale: 1.24, heal: 3, radius: 6 },
  { level: 6, name: "Buttressed Abbey", blurb: "Enhanced architecture with flying buttresses and a towering spire.", cost: { gold: 730, lumber: 490 }, time: 20 * 90, hp: 2060, supply: 0, scale: 1.3, heal: 3, radius: 6.5 },
  { level: 7, name: "Minster", blurb: "A majestic church with intricate stone work and beautiful stained glass.", cost: { gold: 940, lumber: 630 }, time: 20 * 105, hp: 2480, supply: 0, scale: 1.37, heal: 4, radius: 7 },
  { level: 8, name: "Sanctuary", blurb: "A holy sanctuary with multiple spires and expanded worship halls.", cost: { gold: 1180, lumber: 790 }, time: 20 * 120, hp: 2950, supply: 0, scale: 1.43, heal: 4, radius: 7.5 },
  { level: 9, name: "Cathedral", blurb: "The pinnacle of spiritual architecture. A beacon of faith and hope.", cost: { gold: 1450, lumber: 970 }, time: 20 * 138, hp: 3470, supply: 0, scale: 1.49, heal: 5, radius: 8 },
  { level: 10, name: "Grand Cathedral", blurb: "The greatest church of all. A divine masterpiece that inspires all.", cost: { gold: 1760, lumber: 1180 }, time: 20 * 158, hp: 4050, supply: 0, scale: 1.55, heal: 6, radius: 9 },
];

/**
 * Watch Tower tiers 1-10. Towers reveal ground around them; higher tiers see
 * further and take far more punishment. (Attacks arrive with combat in M2.)
 */
export const TOWER_LEVELS: LevelDef[] = [
  { level: 1, name: "Wooden Tower", blurb: "A wooden watch tower for scouting and basic defence.", cost: { gold: 0, lumber: 0 }, time: 20 * 0, hp: 500, supply: 0, scale: 1.0, radius: 7 },
  { level: 2, name: "Braced Tower", blurb: "Stronger structure with improved height and better visibility.", cost: { gold: 110, lumber: 70 }, time: 20 * 28, hp: 630, supply: 0, scale: 1.06, radius: 7.8 },
  { level: 3, name: "Stone-Based Tower", blurb: "Reinforced tower with a stone base for added stability and defence.", cost: { gold: 170, lumber: 110 }, time: 20 * 35, hp: 790, supply: 0, scale: 1.12, radius: 8.6 },
  { level: 4, name: "Fortified Tower", blurb: "Upgraded fortifications with thicker walls and archer protection.", cost: { gold: 250, lumber: 160 }, time: 20 * 42, hp: 980, supply: 0, scale: 1.18, radius: 9.4 },
  { level: 5, name: "Advanced Tower", blurb: "Advanced tower with a larger platform and improved weapon mounts.", cost: { gold: 340, lumber: 220 }, time: 20 * 50, hp: 1200, supply: 0, scale: 1.24, radius: 10.2 },
  { level: 6, name: "High Tower", blurb: "Stronger masonry and higher elevation for extended range.", cost: { gold: 450, lumber: 290 }, time: 20 * 60, hp: 1460, supply: 0, scale: 1.3, radius: 11 },
  { level: 7, name: "Elite Tower", blurb: "Elite tower with reinforced armour and advanced projectile weapons.", cost: { gold: 580, lumber: 370 }, time: 20 * 70, hp: 1760, supply: 0, scale: 1.37, radius: 11.8 },
  { level: 8, name: "Beacon Tower", blurb: "Heavily fortified tower with magical fire beacons and enhanced range.", cost: { gold: 730, lumber: 470 }, time: 20 * 82, hp: 2100, supply: 0, scale: 1.43, radius: 12.6 },
  { level: 9, name: "Grand Watch Tower", blurb: "Grand watch tower with superior artillery and magical enhancements.", cost: { gold: 900, lumber: 580 }, time: 20 * 95, hp: 2480, supply: 0, scale: 1.49, radius: 13.4 },
  { level: 10, name: "Arcane Spire", blurb: "The ultimate watch tower. Unmatched range, defence and magical power.", cost: { gold: 1100, lumber: 700 }, time: 20 * 110, hp: 2900, supply: 0, scale: 1.55, radius: 14.5 },
];

/**
 * Torch / Beacon tiers 1-10.
 *
 * A tiny road torch grows into a major signal beacon. Radius drives both the
 * owner's vision and the visible pool of light at night; the light field controls
 * how strongly that pool pushes back the darkness.
 */
export const TORCH_LEVELS: LevelDef[] = [
  { level: 1, name: "Camp Torch", blurb: "A simple wooden torch. Enough light for a worker camp or road junction.", cost: { gold: 0, lumber: 0 }, time: 0, hp: 120, supply: 0, scale: 1.0, radius: 4.0, light: 0.34 },
  { level: 2, name: "Iron Torch", blurb: "An iron basket burns brighter and survives rough weather.", cost: { gold: 45, lumber: 25 }, time: 20 * 15, hp: 180, supply: 0, scale: 1.05, radius: 5.0, light: 0.42 },
  { level: 3, name: "Twin Brazier", blurb: "Twin flames throw a broader pool of light across roads and walls.", cost: { gold: 75, lumber: 45 }, time: 20 * 20, hp: 260, supply: 0, scale: 1.10, radius: 6.2, light: 0.50 },
  { level: 4, name: "Raised Beacon", blurb: "A taller stone post carries the fire above nearby roofs and trees.", cost: { gold: 115, lumber: 65 }, time: 20 * 26, hp: 360, supply: 0, scale: 1.16, radius: 7.4, light: 0.58 },
  { level: 5, name: "Stone Brazier", blurb: "A permanent stone beacon with a deep iron fire bowl.", cost: { gold: 165, lumber: 90 }, time: 20 * 32, hp: 480, supply: 0, scale: 1.22, radius: 8.8, light: 0.66 },
  { level: 6, name: "Guard Beacon", blurb: "A fortified signal fire designed to illuminate approaches to the settlement.", cost: { gold: 230, lumber: 120 }, time: 20 * 39, hp: 620, supply: 0, scale: 1.28, radius: 10.2, light: 0.73 },
  { level: 7, name: "Royal Beacon", blurb: "Gold-trimmed braziers burn high above a reinforced stone plinth.", cost: { gold: 310, lumber: 155 }, time: 20 * 47, hp: 780, supply: 0, scale: 1.34, radius: 11.8, light: 0.80 },
  { level: 8, name: "Arcane Flame", blurb: "Mage-wrought fire burns brighter than ordinary pitch and resists the wind.", cost: { gold: 410, lumber: 195 }, time: 20 * 56, hp: 960, supply: 0, scale: 1.40, radius: 13.6, light: 0.87 },
  { level: 9, name: "Great Signal Fire", blurb: "A towering beacon visible across the battlefield.", cost: { gold: 530, lumber: 245 }, time: 20 * 66, hp: 1170, supply: 0, scale: 1.47, radius: 15.6, light: 0.94 },
  { level: 10, name: "Eternal Beacon", blurb: "The realm's ultimate beacon: a legendary flame that turns night around the stronghold into day.", cost: { gold: 680, lumber: 310 }, time: 20 * 78, hp: 1420, supply: 0, scale: 1.55, radius: 18.0, light: 1.0 },
];

/**
 * Aeroplane Factory tiers 1-10. Higher tiers assemble aircraft faster.
 */
export const AIRFACTORY_LEVELS: LevelDef[] = [
  { level: 1, name: "Workshop", blurb: "A small workshop for building basic aeroplanes. Simple tools and wooden structures.", cost: { gold: 0, lumber: 0 }, time: 20 * 0, hp: 1000, supply: 0, scale: 1.0, trainSpeed: 1.0 },
  { level: 2, name: "Improved Workshop", blurb: "Improved facilities allow for better designs and more efficient production.", cost: { gold: 280, lumber: 200 }, time: 20 * 50, hp: 1250, supply: 0, scale: 1.06, trainSpeed: 1.08 },
  { level: 3, name: "Reinforced Factory", blurb: "Reinforced buildings and more equipment increase aeroplane quality and speed.", cost: { gold: 420, lumber: 300 }, time: 20 * 62, hp: 1560, supply: 0, scale: 1.12, trainSpeed: 1.16 },
  { level: 4, name: "Assembly Works", blurb: "Expanded factory with advanced machinery and dedicated assembly lines.", cost: { gold: 600, lumber: 430 }, time: 20 * 76, hp: 1930, supply: 0, scale: 1.18, trainSpeed: 1.25 },
  { level: 5, name: "Engine Works", blurb: "A well-established factory with powerful engines and improved armour plating.", cost: { gold: 820, lumber: 580 }, time: 20 * 92, hp: 2360, supply: 0, scale: 1.24, trainSpeed: 1.35 },
  { level: 6, name: "Great Hangars", blurb: "Stronger structures and larger hangars allow for advanced aeroplane models.", cost: { gold: 1080, lumber: 760 }, time: 20 * 110, hp: 2860, supply: 0, scale: 1.3, trainSpeed: 1.45 },
  { level: 7, name: "Precision Works", blurb: "High-performance engines and refined production lines increase output and reliability.", cost: { gold: 1380, lumber: 970 }, time: 20 * 128, hp: 3430, supply: 0, scale: 1.37, trainSpeed: 1.56 },
  { level: 8, name: "Master Factory", blurb: "A master factory with specialised departments for engines, weapons and aerodynamics.", cost: { gold: 1720, lumber: 1210 }, time: 20 * 148, hp: 4070, supply: 0, scale: 1.43, trainSpeed: 1.68 },
  { level: 9, name: "Aviation Works", blurb: "The pinnacle of aviation engineering. Legendary aeroplanes are built within these walls.", cost: { gold: 2100, lumber: 1480 }, time: 20 * 170, hp: 4790, supply: 0, scale: 1.49, trainSpeed: 1.8 },
  { level: 10, name: "Builders of the Skies", blurb: "The ultimate aeroplane factory. Unmatched technology and capacity.", cost: { gold: 2520, lumber: 1780 }, time: 20 * 195, hp: 5600, supply: 0, scale: 1.55, trainSpeed: 2.0 },
];

/**
 * Foundry tiers 1-10. A foundry armours the whole army: every tier raises the max
 * HP of every unit its owner controls, now and in future.
 */
export const FOUNDRY_LEVELS: LevelDef[] = [
  { level: 1, name: "Charcoal Forge", blurb: "A small forge for basic metalwork. Simple tools and a charcoal fire.", cost: { gold: 0, lumber: 0 }, time: 20 * 0, hp: 900, supply: 0, scale: 1.0, armour: 0.05 },
  { level: 2, name: "Larger Forge", blurb: "Improved facilities with a larger forge and better tools for stronger metalwork.", cost: { gold: 200, lumber: 140 }, time: 20 * 42, hp: 1120, supply: 0, scale: 1.06, armour: 0.1 },
  { level: 3, name: "Coal Furnace", blurb: "Reinforced structure with a coal furnace for higher heat and better efficiency.", cost: { gold: 310, lumber: 210 }, time: 20 * 52, hp: 1400, supply: 0, scale: 1.12, armour: 0.16 },
  { level: 4, name: "Smelting Works", blurb: "Expanded foundry with skilled workers and improved smelting equipment.", cost: { gold: 440, lumber: 300 }, time: 20 * 64, hp: 1730, supply: 0, scale: 1.18, armour: 0.22 },
  { level: 5, name: "Steel Foundry", blurb: "A well-established foundry with advanced furnaces and the ability to cast steel.", cost: { gold: 600, lumber: 410 }, time: 20 * 78, hp: 2120, supply: 0, scale: 1.24, armour: 0.29 },
  { level: 6, name: "Casting Works", blurb: "Stronger infrastructure with multiple furnaces and improved casting workshops.", cost: { gold: 790, lumber: 540 }, time: 20 * 94, hp: 2570, supply: 0, scale: 1.3, armour: 0.36 },
  { level: 7, name: "Alloy Foundry", blurb: "Advanced foundry with powerful forges and the ability to produce specialised alloys.", cost: { gold: 1010, lumber: 690 }, time: 20 * 110, hp: 3080, supply: 0, scale: 1.37, armour: 0.44 },
  { level: 8, name: "Master Foundry", blurb: "A master foundry with high-capacity furnaces and expert metallurgists.", cost: { gold: 1260, lumber: 860 }, time: 20 * 128, hp: 3660, supply: 0, scale: 1.43, armour: 0.52 },
  { level: 9, name: "Metallurgical Works", blurb: "The pinnacle of metallurgical engineering. Casts the finest and strongest metals.", cost: { gold: 1550, lumber: 1050 }, time: 20 * 148, hp: 4310, supply: 0, scale: 1.49, armour: 0.61 },
  { level: 10, name: "Legendary Foundry", blurb: "The ultimate foundry. Capable of forging legendary weapons and armour.", cost: { gold: 1880, lumber: 1280 }, time: 20 * 170, hp: 5030, supply: 0, scale: 1.55, armour: 0.75 },
];

/**
 * Oil Rig tiers 1-10. Rigs sit on the shoreline and pump crude oil every second;
 * higher tiers pump far more. Oil pays for ships and aircraft.
 */
export const OILRIG_LEVELS: LevelDef[] = [
  { level: 1, name: "Drilling Platform", blurb: "A small offshore platform pumping crude oil from the seabed.", cost: { gold: 0, lumber: 0 }, time: 20 * 0, hp: 700, supply: 0, scale: 1.0, oilPerSecond: 2 },
  { level: 2, name: "Reinforced Platform", blurb: "Stronger decking and a second pump raise the flow of crude.", cost: { gold: 200, lumber: 150 }, time: 20 * 45, hp: 880, supply: 0, scale: 1.06, oilPerSecond: 3 },
  { level: 3, name: "Twin Derrick", blurb: "Two derricks and improved separators pull far more oil from the well.", cost: { gold: 310, lumber: 230 }, time: 20 * 55, hp: 1100, supply: 0, scale: 1.12, oilPerSecond: 4 },
  { level: 4, name: "Deep Well Rig", blurb: "Deeper drilling reaches richer reserves beneath the seabed.", cost: { gold: 440, lumber: 330 }, time: 20 * 68, hp: 1370, supply: 0, scale: 1.18, oilPerSecond: 5 },
  { level: 5, name: "Industrial Rig", blurb: "A full industrial platform with storage tanks and continuous pumping.", cost: { gold: 600, lumber: 450 }, time: 20 * 82, hp: 1680, supply: 0, scale: 1.24, oilPerSecond: 7 },
  { level: 6, name: "High-Pressure Rig", blurb: "High-pressure pumps and expanded decking greatly increase output.", cost: { gold: 790, lumber: 590 }, time: 20 * 98, hp: 2040, supply: 0, scale: 1.3, oilPerSecond: 9 },
  { level: 7, name: "Elite Platform", blurb: "Specialised crews and advanced machinery keep the crude flowing.", cost: { gold: 1010, lumber: 760 }, time: 20 * 115, hp: 2450, supply: 0, scale: 1.37, oilPerSecond: 11 },
  { level: 8, name: "Master Rig", blurb: "A master platform with multiple wells feeding vast storage.", cost: { gold: 1260, lumber: 950 }, time: 20 * 132, hp: 2910, supply: 0, scale: 1.43, oilPerSecond: 14 },
  { level: 9, name: "Deepwater Works", blurb: "The finest offshore works. Enormous reserves tapped continuously.", cost: { gold: 1550, lumber: 1170 }, time: 20 * 152, hp: 3430, supply: 0, scale: 1.49, oilPerSecond: 17 },
  { level: 10, name: "Ocean Wellhead", blurb: "The ultimate rig. An unmatched torrent of crude oil.", cost: { gold: 1880, lumber: 1420 }, time: 20 * 175, hp: 4010, supply: 0, scale: 1.55, oilPerSecond: 21 },
];

/**
 * Oil Refinery tiers 1-10. A refinery multiplies every rig's output, so the two
 * buildings compound: rigs decide the raw flow, the refinery decides its worth.
 */
export const REFINERY_LEVELS: LevelDef[] = [
  { level: 1, name: "Distillation Shack", blurb: "A small distillation shack to process crude oil into basic fuel.", cost: { gold: 0, lumber: 0 }, time: 20 * 0, hp: 800, supply: 0, scale: 1.0, refine: 0.15 },
  { level: 2, name: "Improved Stills", blurb: "Improved distillation units increase fuel output and efficiency.", cost: { gold: 220, lumber: 170 }, time: 20 * 48, hp: 1000, supply: 0, scale: 1.06, refine: 0.3 },
  { level: 3, name: "Pump House", blurb: "Better pumps and separators allow for more refined products and greater output.", cost: { gold: 340, lumber: 260 }, time: 20 * 58, hp: 1250, supply: 0, scale: 1.12, refine: 0.45 },
  { level: 4, name: "Refining Columns", blurb: "Advanced refining columns and storage tanks improve fuel quality and capacity.", cost: { gold: 480, lumber: 370 }, time: 20 * 72, hp: 1550, supply: 0, scale: 1.18, refine: 0.6 },
  { level: 5, name: "Efficient Works", blurb: "More efficient systems and additional towers increase production and reduce waste.", cost: { gold: 650, lumber: 500 }, time: 20 * 88, hp: 1900, supply: 0, scale: 1.24, refine: 0.8 },
  { level: 6, name: "Cracking Units", blurb: "High-capacity distillation and cracking units significantly boost fuel production.", cost: { gold: 860, lumber: 660 }, time: 20 * 105, hp: 2310, supply: 0, scale: 1.3, refine: 1.0 },
  { level: 7, name: "Catalytic Works", blurb: "Advanced catalytic cracking and hydro-processing increase efficiency and yield.", cost: { gold: 1100, lumber: 850 }, time: 20 * 122, hp: 2780, supply: 0, scale: 1.37, refine: 1.25 },
  { level: 8, name: "State Refinery", blurb: "State-of-the-art refining technology produces higher-grade fuels and byproducts.", cost: { gold: 1380, lumber: 1060 }, time: 20 * 142, hp: 3300, supply: 0, scale: 1.43, refine: 1.5 },
  { level: 9, name: "Automated Refinery", blurb: "Maximum refinement capability with automated systems and vast storage.", cost: { gold: 1700, lumber: 1300 }, time: 20 * 164, hp: 3890, supply: 0, scale: 1.49, refine: 1.8 },
  { level: 10, name: "Grand Refinery", blurb: "The ultimate oil refinery. Unmatched production and the purest fuels.", cost: { gold: 2060, lumber: 1580 }, time: 20 * 188, hp: 4550, supply: 0, scale: 1.55, refine: 2.2 },
];

/**
 * Stables tiers 1-10. Higher tiers turn out cavalry faster and keep more horses.
 */
export const STABLES_LEVELS: LevelDef[] = [
  { level: 1, name: "Small Stable", blurb: "A small stable to house and care for a few war horses.", cost: { gold: 0, lumber: 0 }, time: 20 * 0, hp: 750, supply: 0, scale: 1.0, trainSpeed: 1.0 },
  { level: 2, name: "Improved Stables", blurb: "Improved stables with more space and better facilities for training and care.", cost: { gold: 210, lumber: 140 }, time: 20 * 44, hp: 940, supply: 0, scale: 1.06, trainSpeed: 1.08 },
  { level: 3, name: "Expanded Stalls", blurb: "Stronger construction and expanded stalls allow for more horses and improved training.", cost: { gold: 320, lumber: 220 }, time: 20 * 54, hp: 1170, supply: 0, scale: 1.12, trainSpeed: 1.16 },
  { level: 4, name: "Training Grounds", blurb: "Advanced stables with training grounds and veterinary facilities for healthier mounts.", cost: { gold: 460, lumber: 310 }, time: 20 * 66, hp: 1450, supply: 0, scale: 1.18, trainSpeed: 1.25 },
  { level: 5, name: "Spacious Stables", blurb: "Spacious stables with multiple training areas and better equipment for elite cavalry.", cost: { gold: 620, lumber: 420 }, time: 20 * 80, hp: 1780, supply: 0, scale: 1.24, trainSpeed: 1.35 },
  { level: 6, name: "War Stables", blurb: "Stronger buildings with larger stalls and advanced training programs.", cost: { gold: 820, lumber: 560 }, time: 20 * 96, hp: 2160, supply: 0, scale: 1.3, trainSpeed: 1.45 },
  { level: 7, name: "Elite Stables", blurb: "Elite stables with specialised training fields and improved breeding programs.", cost: { gold: 1050, lumber: 710 }, time: 20 * 112, hp: 2600, supply: 0, scale: 1.37, trainSpeed: 1.56 },
  { level: 8, name: "Stables Complex", blurb: "A grand stables complex with infirmary, breeding grounds and war horse arenas.", cost: { gold: 1310, lumber: 890 }, time: 20 * 130, hp: 3090, supply: 0, scale: 1.43, trainSpeed: 1.68 },
  { level: 9, name: "Royal Stables", blurb: "The finest stables, producing the fastest and strongest war horses in the realm.", cost: { gold: 1610, lumber: 1090 }, time: 20 * 150, hp: 3640, supply: 0, scale: 1.49, trainSpeed: 1.8 },
  { level: 10, name: "Legendary Stables", blurb: "The ultimate stables. Legendary war horses are bred, trained and prepared for war.", cost: { gold: 1950, lumber: 1330 }, time: 20 * 172, hp: 4260, supply: 0, scale: 1.55, trainSpeed: 2.0 },
];

/**
 * Mage Tower tiers 1-10. Tiers train casters faster, widen the tower's sight, and
 * raise spell power — which combat in milestone 2 will read.
 */
export const MAGETOWER_LEVELS: LevelDef[] = [
  { level: 1, name: "Apprentice Tower", blurb: "A small tower where apprentice mages learn the basic arts.", cost: { gold: 0, lumber: 0 }, time: 20 * 0, hp: 650, supply: 0, scale: 1.0, trainSpeed: 1.0, spellPower: 0.0, radius: 6 },
  { level: 2, name: "Adept Tower", blurb: "Improved facilities allow for more mages and better research.", cost: { gold: 240, lumber: 160 }, time: 20 * 50, hp: 810, supply: 0, scale: 1.06, trainSpeed: 1.08, spellPower: 0.12, radius: 6.6 },
  { level: 3, name: "Focus Spire", blurb: "Stronger magical focus increases spell power and efficiency.", cost: { gold: 370, lumber: 250 }, time: 20 * 60, hp: 1010, supply: 0, scale: 1.12, trainSpeed: 1.16, spellPower: 0.25, radius: 7.2 },
  { level: 4, name: "Arcane Chambers", blurb: "Expanded arcane chambers and enhanced focuses improve spell mastery.", cost: { gold: 520, lumber: 350 }, time: 20 * 74, hp: 1250, supply: 0, scale: 1.18, trainSpeed: 1.25, spellPower: 0.4, radius: 7.8 },
  { level: 5, name: "Grand Tower", blurb: "A grand tower with advanced libraries and powerful enchantments.", cost: { gold: 710, lumber: 480 }, time: 20 * 90, hp: 1540, supply: 0, scale: 1.24, trainSpeed: 1.35, spellPower: 0.55, radius: 8.4 },
  { level: 6, name: "Enchanters' Hall", blurb: "Greater magical capacity unlocks new spells and enchantments.", cost: { gold: 940, lumber: 630 }, time: 20 * 108, hp: 1870, supply: 0, scale: 1.3, trainSpeed: 1.45, spellPower: 0.75, radius: 9.0 },
  { level: 7, name: "Warded Spire", blurb: "Advanced research and magical defences protect the tower.", cost: { gold: 1200, lumber: 810 }, time: 20 * 126, hp: 2250, supply: 0, scale: 1.37, trainSpeed: 1.56, spellPower: 0.95, radius: 9.6 },
  { level: 8, name: "Arcane Mastery", blurb: "Mastery of the arcane unleashes devastating magical potential.", cost: { gold: 1500, lumber: 1010 }, time: 20 * 146, hp: 2680, supply: 0, scale: 1.43, trainSpeed: 1.68, spellPower: 1.2, radius: 10.2 },
  { level: 9, name: "Ancient Conflux", blurb: "Ancient magic flows through the tower, warping reality itself.", cost: { gold: 1840, lumber: 1240 }, time: 20 * 168, hp: 3160, supply: 0, scale: 1.49, trainSpeed: 1.8, spellPower: 1.5, radius: 10.8 },
  { level: 10, name: "Pinnacle of Magic", blurb: "The pinnacle of magical knowledge. Few can rival its power.", cost: { gold: 2230, lumber: 1500 }, time: 20 * 192, hp: 3700, supply: 0, scale: 1.55, trainSpeed: 2.0, spellPower: 1.9, radius: 11.6 },
];

/**
 * Farm tiers 1-10. Farms exist to raise the supply ceiling, so that is the whole
 * progression: a level 10 farm feeds roughly eight times what a level 1 does.
 */
export const FARM_LEVELS: LevelDef[] = [
  { level: 1, name: "Farm", blurb: "A basic farm with a few fields and a milking cow.", cost: { gold: 0, lumber: 0 }, time: 20 * 0, hp: 500, supply: 6, scale: 1.0 },
  { level: 2, name: "Improved Farm", blurb: "Better tools and techniques increase food production.", cost: { gold: 110, lumber: 80 }, time: 20 * 26, hp: 620, supply: 9, scale: 1.04 },
  { level: 3, name: "Advanced Farm", blurb: "Expanded fields and storage increase output.", cost: { gold: 170, lumber: 125 }, time: 20 * 32, hp: 770, supply: 12, scale: 1.09 },
  { level: 4, name: "Large Farm", blurb: "More land and better infrastructure boost yields.", cost: { gold: 245, lumber: 180 }, time: 20 * 39, hp: 950, supply: 16, scale: 1.14 },
  { level: 5, name: "Superior Farm", blurb: "Upgraded facilities and crop rotation maximise production.", cost: { gold: 335, lumber: 245 }, time: 20 * 47, hp: 1160, supply: 20, scale: 1.18 },
  { level: 6, name: "Elite Farm", blurb: "Expert farmers and advanced equipment greatly increase yields.", cost: { gold: 440, lumber: 325 }, time: 20 * 56, hp: 1400, supply: 25, scale: 1.23 },
  { level: 7, name: "Prestige Farm", blurb: "A prestigious farm with superior resources and techniques.", cost: { gold: 565, lumber: 415 }, time: 20 * 66, hp: 1680, supply: 30, scale: 1.27 },
  { level: 8, name: "Royal Farm", blurb: "Royal standards and innovation ensure abundant harvests.", cost: { gold: 710, lumber: 520 }, time: 20 * 77, hp: 1990, supply: 36, scale: 1.31 },
  { level: 9, name: "Grand Farm", blurb: "The finest farm in the kingdom. Yields are nearly unmatched.", cost: { gold: 875, lumber: 640 }, time: 20 * 89, hp: 2340, supply: 42, scale: 1.36 },
  { level: 10, name: "Legendary Farm", blurb: "A legendary farm that feeds armies. Maximum food production.", cost: { gold: 1060, lumber: 780 }, time: 20 * 102, hp: 2730, supply: 50, scale: 1.41 },
];

/**
 * Gryphon Aviary tiers 1-10. Higher tiers harden the roost and turn out
 * Gryphon Riders faster, mirroring the cavalry and aircraft production curves.
 */
export const GRYPHONAVIARY_LEVELS: LevelDef[] = [
  { level: 1, name: "Cliffside Roost", blurb: "A rough stone-and-timber roost for the first bonded gryphons.", cost: { gold: 0, lumber: 0 }, time: 0, hp: 850, supply: 0, scale: 1.0, trainSpeed: 1.0 },
  { level: 2, name: "High Roost", blurb: "Stronger perches and larger mews support a growing flight.", cost: { gold: 230, lumber: 170 }, time: 20 * 46, hp: 1060, supply: 0, scale: 1.06, trainSpeed: 1.08 },
  { level: 3, name: "Stone Aviary", blurb: "Stone towers shelter riders, tack and breeding pairs.", cost: { gold: 350, lumber: 250 }, time: 20 * 57, hp: 1320, supply: 0, scale: 1.12, trainSpeed: 1.16 },
  { level: 4, name: "War Roost", blurb: "Armour racks and launch platforms prepare gryphons for battle.", cost: { gold: 500, lumber: 350 }, time: 20 * 70, hp: 1630, supply: 0, scale: 1.18, trainSpeed: 1.25 },
  { level: 5, name: "Royal Mews", blurb: "A permanent royal flight with dedicated handlers and healers.", cost: { gold: 680, lumber: 480 }, time: 20 * 85, hp: 1990, supply: 0, scale: 1.24, trainSpeed: 1.35 },
  { level: 6, name: "Sky Barracks", blurb: "Fortified towers and broad launch decks keep elite riders ready.", cost: { gold: 900, lumber: 640 }, time: 20 * 102, hp: 2410, supply: 0, scale: 1.3, trainSpeed: 1.45 },
  { level: 7, name: "Storm Roost", blurb: "Arcane wards and hardened stone protect the realm's aerial cavalry.", cost: { gold: 1160, lumber: 820 }, time: 20 * 120, hp: 2890, supply: 0, scale: 1.37, trainSpeed: 1.56 },
  { level: 8, name: "Master Aviary", blurb: "Master handlers maintain several combat flights at once.", cost: { gold: 1460, lumber: 1030 }, time: 20 * 140, hp: 3430, supply: 0, scale: 1.43, trainSpeed: 1.68 },
  { level: 9, name: "Sky Citadel", blurb: "A towering fortress-roost dominating the air above the realm.", cost: { gold: 1800, lumber: 1270 }, time: 20 * 162, hp: 4040, supply: 0, scale: 1.49, trainSpeed: 1.8 },
  { level: 10, name: "Crown of the Skies", blurb: "The ultimate gryphon stronghold, home to the realm's legendary riders.", cost: { gold: 2180, lumber: 1540 }, time: 20 * 186, hp: 4720, supply: 0, scale: 1.55, trainSpeed: 2.0 },
];

/** Buildings that support levelling, and their tier table. */
export const LEVELLED: Record<string, LevelDef[]> = {
  townhall: TOWNHALL_LEVELS,
  lumbermill: LUMBERMILL_LEVELS,
  barracks: BARRACKS_LEVELS,
  shipyard: SHIPYARD_LEVELS,
  church: CHURCH_LEVELS,
  tower: TOWER_LEVELS,
  torch: TORCH_LEVELS,
  airfactory: AIRFACTORY_LEVELS,
  foundry: FOUNDRY_LEVELS,
  oilrig: OILRIG_LEVELS,
  refinery: REFINERY_LEVELS,
  stables: STABLES_LEVELS,
  magetower: MAGETOWER_LEVELS,
  gryphonaviary: GRYPHONAVIARY_LEVELS,
  farm: FARM_LEVELS,
};

export function levelDef(def: string, level: number): LevelDef {
  const table = LEVELLED[def] ?? TOWNHALL_LEVELS;
  return table[Math.max(0, Math.min(table.length - 1, level - 1))]!;
}
