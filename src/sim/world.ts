import { BUILDINGS } from "../data/buildings";
import { LEVELLED, levelDef } from "../data/levels";
import { UNITS } from "../data/units";
import { researchBonus, UPGRADES } from "../data/upgrades";
import type { Command } from "./commands";
import { centerOf, type Building, type Entity, type Projectile, type Unit } from "./entities";
import { GameMap, type MapKind } from "./map";
import { Vision, VISION_INTERVAL } from "./vision";
import { findPath } from "./pathfinding";
import { REACH, WEAPON_OF, type Relic } from "./relic";
import type { Domain } from "../data/units";
import { Rng } from "./rng";
import { Faction, SUB, Tile, type EntityId, type Player, type PlayerId, type Vec } from "./types";

export const TICKS_PER_SECOND = 20;

/**
 * What every player starts with: exactly one Town Hall, and nothing else.
 *
 * A Hall is 400 gold and 250 lumber. The purse holds that and a little over, so
 * the first decision of the match -- where the King puts his hall -- is the only
 * thing the money can buy, and everything after it has to be earned. A fat purse
 * made the opening a shopping trip; this makes it a decision.
 */
export const START_PURSE = { gold: 450, lumber: 300, oil: 0 };
const HARVEST_TICKS = 20 * 3; // 3 s per trip
const DEPOSIT_TICKS = 10;
const CANCEL_REFUND = 0.75;
/** Princes alive at once. */
const MAX_HEIRS = 3;

/** Ticks an Icebreaker takes to turn one tile of pack ice into open water. */
const GRIND_TICKS = 20 * 2;

/** People who turn up the moment a King is crowned. */
const FOLLOWERS = 4;

/** What a King may raise without the usual chain of buildings behind it. */
const ROYAL_LICENCE = new Set(["tower"]);

/** The owner every wild animal belongs to. Hostile to all, wins nothing. */
export const WILD: PlayerId = 9;

/** How close something has to come before a bear takes an interest, in tiles. */
const BEAST_AGGRO = 6;

/** How far a beast will drift from where it was born, in tiles. */
const BEAST_RANGE = 9;
/** Chance a blow lands as a critical hit. */
const CRIT_CHANCE = 0.08;
/** What a critical hit multiplies the rolled damage by. */
const CRIT_MULTIPLIER = 1.9;

export interface WorldEvent {
  tick: number;
  player: PlayerId;
  text: string;
  level: "info" | "error";
}

/**
 * Things that HAPPENED this tick, as opposed to state that now IS.
 *
 * A swing, a hit and a death all leave no trace in the world a tick later --
 * the attacker's cooldown is just a number, the corpse is simply gone -- so
 * without this the renderer could only ever draw the aftermath, and a battle
 * looked like two sprites overlapping while numbers changed. The list is
 * rebuilt every step from the same deterministic computation, so every client
 * produces exactly the same one; nothing reads it back into the simulation.
 *
 * Positions are world sub-units, and carry enough about the dead to draw them
 * falling after the entity itself has been removed.
 */
export type FxEvent =
  | { kind: "attack"; x: number; y: number; tx: number; ty: number; def: string; ranged: boolean }
  | { kind: "hit"; id: EntityId; x: number; y: number; building: boolean; amount: number; crit: boolean }
  | { kind: "death"; x: number; y: number; def: string; owner: PlayerId; facing: number; building: boolean }
  | { kind: "built"; x: number; y: number; def: string }
  | { kind: "deposit"; x: number; y: number; resource: "gold" | "lumber" }
  | { kind: "chop"; id: EntityId; x: number; y: number }
  | { kind: "crowned"; x: number; y: number; owner: PlayerId };

/**
 * The whole game state. `step()` advances exactly one tick given the commands
 * issued for that tick. Same seed + same command stream ⇒ same state everywhere.
 */
export class World {
  tick = 0;
  readonly map: GameMap;
  readonly rng: Rng;
  readonly players = new Map<PlayerId, Player>();
  /** Insertion-ordered; ids are monotonic so iteration order is deterministic. */
  readonly entities = new Map<EntityId, Entity>();
  private nextId = 1;
  /** Transient feedback for the UI (not part of deterministic state). */
  events: WorldEvent[] = [];
  /** What happened this tick, for the renderer and the sound. Cleared each step. */
  fx: FxEvent[] = [];
  /** Shots in flight. Cosmetic only — damage lands when the shot is fired. */
  projectiles: Projectile[] = [];
  /** Set once one side has lost every building. */
  winner: PlayerId | null = null;
  /**
   * What each player can see and remember. Part of the simulation, not the
   * renderer: it decides what may be targeted, so it has to be computed the same
   * way on every machine.
   */
  readonly vision = new Map<PlayerId, Vision>();
  /** When false, everyone sees everything -- the old behaviour, kept for tools. */
  fogEnabled = true;

  /**
   * How long everything takes, as a multiplier on every duration in the game:
   * training, construction, research, upgrades and the time a worker spends at
   * a tree or a seam. 1 is the brisk default; 6 turns a twenty-minute skirmish
   * into an afternoon.
   *
   * Deliberately NOT the same thing as the game-speed slider in settings. That
   * one changes how fast real time asks for ticks, so everything happens sooner
   * without anything changing; this changes how many ticks the work itself
   * takes, which is what actually makes a long game feel long -- armies stay
   * small, an expansion is a real commitment, and losing one costs an hour
   * rather than a minute. It is fixed when the match starts, like the map and
   * the opponent, so it can never differ between two players mid-game.
   */
  readonly pace: number;

  constructor(width: number, height: number, seed: number, kind: MapKind = "lakeland", pace = 1, stockade = false) {
    this.pace = Math.max(0.25, pace);
    this.map = GameMap.generate(width, height, seed, kind, stockade);
    this.rng = new Rng(seed ^ 0x9e3779b9);
  }

  // ───────────────────────────── setup ─────────────────────────────



  addPlayer(id: PlayerId, faction: Faction, color: string): Player {
    const p: Player = { id, faction, ...START_PURSE, research: {}, color };
    this.players.set(id, p);
    this.vision.set(id, new Vision(this.map.width, this.map.height));
    return p;
  }

  /**
   * Where each clan was seated. The crowning opening needs it: if the one man
   * who can lift the weapon dies on the way to it, the next one has to come
   * from somewhere, and "somewhere" is home.
   */
  readonly homes = new Map<PlayerId, { x: number; y: number }>();
  /** Earliest tick each clan may send its next man out. */
  private readonly nextHeir = new Map<PlayerId, number>();

  /** Standard start: a Town Hall and 4 workers. */
  spawnStart(player: PlayerId, tx: number, ty: number): void {
    this.homes.set(player, { x: tx, y: ty });
    const hall = this.placeBuilding(player, "townhall", tx, ty, true)!;
    const c = centerOf(hall);
    for (let i = 0; i < 4; i++) this.spawnUnit(player, "worker", { x: c.x + (i - 1.5) * SUB, y: c.y + (hall.size / 2 + 1) * SUB });
    this.spawnUnit(player, "king", { x: c.x, y: c.y + (hall.size / 2 + 2) * SUB });
  }

  /**
   * Nomad start: five workers, no buildings, and enough in the purse for a Town
   * Hall. Where the base goes is the first decision of the game rather than
   * something the map decided for you.
   *
   * A fifth worker and the extra timber are not generosity -- a nomad spends the
   * opening minute walking instead of gathering, and without them the start is
   * simply a slower version of the normal one.
   */
  spawnNomad(player: PlayerId, tx: number, ty: number): void {
    this.homes.set(player, { x: tx, y: ty });
    const p = this.players.get(player)!;
    // One man and a purse. He raises the first hall himself, and everything you
    // ever own descends from that one decision about where to put it.
    p.gold = Math.max(p.gold, 600);
    p.lumber = Math.max(p.lumber, 400);
    this.spawnUnit(player, "king", { x: (tx + 1) * SUB, y: (ty + 1) * SUB });
  }

  /**
   * Weapons waiting in the ground, one per player, in the crowning opening.
   * Empty in every other start, and the whole first act when it is not.
   */
  readonly relics: Relic[] = [];
  /**
   * Grinding progress per tile of pack ice, keyed by tile index.
   *
   * Per tile rather than per ship: keeping it against the ship threw the work
   * away every time she drifted over a tile boundary, so she crossed a floe
   * leaving most of it intact. Ice remembers what has been done to it.
   */
  private readonly grinding = new Map<number, number>();
  /** Where each wild animal was born, so it has somewhere to wander around. */
  private readonly lairs = new Map<EntityId, { x: number; y: number }>();

  /**
   * Begin as one peasant with no king and no hall.
   *
   * He cannot found anything -- founding a hall is royal work and there is no
   * royal line yet -- so the only move available is to walk out and look for the
   * weapon his clan is owed. The weapon is set down well outside the starting
   * ring and under the fog, at a distance that makes finding it a short journey
   * rather than a formality.
   */
  spawnCrowning(player: PlayerId, tx: number, ty: number, rng = this.rng): void {
    const p = this.players.get(player)!;
    this.homes.set(player, { x: tx, y: ty });
    this.spawnUnit(player, "worker", { x: (tx + 1) * SUB, y: (ty + 1) * SUB });
    // Somewhere out there, at arm's length but not in sight.
    const centre = { x: this.map.width / 2, y: this.map.height / 2 };
    const toMiddle = Math.atan2(centre.y - ty, centre.x - tx);
    for (let attempt = 0; attempt < 200; attempt++) {
      // Fan out around the line towards the middle of the board, so the weapon
      // is never behind you in a corner and never at the enemy's door. Close
      // enough to be a walk rather than an expedition: twenty to thirty tiles on
      // a 160-tile board with fog and a treeline around you turned out to be a
      // search, and a player who cannot find the thing the game is waiting on
      // has no game at all.
      const a = toMiddle + (rng.next() * 2 - 1) * 1.1;
      const d = 13 + rng.next() * 7;
      const rx = Math.round(tx + Math.cos(a) * d);
      const ry = Math.round(ty + Math.sin(a) * d);
      if (!this.map.inBounds(rx, ry) || !this.map.isWalkable(rx, ry, "land")) continue;
      if (this.map.occupant[this.map.idx(rx, ry)] !== 0) continue;
      // He has to be able to walk to it. A King is a land animal: he does not
      // swim, and a weapon laid down across a lake or on an island is a match
      // that cannot start.
      if (!this.map.connected(tx, ty, rx, ry, "land")) continue;
      this.relics.push({ owner: player, faction: p.faction, x: rx, y: ry, taken: false });
      return;
    }
    // Nowhere suitable: rather than leave a player unable to ever build, put the
    // weapon at his feet and let the match start early.
    this.relics.push({ owner: player, faction: p.faction, x: tx, y: ty, taken: false });
  }

  /**
   * A man walking onto his clan's weapon becomes its King.
   *
   * The unit is not replaced, it is promoted: same id, so anything holding on to
   * it -- the player's selection, a standing order -- survives the moment. He
   * keeps his wounds as a fraction, because being crowned is not a bandage.
   */
  private checkRelics(): void {
    if (this.relics.length === 0 || this.tick % 5 !== 0) return;
    for (const r of this.relics) {
      if (r.taken) continue;
      const cx = (r.x + 0.5) * SUB;
      const cy = (r.y + 0.5) * SUB;
      for (const u of this.units()) {
        if (u.owner !== r.owner) continue;
        const dx = u.pos.x - cx;
        const dy = u.pos.y - cy;
        if (dx * dx + dy * dy > (REACH * SUB) ** 2) continue;
        r.taken = true;
        const frac = u.hp / u.maxHp;
        u.def = "king";
        u.maxHp = Math.round(UNITS.king!.hp * (1 + this.armourBonus(u.owner)));
        u.hp = Math.max(1, Math.round(u.maxHp * frac));
        u.task = { kind: "idle" };
        u.carrying = null;
        this.emit(u.owner, WEAPON_OF[r.faction].taken, "info");
        this.fx.push({ kind: "crowned", x: u.pos.x, y: u.pos.y, owner: u.owner });
        this.rally(u);
        break;
      }
    }
  }

  /**
   * People come to a crowned King.
   *
   * The walk out is meant to be lonely -- one man, no hall, nothing to command.
   * What it must not be is a walk that changes nothing when it ends. So the
   * moment the weapon is lifted, a handful of followers are standing around him:
   * the kingdom appears at the instant he becomes a king, which is the whole
   * point of the scene, and it saves the player a dead minute waiting on the
   * first hall to train anybody.
   */
  private rally(king: Unit): void {
    const ring = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, 1],
    ] as const;
    let placed = 0;
    for (const [dx, dy] of ring) {
      if (placed >= FOLLOWERS) break;
      const tx = Math.floor(king.pos.x / SUB) + dx;
      const ty = Math.floor(king.pos.y / SUB) + dy;
      if (!this.map.isWalkable(tx, ty, "land")) continue;
      this.spawnUnit(king.owner, "worker", { x: (tx + 0.5) * SUB, y: (ty + 0.5) * SUB });
      placed++;
    }
    // If he was crowned somewhere tight, they can still stand on his own tile
    // rather than simply never arriving.
    while (placed < FOLLOWERS) {
      this.spawnUnit(king.owner, "worker", { x: king.pos.x, y: king.pos.y });
      placed++;
    }
    this.emit(king.owner, `${FOLLOWERS} followers have come to serve the King`, "info");
  }

  /**
   * Put bears on the map.
   *
   * They matter most in the first five minutes, which is the point of them: the
   * King walks out alone to find his weapon, and the country between here and
   * there is not empty. One man against a bear is a real fight, so the opening
   * becomes a question -- go now and risk him, or wait, gather, and go with
   * company. A bear is worth sixty gold in hide to whoever kills it, so the risk
   * pays as well as costing.
   *
   * They are kept well clear of the seats. A bear standing on your Town Hall at
   * tick zero is not strategy, it is a coin toss.
   */
  spawnWildlife(count: number): void {
    const home: Array<{ x: number; y: number }> = [];
    for (let attempt = 0; attempt < count * 40 && home.length < count; attempt++) {
      const tx = 2 + this.rng.int(this.map.width - 4);
      const ty = 2 + this.rng.int(this.map.height - 4);
      if (!this.map.isWalkable(tx, ty, "land")) continue;
      let tooClose = false;
      for (const s of this.map.starts) if (Math.hypot(tx - s.x, ty - s.y) < 16) tooClose = true;
      for (const h of home) if (Math.hypot(tx - h.x, ty - h.y) < 8) tooClose = true;
      if (tooClose) continue;
      home.push({ x: tx, y: ty });
      const bear = this.spawnUnit(WILD, "bear", { x: (tx + 0.5) * SUB, y: (ty + 0.5) * SUB });
      this.lairs.set(bear.id, { x: bear.pos.x, y: bear.pos.y });
    }
  }

  /**
   * A beast's turn: go for whatever came too close, or wander its own ground.
   *
   * Deliberately simple and deliberately local. A bear that hunted across the
   * map would be a third army; a bear that never moved would be scenery. This is
   * an animal with a patch of country it considers its own.
   */
  private stepBeast(u: Unit): void {
    if (u.task.kind === "attack" || u.task.kind === "attackMove") {
      const t = u.task.kind === "attack" ? this.entities.get(u.task.target) : null;
      if (t) return;
    }
    // Looking for prey is a scan over every entity on the board, and there are
    // dozens of bears: doing it every tick for each of them cost more than the
    // rest of the simulation. A bear noticing you a fifth of a second late is
    // not something anyone can perceive.
    if ((this.tick + u.id) % 5 !== 0) return;
    const prey = this.findTarget(u, BEAST_AGGRO * SUB);
    if (prey) {
      u.task = { kind: "attack", target: prey.id };
      return;
    }
    // Wander, but only every so often: a bear that re-picked a destination every
    // tick would vibrate on the spot.
    if (this.tick % 40 !== 0 || this.rng.next() > 0.35) return;
    const lair = this.lairs.get(u.id);
    if (!lair) return;
    const a = this.rng.next() * Math.PI * 2;
    const d = this.rng.next() * BEAST_RANGE;
    const tx = Math.floor(lair.x / SUB + Math.cos(a) * d);
    const ty = Math.floor(lair.y / SUB + Math.sin(a) * d);
    if (!this.map.isWalkable(tx, ty, "land")) return;
    this.pathTo(u, tx, ty, true);
    u.task = { kind: "move", target: { x: (tx + 0.5) * SUB, y: (ty + 0.5) * SUB } };
  }

  /** A duration in ticks, stretched by the match's pace. */
  paced(ticks: number): number {
    return Math.max(1, Math.round(ticks * this.pace));
  }

  spawnUnit(owner: PlayerId, def: string, pos: Vec): Unit {
    const d = UNITS[def]!;
    const maxHp = Math.round(d.hp * (1 + this.armourBonus(owner)));
    const u: Unit = {
      kind: "unit",
      id: this.nextId++,
      owner,
      def,
      pos: { x: Math.round(pos.x), y: Math.round(pos.y) },
      hp: maxHp,
      maxHp,
      task: { kind: "idle" },
      path: [],
      repathIn: 0,
      carrying: null,
      facing: 4,
      cooldown: 0,
      engaging: null,
    };
    this.entities.set(u.id, u);
    return u;
  }

  placeBuilding(owner: PlayerId, def: string, tx: number, ty: number, complete = false): Building | null {
    const d = BUILDINGS[def];
    if (!d || !this.map.canPlace(tx, ty, d.size)) return null;
    const b: Building = {
      kind: "building",
      id: this.nextId++,
      owner,
      def,
      tx,
      ty,
      size: d.size,
      hp: complete ? d.hp : Math.max(1, Math.floor(d.hp * 0.1)),
      maxHp: d.hp,
      progress: complete ? d.buildTime : 0,
      complete,
      queue: [],
      level: 1,
      upgrade: null,
      research: null,
      rally: null,
      builders: 0,
    };
    this.entities.set(b.id, b);
    this.map.occupy(tx, ty, d.size, b.id);
    return b;
  }

  // ───────────────────────────── queries ─────────────────────────────

  units(): Unit[] {
    const out: Unit[] = [];
    for (const e of this.entities.values()) if (e.kind === "unit") out.push(e);
    return out;
  }
  buildings(): Building[] {
    const out: Building[] = [];
    for (const e of this.entities.values()) if (e.kind === "building") out.push(e);
    return out;
  }

  supply(player: PlayerId): { used: number; max: number } {
    let used = 0;
    let max = 0;
    for (const e of this.entities.values()) {
      if (e.owner !== player) continue;
      if (e.kind === "unit") used += UNITS[e.def]!.supply;
      else if (e.complete) max += LEVELLED[e.def] ? levelDef(e.def, e.level).supply : BUILDINGS[e.def]!.supply;
    }
    return { used, max: Math.min(max, 200) };
  }

  /**
   * Best armour bonus this player's foundries provide. Only the strongest counts,
   * so a second foundry is redundant rather than stacking.
   */
  armourBonus(player: PlayerId): number {
    let best = 0;
    for (const e of this.entities.values()) {
      if (e.kind !== "building" || e.owner !== player || !e.complete) continue;
      const lv = LEVELLED[e.def] ? levelDef(e.def, e.level) : null;
      if (lv?.armour) best = Math.max(best, lv.armour);
    }
    return best;
  }

  /** Re-apply the armour bonus to every unit, keeping each one's damage fraction. */
  private refreshArmour(player: PlayerId): void {
    const bonus = this.armourBonus(player);
    for (const u of this.units()) {
      if (u.owner !== player) continue;
      const base = UNITS[u.def]!.hp;
      const target = Math.round(base * (1 + bonus));
      if (target === u.maxHp) continue;
      const frac = u.maxHp > 0 ? u.hp / u.maxHp : 1;
      u.maxHp = target;
      u.hp = Math.max(1, Math.round(target * frac));
    }
  }

  hasBuilding(player: PlayerId, def: string): boolean {
    for (const e of this.entities.values()) if (e.kind === "building" && e.owner === player && e.def === def && e.complete) return true;
    return false;
  }

  canAfford(player: PlayerId, cost: { gold: number; lumber: number; oil?: number }): boolean {
    const p = this.players.get(player)!;
    return p.gold >= cost.gold && p.lumber >= cost.lumber && p.oil >= (cost.oil ?? 0);
  }

  private spend(player: PlayerId, cost: { gold: number; lumber: number; oil?: number }): void {
    const p = this.players.get(player)!;
    p.gold -= cost.gold;
    p.lumber -= cost.lumber;
    p.oil -= cost.oil ?? 0;
  }

  private refund(player: PlayerId, cost: { gold: number; lumber: number; oil?: number }, rate = 1): void {
    const p = this.players.get(player)!;
    p.gold += Math.floor(cost.gold * rate);
    p.lumber += Math.floor(cost.lumber * rate);
    p.oil += Math.floor((cost.oil ?? 0) * rate);
  }

  /** Why a building can't be placed, or null if it can. */
  placementError(player: PlayerId, def: string, tx: number, ty: number, builderIsRoyal = false): string | null {
    const d = BUILDINGS[def];
    if (!d) return "Unknown building";
    // A King may raise a watchtower wherever he stands, without a barracks
    // behind him to justify it. He is walking his own country with no army yet,
    // and putting a tower on the ground he means to keep is exactly what a man
    // in that position does. Everything else still wants its prerequisites.
    const royalLicence = builderIsRoyal && ROYAL_LICENCE.has(def);
    if (!royalLicence) for (const r of d.requires) if (!this.hasBuilding(player, r)) return `Requires ${BUILDINGS[r]!.name}`;
    if (!this.canAfford(player, d.cost)) return "Not enough resources";
    if (!this.map.canPlace(tx, ty, d.size)) return "Cannot build there";
    if (d.coastal && !this.map.touchesWater(tx, ty, d.size)) return "Must be built on the shoreline";
    // Keep footprints off units of any player.
    for (const u of this.units()) {
      const ux = Math.floor(u.pos.x / SUB);
      const uy = Math.floor(u.pos.y / SUB);
      if (ux >= tx && ux < tx + d.size && uy >= ty && uy < ty + d.size) return "A unit is in the way";
    }
    return null;
  }

  private nearestDropOff(u: Unit, resource: "gold" | "lumber"): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.buildings()) {
      if (b.owner !== u.owner || !b.complete) continue;
      if (!BUILDINGS[b.def]!.dropOff.includes(resource)) continue;
      const c = centerOf(b);
      const d = (c.x - u.pos.x) ** 2 + (c.y - u.pos.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** Nearest resource tile of a type to a position, searching outward. */
  private findResourceNear(tx: number, ty: number, tile: Tile, radius = 8): [number, number] | null {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let y = ty - radius; y <= ty + radius; y++)
      for (let x = tx - radius; x <= tx + radius; x++) {
        if (!this.map.inBounds(x, y) || this.map.get(x, y) !== tile || this.map.amount[this.map.idx(x, y)]! <= 0) continue;
        // Must have a walkable neighbour to harvest from.
        if (!this.adjacentWalkable(x, y, 1)) continue;
        const d = (x - tx) ** 2 + (y - ty) ** 2;
        if (d < bestD) {
          bestD = d;
          best = [x, y];
        }
      }
    return best;
  }

  private adjacentWalkable(tx: number, ty: number, size: number): boolean {
    for (let y = ty - 1; y <= ty + size; y++)
      for (let x = tx - 1; x <= tx + size; x++) {
        const inside = x >= tx && x < tx + size && y >= ty && y < ty + size;
        if (!inside && this.map.isWalkable(x, y)) return true;
      }
    return false;
  }

  private isAdjacentTo(u: Unit, tx: number, ty: number, size: number): boolean {
    const ux = Math.floor(u.pos.x / SUB);
    const uy = Math.floor(u.pos.y / SUB);
    return ux >= tx - 1 && ux <= tx + size && uy >= ty - 1 && uy <= ty + size && !(ux >= tx && ux < tx + size && uy >= ty && uy < ty + size);
  }

  // ───────────────────────────── commands ─────────────────────────────

  private emit(player: PlayerId, text: string, level: "info" | "error" = "error"): void {
    this.events.push({ tick: this.tick, player, text, level });
  }

  private ownedUnits(player: PlayerId, ids: EntityId[]): Unit[] {
    const out: Unit[] = [];
    for (const id of ids) {
      const e = this.entities.get(id);
      if (e && e.kind === "unit" && e.owner === player) out.push(e);
    }
    return out;
  }

  private applyCommand(c: Command): void {
    switch (c.type) {
      case "move": {
        for (const u of this.ownedUnits(c.player, c.units)) {
          u.task = { kind: "move", target: { x: c.x, y: c.y } };
          this.pathTo(u, Math.floor(c.x / SUB), Math.floor(c.y / SUB), true);
        }
        break;
      }
      case "attack": {
        const target = this.entities.get(c.target);
        if (!target || target.owner === c.player) break;
        for (const u of this.ownedUnits(c.player, c.units)) {
          if (UNITS[u.def]!.damage <= 0) continue;
          u.task = { kind: "attack", target: c.target };
          u.engaging = null;
        }
        break;
      }
      case "attackMove": {
        for (const u of this.ownedUnits(c.player, c.units)) {
          u.task = { kind: "attackMove", target: { x: c.x, y: c.y } };
          u.engaging = null;
          this.pathTo(u, Math.floor(c.x / SUB), Math.floor(c.y / SUB), true);
        }
        break;
      }
      case "stop": {
        for (const u of this.ownedUnits(c.player, c.units)) {
          u.task = { kind: "idle" };
          u.path = [];
          u.engaging = null;
        }
        break;
      }
      case "gather": {
        const t = this.map.inBounds(c.tx, c.ty) ? this.map.get(c.tx, c.ty) : Tile.Grass;
        const resource = t === Tile.Gold ? "gold" : t === Tile.Tree ? "lumber" : null;
        if (!resource) break;
        // Clicking the middle of a mine/forest targets a tile with no free edge —
        // snap to the nearest harvestable tile of the same kind instead.
        const node: [number, number] | null = this.adjacentWalkable(c.tx, c.ty, 1) ? [c.tx, c.ty] : this.findResourceNear(c.tx, c.ty, t);
        if (!node) break;
        for (const u of this.ownedUnits(c.player, c.units)) {
          if (!UNITS[u.def]!.canGather) continue;
          u.task = { kind: "gather", tx: node[0], ty: node[1], resource, phase: "toNode", timer: 0 };
          this.pathTo(u, node[0], node[1], true);
        }
        break;
      }
      case "build": {
        const workers = this.ownedUnits(c.player, c.units).filter((u) => UNITS[u.def]!.canBuild);
        if (workers.length === 0) break;
        // The royal line is the only way to found a capital. Expanding therefore
        // means walking your most valuable piece across contested ground, or
        // paying for an heir to do it instead.
        if (BUILDINGS[c.building]!.royalOnly && !workers.some((u) => UNITS[u.def]!.royal)) {
          this.emit(c.player, `Only the King or a Prince may found a ${BUILDINGS[c.building]!.name}`);
          break;
        }
        const royal = workers.some((u) => UNITS[u.def]!.royal);
        const err = this.placementError(c.player, c.building, c.tx, c.ty, royal);
        if (err) {
          this.emit(c.player, err);
          break;
        }
        const d = BUILDINGS[c.building]!;
        this.spend(c.player, d.cost);
        const b = this.placeBuilding(c.player, c.building, c.tx, c.ty)!;
        for (const u of workers) {
          u.task = { kind: "build", building: b.id };
          this.pathTo(u, b.tx + Math.floor(b.size / 2), b.ty + Math.floor(b.size / 2), true);
        }
        break;
      }
      case "repair": {
        const b = this.entities.get(c.target);
        if (!b || b.kind !== "building" || b.owner !== c.player) break;
        for (const u of this.ownedUnits(c.player, c.units)) {
          if (!UNITS[u.def]!.canBuild) continue;
          u.task = b.complete ? { kind: "repair", building: b.id } : { kind: "build", building: b.id };
          this.pathTo(u, b.tx + Math.floor(b.size / 2), b.ty + Math.floor(b.size / 2), true);
        }
        break;
      }
      case "train": {
        const b = this.entities.get(c.building);
        const d = UNITS[c.unit];
        if (!b || b.kind !== "building" || b.owner !== c.player || !b.complete || !d) break;
        if (!BUILDINGS[b.def]!.trains.includes(c.unit)) break;
        if (b.queue.length >= 5) {
          this.emit(c.player, "Queue is full");
          break;
        }
        if (!this.canAfford(c.player, d.cost)) {
          this.emit(c.player, "Not enough resources");
          break;
        }
        this.spend(c.player, d.cost);
        // Heirs are rationed: three at once, or the mechanic is just an
        // expensive worker and losing a King costs nothing.
        if (d.royal) {
          // Count the ones already ordered as well as the ones already alive.
          // Counting only the living let six orders queued in the same breath
          // slip five heirs past a cap of three, since none had been born yet.
          let heirs = this.units().filter((u) => u.owner === c.player && UNITS[u.def]!.royal && u.def !== "king").length;
          for (const hall of this.buildings())
            if (hall.owner === c.player) heirs += hall.queue.filter((j) => UNITS[j.unit]!.royal).length;
          if (heirs >= MAX_HEIRS) {
            this.emit(c.player, `You may have ${MAX_HEIRS} Princes at a time`);
            break;
          }
        }
        const train = this.paced(d.trainTime);
        b.queue.push({ unit: c.unit, remaining: train, total: train });
        break;
      }
      case "cancelTrain": {
        const b = this.entities.get(c.building);
        if (!b || b.kind !== "building" || b.owner !== c.player) break;
        const job = b.queue[c.index];
        if (!job) break;
        b.queue.splice(c.index, 1);
        this.refund(c.player, UNITS[job.unit]!.cost);
        break;
      }
      case "upgrade": {
        const b = this.entities.get(c.building);
        if (!b || b.kind !== "building" || b.owner !== c.player || !b.complete) break;
        const table = LEVELLED[b.def];
        if (!table) break;
        if (b.research) {
      if (--b.research.remaining <= 0) {
        const up = UPGRADES[b.research.id]!;
        const p = this.players.get(b.owner)!;
        p.research[up.id] = b.research.toLevel;
        this.emit(b.owner, `${up.name} ${b.research.toLevel} complete`, "info");
        b.research = null;
      }
      return; // researching halts training, as upgrading does
    }
    if (b.upgrade) {
          this.emit(c.player, "Already upgrading");
          break;
        }
        if (b.level >= table.length) {
          this.emit(c.player, "Already at maximum level");
          break;
        }
        const next = levelDef(b.def, b.level + 1);
        if (!this.canAfford(c.player, next.cost)) {
          this.emit(c.player, "Not enough resources");
          break;
        }
        this.spend(c.player, next.cost);
        const up = this.paced(next.time);
        b.upgrade = { toLevel: next.level, remaining: up, total: up };
        break;
      }
      case "research": {
        const b = this.entities.get(c.building);
        const up = UPGRADES[c.upgrade];
        if (!b || b.kind !== "building" || b.owner !== c.player || !b.complete || !up) break;
        if (up.host !== b.def) break;
        if (b.research || b.upgrade) break;
        const p = this.players.get(c.player)!;
        const have = p.research[up.id] ?? 0;
        if (have >= up.levels.length) {
          this.emit(c.player, `${up.name} is fully researched`);
          break;
        }
        const lv = up.levels[have]!;
        if (!this.canAfford(c.player, lv.cost)) {
          this.emit(c.player, "Not enough resources");
          break;
        }
        this.spend(c.player, lv.cost);
        const res = this.paced(lv.time);
        b.research = { id: up.id, toLevel: have + 1, remaining: res, total: res };
        break;
      }
      case "cancelResearch": {
        const b = this.entities.get(c.building);
        if (!b || b.kind !== "building" || b.owner !== c.player || !b.research) break;
        const up = UPGRADES[b.research.id]!;
        this.refund(c.player, up.levels[b.research.toLevel - 1]!.cost, CANCEL_REFUND);
        b.research = null;
        break;
      }
      case "cancelUpgrade": {
        const b = this.entities.get(c.building);
        if (!b || b.kind !== "building" || b.owner !== c.player || !b.upgrade) break;
        this.refund(c.player, levelDef(b.def, b.upgrade.toLevel).cost, CANCEL_REFUND);
        b.upgrade = null;
        break;
      }
      case "cancelBuild": {
        const b = this.entities.get(c.building);
        if (!b || b.kind !== "building" || b.owner !== c.player || b.complete) break;
        this.refund(c.player, BUILDINGS[b.def]!.cost, CANCEL_REFUND);
        this.removeEntity(b.id);
        break;
      }
    }
  }

  removeEntity(id: EntityId): void {
    const e = this.entities.get(id);
    if (!e) return;
    // The crown passes before the body is cleared away. The eldest surviving
    // heir is the lowest id, since ids are handed out in order -- so the prince
    // you trained first is the one who inherits.
    if (e.kind === "unit" && e.def === "king") {
      let heir: Unit | null = null;
      for (const u of this.units()) {
        if (u.owner !== e.owner || u.id === e.id) continue;
        if (!UNITS[u.def]!.royal || u.def === "king") continue;
        if (!heir || u.id < heir.id) heir = u;
      }
      if (heir) {
        heir.def = "king";
        const d = UNITS.king!;
        heir.maxHp = Math.round(d.hp * (1 + this.armourBonus(heir.owner)));
        // He inherits wounded, not renewed: the same fraction of health he had.
        heir.hp = Math.max(1, Math.round(heir.maxHp * (heir.hp / Math.max(1, heir.maxHp))));
        this.emit(e.owner, "The King has fallen. Long live the King.", "info");
      } else {
        this.emit(e.owner, "The King has fallen, and left no heir. No new Town Hall may be founded.");
      }
    }
    if (e.kind === "building") {
      this.map.release(e.tx, e.ty, e.size);
      // Refund queued training.
      for (const j of e.queue) this.refund(e.owner, UNITS[j.unit]!.cost);
      if (e.research) this.refund(e.owner, UPGRADES[e.research.id]!.levels[e.research.toLevel - 1]!.cost);
      if (e.upgrade) this.refund(e.owner, levelDef(e.def, e.upgrade.toLevel).cost);
      for (const u of this.units())
        if ((u.task.kind === "build" || u.task.kind === "repair") && u.task.building === id) u.task = { kind: "idle" };
    }
    this.entities.delete(id);
  }

  private pathTo(u: Unit, tx: number, ty: number, fresh = false): void {
    // A search that found nothing means there is no route right now -- the far
    // side of a wall, an island, a goal fenced in by buildings. Callers ask again
    // the moment a unit has no path, so without this the hopeless cases re-search
    // every tick for every unit, and a walled match ground to a halt as the
    // armies grew. Two seconds is long enough to be cheap and short enough that
    // a gate opening is noticed almost at once.
    // A fresh order always searches: the player has just told this unit to go
    // somewhere, and "I tried two seconds ago and it did not work" is not an
    // answer to that.
    if (!fresh && u.repathIn > 0) {
      u.repathIn--;
      return;
    }
    const sx = Math.floor(u.pos.x / SUB);
    const sy = Math.floor(u.pos.y / SUB);
    u.path = findPath(this.map, sx, sy, tx, ty, UNITS[u.def]!.domain);
    u.repathIn = u.path.length === 0 ? 40 : 0;
  }

  // ───────────────────────────── tick ─────────────────────────────

  step(commands: Command[]): void {
    this.events = [];
    this.fx = [];
    for (const c of commands) this.applyCommand(c);
    for (const b of this.buildings()) b.builders = 0;
    for (const u of this.units()) this.stepUnit(u);
    for (const b of this.buildings()) this.stepBuilding(b);
    this.separate();
    this.updateVision();
    this.pumpOil();
    this.checkDiscovery();
    this.checkRelics();
    this.checkVictory();
    // Projectiles are cosmetic; advance and retire them.
    for (const p of this.projectiles) p.t += p.speed;
    this.projectiles = this.projectiles.filter((p) => p.t < 1);
    this.tick++;
  }

  /**
   * Rebuild what everyone can see.
   *
   * Every few ticks rather than every tick: a unit moves a fraction of a tile in
   * one tick, so recomputing at 20Hz spends a great deal of work to produce the
   * same answer. Explored ground is permanent, so nothing is lost by the gap --
   * only the moment an enemy slips out of sight is blurred by a fifth of a
   * second, which no one can perceive.
   */
  private updateVision(): void {
    if (!this.fogEnabled) return;
    if (this.tick % VISION_INTERVAL !== 0) return;
    for (const [id, v] of this.vision) {
      const watchers: Array<{ x: number; y: number; r: number }> = [];
      for (const e of this.entities.values()) {
        if (e.owner !== id) continue;
        if (e.kind === "unit") {
          watchers.push({ x: e.pos.x, y: e.pos.y, r: UNITS[e.def]!.sight ?? 6 });
        } else {
          // A building watches from its middle, and a levelled Watch Tower
          // finally gets to use the radius it has always carried.
          const c = centerOf(e);
          const lv = LEVELLED[e.def] ? levelDef(e.def, e.level) : null;
          const r = e.def === "tower" && lv?.radius ? lv.radius : Math.max(5, e.size + 3);
          watchers.push({ x: c.x, y: c.y, r });
        }
      }
      v.update(watchers);
    }
  }

  /** Whether a player can see a given world point right now. */
  canSee(player: PlayerId, x: number, y: number): boolean {
    if (!this.fogEnabled) return true;
    return this.vision.get(player)?.seesPoint(x, y) ?? true;
  }

  /** Whether a player can currently see an entity. */
  canSeeEntity(player: PlayerId, e: Entity): boolean {
    if (!this.fogEnabled || e.owner === player) return true;
    const p = this.posOf(e);
    return this.canSee(player, p.x, p.y);
  }

  /**
   * A unit passing near the buried seam uncovers it. Checked a few times a second
   * rather than every tick — it costs a pass over every unit and nothing about it
   * needs tick precision.
   */
  private checkDiscovery(): void {
    const secret = this.map.secret;
    if (!secret || secret.found || this.tick % 5 !== 0) return;
    const range = 4 * SUB;
    for (const u of this.units()) {
      const dx = u.pos.x - (secret.x + 1) * SUB;
      const dy = u.pos.y - (secret.y + 1) * SUB;
      if (dx * dx + dy * dy > range * range) continue;
      if (this.map.revealSecret()) this.emit(u.owner, "Your scouts have uncovered a hidden gold seam!", "info");
      return;
    }
  }

  /** Oil Rigs pump continuously; output is banked once a second to keep it integral. */
  private pumpOil(): void {
    if (this.tick % TICKS_PER_SECOND !== 0) return;
    const crude = new Map<PlayerId, number>();
    const bonus = new Map<PlayerId, number>();
    for (const b of this.buildings()) {
      if (!b.complete) continue;
      const lv = LEVELLED[b.def] ? levelDef(b.def, b.level) : null;
      if (lv?.oilPerSecond) crude.set(b.owner, (crude.get(b.owner) ?? 0) + lv.oilPerSecond);
      // Only the best refinery counts, so a second one is redundant rather than stacking.
      if (lv?.refine) bonus.set(b.owner, Math.max(bonus.get(b.owner) ?? 0, lv.refine));
    }
    for (const [owner, raw] of crude) {
      this.players.get(owner)!.oil += Math.round(raw * (1 + (bonus.get(owner) ?? 0)));
    }
  }

  /** Crude per second before refining, and the refinery multiplier — for the HUD. */
  oilRate(player: PlayerId): { crude: number; multiplier: number } {
    let crude = 0;
    let mult = 1;
    for (const b of this.buildings()) {
      if (b.owner !== player || !b.complete) continue;
      const lv = LEVELLED[b.def] ? levelDef(b.def, b.level) : null;
      if (lv?.oilPerSecond) crude += lv.oilPerSecond;
      if (lv?.refine) mult = Math.max(mult, 1 + lv.refine);
    }
    return { crude, multiplier: mult };
  }

  // ───────────────────────────── combat ─────────────────────────────

  /** Centre of any entity, so units and buildings can be targeted alike. */
  private posOf(e: Entity): Vec {
    return e.kind === "unit" ? e.pos : centerOf(e);
  }

  /** Radius to aim at, so a unit stops at the edge of a big building. */
  private radiusOf(e: Entity): number {
    return e.kind === "unit" ? SUB * 0.35 : (e.size * SUB) / 2;
  }

  /** A unit's damage, range and armour after its owner's researched upgrades. */
  stats(u: Unit): { damage: number; range: number; armour: number } {
    const d = UNITS[u.def]!;
    const b = researchBonus(u.def, this.players.get(u.owner)?.research ?? {});
    return { damage: d.damage + b.damage, range: d.range + b.range, armour: d.armour + b.armour };
  }

  private hostile(a: Entity, b: Entity): boolean {
    return a.owner !== b.owner;
  }

  /** Nearest enemy within `range` sub-units of a unit, or null. */
  /**
   * An Icebreaker turns the floe under her into open water.
   *
   * It takes a moment -- she is grinding, not teleporting -- and the moment is
   * paced with the rest of the match, so on a long game a lane through the pack
   * is a real piece of work rather than a formality. Nothing else in the game
   * changes the map on purpose, which is the point: where she has been, the
   * whole fleet can follow, and the enemy infantry that were walking across that
   * ice can not.
   *
   * A tile with somebody standing on it is left alone. Dissolving the ground
   * under a stranger is a good joke exactly once and a bug every time after.
   */
  private grindIce(u: Unit): void {
    const tx = Math.floor(u.pos.x / SUB);
    const ty = Math.floor(u.pos.y / SUB);
    if (!this.map.inBounds(tx, ty) || this.map.get(tx, ty) !== Tile.Ice) return;
    for (const other of this.units())
      if (other.id !== u.id && Math.floor(other.pos.x / SUB) === tx && Math.floor(other.pos.y / SUB) === ty) return;
    const key = this.map.idx(tx, ty);
    const done = (this.grinding.get(key) ?? 0) + 1;
    if (done < this.paced(GRIND_TICKS)) {
      this.grinding.set(key, done);
      return;
    }
    this.grinding.delete(key);
    this.map.set(tx, ty, Tile.Water);
    this.fx.push({ kind: "chop", id: u.id, x: u.pos.x, y: u.pos.y });
  }

  private findTarget(u: Unit, range: number): Entity | null {
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const e of this.entities.values()) {
      if (!this.hostile(u, e)) continue;
      if (!this.canStrike(u, e)) continue;
      // Aircraft are only reachable by units that can shoot upward; for now
      // everything can, which keeps the first pass simple and readable.
      const p = this.posOf(e);
      const d = Math.hypot(p.x - u.pos.x, p.y - u.pos.y) - this.radiusOf(e);
      if (d > range || d >= bestD) continue;
      bestD = d;
      best = e;
    }
    return best;
  }

  /**
   * Apply damage, and remove the victim if it dies.
   *
   * A blow is rolled, not fixed: each unit has a `spread` saying how widely its
   * damage swings around the listed figure, and there is a chance of a critical
   * hit on top. A swordsman is consistent, a cannon is not, and no two exchanges
   * play out identically.
   *
   * The roll uses the world's seeded generator, never Math.random. Every client
   * runs the same steps in the same order from the same seed, so the same blow
   * lands for the same damage everywhere -- which is what keeps this safe for
   * lockstep play. A random source outside the sim would desync the game the
   * first time two players fought.
   */
  private damage(target: Entity, amount: number, attacker: Unit): void {
    const spread = UNITS[attacker.def]!.spread ?? 0.3;
    const swing = 1 + spread * (this.rng.next() * 2 - 1);
    const crit = this.rng.next() < CRIT_CHANCE;
    const rolled = amount * swing * (crit ? CRIT_MULTIPLIER : 1);
    const armour = target.kind === "unit" ? this.stats(target).armour : 2;
    const dealt = Math.max(1, Math.round(rolled - armour));
    target.hp -= dealt;
    const at = this.posOf(target);
    this.fx.push({ kind: "hit", id: target.id, x: at.x, y: at.y, building: target.kind === "building", amount: dealt, crit });
    if (target.hp > 0) return;
    this.fx.push({
      kind: "death",
      x: at.x,
      y: at.y,
      def: target.def,
      owner: target.owner,
      facing: target.kind === "unit" ? target.facing : 6,
      building: target.kind === "building",
    });
    const bounty = target.kind === "unit" ? UNITS[target.def]!.bounty : undefined;
    if (bounty) {
      const p = this.players.get(attacker.owner);
      if (p) p.gold += bounty;
      this.emit(attacker.owner, `${UNITS[target.def]!.name} killed — ${bounty} gold for the hide`, "info");
    }
    if (target.kind === "building") {
      this.emit(target.owner, `${BUILDINGS[target.def]!.name} destroyed`);
      this.emit(attacker.owner, `${BUILDINGS[target.def]!.name} destroyed`, "info");
    }
    this.removeEntity(target.id);
  }

  /**
   * Whether this attacker can touch that target at all.
   *
   * One rule, and it is the submarine's whole character: a submerged hull is not
   * merely hard to see, it is out of reach. A footman cannot swing at it, a tower
   * cannot depress its guns that far, a battleship's main battery fires flat over
   * the top of it. Only a ballista, which lobs its bolt, and another submarine,
   * which is down there with it, have any answer -- so a submarine loose in your
   * harbour is a problem you have to have prepared for, not one you can solve by
   * pointing the nearest soldiers at it.
   */
  canStrike(attacker: Unit, target: Entity): boolean {
    if (target.kind !== "unit") return true;
    if (!UNITS[target.def]!.submerged) return true;
    return UNITS[attacker.def]!.hitsSubmerged === true;
  }

  /**
   * Fire if in range and off cooldown. Returns true when the attack happened, so
   * the caller knows not to keep closing the distance.
   */
  private tryAttack(u: Unit, target: Entity): boolean {
    const def = UNITS[u.def]!;
    const st = this.stats(u);
    if (st.damage <= 0) return false;
    if (!this.canStrike(u, target)) return false;
    const p = this.posOf(target);
    const dist = Math.hypot(p.x - u.pos.x, p.y - u.pos.y) - this.radiusOf(target);
    if (dist > st.range * SUB) return false;
    u.path = [];
    const dx = p.x - u.pos.x;
    const dy = p.y - u.pos.y;
    u.facing = Math.round(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 8) % 8;
    if (u.cooldown > 0) return true;
    u.cooldown = def.cooldown;
    this.fx.push({ kind: "attack", x: u.pos.x, y: u.pos.y, tx: p.x, ty: p.y, def: u.def, ranged: st.range > 1.5 });
    this.damage(target, st.damage, u);
    if (st.range > 1.5) {
      this.projectiles.push({
        from: { x: u.pos.x, y: u.pos.y },
        to: { x: p.x, y: p.y },
        t: 0,
        speed: def.id === "bomber" ? 0.06 : 0.12,
        kind: def.id === "mage" ? "bolt" : def.id === "bomber" || def.id === "cannon" ? "shell" : "arrow",
      });
    }
    return true;
  }

  /** Idle and passing units shoot back at anything that comes close. */
  private autoAcquire(u: Unit): Entity | null {
    const def = UNITS[u.def]!;
    if (def.damage <= 0) return null;
    if (u.engaging !== null) {
      const e = this.entities.get(u.engaging);
      if (e && this.hostile(u, e)) {
        const p = this.posOf(e);
        if (Math.hypot(p.x - u.pos.x, p.y - u.pos.y) < (def.range + 3) * SUB) return e;
      }
      u.engaging = null;
    }
    // Workers only defend themselves at arm's length; soldiers watch a wider field.
    const watch = (def.canGather ? def.range + 0.5 : def.range + 2.5) * SUB;
    const t = this.findTarget(u, watch);
    u.engaging = t ? t.id : null;
    return t;
  }

  /** Nudge overlapping units apart so an army reads as a crowd, not one blob. */
  /**
   * Keep units from standing inside one another.
   *
   * Every push is accumulated first and applied once, clamped so that no unit is
   * ever shoved further in a tick than it can walk in one. Applying each pair's
   * push immediately let a unit with several neighbours be moved several times
   * its own speed backwards, so a crowd could pin its own members in place
   * indefinitely -- workers queueing at a drop-off simply stopped arriving. A
   * unit may now be slowed by a crush, never reversed by it.
   */
  private separate(): void {
    const units = this.units();
    const R = SUB * 0.55;
    const px = new Float64Array(units.length);
    const py = new Float64Array(units.length);
    for (let i = 0; i < units.length; i++) {
      const a = units[i]!;
      const da = UNITS[a.def]!.domain;
      for (let j = i + 1; j < units.length; j++) {
        const b = units[j]!;
        if (UNITS[b.def]!.domain !== da) continue; // a boat never jostles a footman
        let dx = b.pos.x - a.pos.x;
        let dy = b.pos.y - a.pos.y;
        let d = Math.hypot(dx, dy);
        if (d >= R) continue;
        if (d < 0.001) {
          // Exactly coincident: push apart along a fixed axis so it stays deterministic.
          dx = (a.id % 2 === 0 ? 1 : -1) * 0.5;
          dy = 0.5;
          d = Math.hypot(dx, dy);
        }
        const push = (R - d) / 2;
        px[i]! -= (dx / d) * push;
        py[i]! -= (dy / d) * push;
        px[j]! += (dx / d) * push;
        py[j]! += (dy / d) * push;
      }
    }
    for (let i = 0; i < units.length; i++) {
      let dx = px[i]!;
      let dy = py[i]!;
      const mag = Math.hypot(dx, dy);
      if (mag < 0.5) continue;
      const u = units[i]!;
      const cap = UNITS[u.def]!.speed * 0.6;
      if (mag > cap) {
        dx = (dx / mag) * cap;
        dy = (dy / mag) * cap;
      }
      const nx = Math.round(u.pos.x + dx);
      const ny = Math.round(u.pos.y + dy);
      if (this.map.isWalkable(Math.floor(nx / SUB), Math.floor(ny / SUB), UNITS[u.def]!.domain)) {
        u.pos.x = nx;
        u.pos.y = ny;
      }
    }
  }

  /**
   * The clan sends another man.
   *
   * In the crowning opening a player is one peasant and nothing else, and that
   * peasant has to cross open country under fog to reach his weapon. A bear
   * finding him first used to end the match outright: the other player, who had
   * done nothing but stand in his own clearing, was handed a Victory card
   * roughly twenty seconds in. That is not a game ending, it is a game failing
   * to start.
   *
   * So while the weapon is still in the ground, losing the man costs you the
   * walk, not the match -- another of the clan turns up at home and sets off
   * again, for as long as the weapon lies there unclaimed. There is no cap.
   * A cap of three was tried and was not enough: a bear that has wandered into
   * your clearing eats three men as readily as one, and the match still ended
   * before it started. Nobody can be knocked out of a game they have not yet
   * been allowed to begin.
   *
   * Two things keep this from being a farce. The replacement is not instant --
   * a few seconds pass, which is the cost of dying -- and he is put down away
   * from whatever killed the last one, so the clan is not feeding men one at a
   * time into the same bear.
   *
   * Once the weapon is lifted there is a King, a hall, and an army to lose, and
   * the ordinary rules apply again.
   */
  private sendHeir(player: PlayerId): boolean {
    const relic = this.relics.find((r) => r.owner === player && !r.taken);
    if (!relic) return false;
    const home = this.homes.get(player);
    if (!home) return false;
    const ready = this.nextHeir.get(player) ?? 0;
    // Not yet -- but the clan is not finished, so the player is still in the
    // match and the caller must not eliminate them.
    if (this.tick < ready) return true;

    // Anything hostile and alive that the next man should not be dropped on top
    // of. In the opening this is nearly always a bear.
    const threats: Array<{ x: number; y: number }> = [];
    for (const u of this.units()) {
      if (u.owner === player) continue;
      threats.push({ x: u.pos.x / SUB, y: u.pos.y / SUB });
    }
    const clear = (tx: number, ty: number): boolean =>
      threats.every((t) => Math.hypot(t.x - (tx + 0.5), t.y - (ty + 0.5)) >= 7);

    // Two passes out from the seat: first only tiles with nothing dangerous
    // near them, then any open tile at all rather than fail outright.
    for (const fussy of [true, false]) {
      for (let ring = 0; ring < 16; ring++) {
        for (let dy = -ring; dy <= ring; dy++) {
          for (let dx = -ring; dx <= ring; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            const tx = home.x + dx;
            const ty = home.y + dy;
            if (!this.map.inBounds(tx, ty) || !this.map.isWalkable(tx, ty, "amphibious")) continue;
            if (fussy && !clear(tx, ty)) continue;
            this.nextHeir.set(player, this.tick + this.paced(20 * 5));
            this.spawnUnit(player, "worker", { x: (tx + 0.5) * SUB, y: (ty + 0.5) * SUB });
            this.emit(player, "Your man is dead. Another of the clan sets out for the weapon.", "error");
            return true;
          }
        }
      }
    }
    return false;
  }

  /** A player with nothing left that could build has lost. */
  private checkVictory(): void {
    if (this.winner !== null || this.tick % 20 !== 0) return;
    // Alive means "can still do something": a standing building, or a worker who
    // could raise one. Counting buildings alone declared a winner on the first
    // tick of a nomad game, when by design nobody owns a building yet.
    const alive: PlayerId[] = [];
    for (const p of this.players.keys()) {
      // The wild does not win wars. Counting it kept every match alive forever,
      // because there was always one more bear in the woods.
      if (p === WILD) continue;
      let has = false;
      for (const e of this.entities.values()) {
        if (e.owner !== p) continue;
        if (e.kind === "building" || (e.kind === "unit" && UNITS[e.def]!.canBuild)) {
          has = true;
          break;
        }
      }
      // Nothing left, but the weapon is still out there: the clan gets another go.
      if (!has && this.sendHeir(p)) has = true;
      if (has) alive.push(p);
    }
    if (alive.length === 1) this.winner = alive[0]!;
  }

  private stepUnit(u: Unit): void {
    if (u.cooldown > 0) u.cooldown--;
    if (UNITS[u.def]!.breaksIce) this.grindIce(u);
    if (UNITS[u.def]!.beast) this.stepBeast(u);
    const t = u.task;
    switch (t.kind) {
      case "idle": {
        // Standing units defend themselves and anything beside them.
        const foe = this.autoAcquire(u);
        if (foe) this.tryAttack(u, foe);
        return;
      }
      case "move": {
        // Moving units shoot at what they pass without stopping to chase it.
        const foe = this.autoAcquire(u);
        if (foe && u.cooldown === 0) {
          const p = this.posOf(foe);
          const def = UNITS[u.def]!;
          if (Math.hypot(p.x - u.pos.x, p.y - u.pos.y) - this.radiusOf(foe) <= def.range * SUB) {
            const keep = [...u.path];
            this.tryAttack(u, foe);
            u.path = keep; // tryAttack halts a chaser; a moving unit keeps going
          }
        }
        if (this.followPath(u)) u.task = { kind: "idle" };
        return;
      }
      case "attack": {
        const target = this.entities.get(t.target);
        if (!target || !this.hostile(u, target)) {
          // Target gone: hold position and look for another rather than idling.
          u.task = { kind: "idle" };
          u.path = [];
          return;
        }
        if (this.tryAttack(u, target)) return;
        const p = this.posOf(target);
        if (u.path.length === 0 || this.tick % 20 === 0) {
          this.pathTo(u, Math.floor(p.x / SUB), Math.floor(p.y / SUB));
        }
        this.followPath(u);
        return;
      }
      case "attackMove": {
        const foe = this.autoAcquire(u);
        if (foe) {
          // Engage what we meet, but remember where we were heading.
          if (this.tryAttack(u, foe)) return;
          const p = this.posOf(foe);
          if (u.path.length === 0 || this.tick % 20 === 0) this.pathTo(u, Math.floor(p.x / SUB), Math.floor(p.y / SUB));
          this.followPath(u);
          return;
        }
        if (u.path.length === 0) this.pathTo(u, Math.floor(t.target.x / SUB), Math.floor(t.target.y / SUB));
        if (this.followPath(u)) u.task = { kind: "idle" };
        return;
      }
      case "build":
      case "repair": {
        const b = this.entities.get(t.building);
        if (!b || b.kind !== "building") {
          u.task = { kind: "idle" };
          return;
        }
        if (this.isAdjacentTo(u, b.tx, b.ty, b.size)) {
          u.path = [];
          const d = BUILDINGS[b.def]!;
          if (!b.complete) {
            b.builders++;
            // Diminishing returns for extra builders: 1st = 100%, each extra = +50%.
            const rate = (b.builders === 1 ? 1 : 0.5) / this.pace;
            b.progress = Math.min(d.buildTime, b.progress + rate);
            b.hp = Math.min(d.hp, b.hp + Math.ceil((d.hp * 0.9) / d.buildTime));
            if (b.progress >= d.buildTime) {
              b.complete = true;
              this.fx.push({ kind: "built", x: (b.tx + b.size / 2) * SUB, y: (b.ty + b.size / 2) * SUB, def: b.def });
              b.hp = d.hp;
              this.refreshArmour(b.owner);
              this.emit(b.owner, `${d.name} complete`, "info");
              u.task = { kind: "idle" };
              // Workers auto-return to gathering if the finished building is a drop-off.
              this.autoGatherAfterBuild(u, b);
            }
          } else if (t.kind === "repair" && b.hp < b.maxHp) {
            b.hp = Math.min(b.maxHp, b.hp + 1);
          } else {
            u.task = { kind: "idle" };
          }
          return;
        }
        if (this.followPath(u)) {
          // Arrived but not adjacent (shouldn't normally happen) — try again.
          this.pathTo(u, b.tx + Math.floor(b.size / 2), b.ty + Math.floor(b.size / 2));
          if (u.path.length === 0) u.task = { kind: "idle" };
        }
        return;
      }
      case "gather": {
        const def = UNITS[u.def]!;
        // A worker under attack fights back, but does not abandon its trip.
        if (def.damage > 0 && u.cooldown === 0) {
          const foe = this.findTarget(u, def.range * SUB);
          if (foe) {
            const keep = [...u.path];
            this.tryAttack(u, foe);
            u.path = keep;
          }
        }
        switch (t.phase) {
          case "toNode": {
            const amt = this.map.inBounds(t.tx, t.ty) ? this.map.amount[this.map.idx(t.tx, t.ty)]! : 0;
            const tile = t.resource === "gold" ? Tile.Gold : Tile.Tree;
            if (amt <= 0 || this.map.get(t.tx, t.ty) !== tile) {
              const alt = this.findResourceNear(t.tx, t.ty, tile);
              if (!alt) {
                u.task = { kind: "idle" };
                return;
              }
              [t.tx, t.ty] = alt;
              this.pathTo(u, t.tx, t.ty);
              return;
            }
            if (this.isAdjacentTo(u, t.tx, t.ty, 1)) {
              u.path = [];
              t.phase = "harvest";
              t.timer = this.paced(HARVEST_TICKS);
              return;
            }
            if (this.followPath(u)) {
              // Path exhausted but not adjacent: the node is unreachable from here.
              // Try another node of the same kind, or give up.
              const alt = this.findResourceNear(t.tx, t.ty, tile);
              if (!alt || (alt[0] === t.tx && alt[1] === t.ty)) {
                if (u.repathIn-- > 0) return;
                u.task = { kind: "idle" };
                return;
              }
              [t.tx, t.ty] = alt;
              this.pathTo(u, t.tx, t.ty);
              u.repathIn = 20;
            }
            return;
          }
          case "harvest": {
            // One stroke a second while the trip lasts: the swing the renderer
            // animates and the sound plays on, distinct from the load landing.
            if (t.timer % 20 === 0) this.fx.push({ kind: "chop", id: u.id, x: u.pos.x, y: u.pos.y });
            if (--t.timer > 0) return;
            const i = this.map.idx(t.tx, t.ty);
            const take = Math.min(def.carry, this.map.amount[i]!);
            this.map.amount[i]! -= take;
            if (this.map.amount[i]! <= 0) {
              // Trees are felled; gold mines become rock when exhausted.
              this.map.set(t.tx, t.ty, t.resource === "lumber" ? Tile.Grass : Tile.Rock);
              // Leave the stump, so the wood shows where it has been worked.
              if (t.resource === "lumber") this.map.felled[i] = 1;
            }
            u.carrying = { resource: t.resource, amount: take };
            t.phase = "toDrop";
            const drop = this.nearestDropOff(u, t.resource);
            if (!drop) {
              u.task = { kind: "idle" };
              return;
            }
            this.pathTo(u, drop.tx + Math.floor(drop.size / 2), drop.ty + Math.floor(drop.size / 2));
            return;
          }
          case "toDrop": {
            const drop = this.nearestDropOff(u, t.resource);
            if (!drop) {
              u.task = { kind: "idle" };
              return;
            }
            if (this.isAdjacentTo(u, drop.tx, drop.ty, drop.size)) {
              u.path = [];
              t.phase = "deposit";
              t.timer = this.paced(DEPOSIT_TICKS);
              return;
            }
            if (this.followPath(u)) this.pathTo(u, drop.tx + Math.floor(drop.size / 2), drop.ty + Math.floor(drop.size / 2));
            return;
          }
          case "deposit": {
            if (--t.timer > 0) return;
            if (u.carrying) {
              const p = this.players.get(u.owner)!;
              // A levelled drop-off adds a flat bonus to every load delivered there.
              const drop = this.nearestDropOff(u, u.carrying.resource);
              const bonus = drop && LEVELLED[drop.def] ? (levelDef(drop.def, drop.level).bonusCarry ?? 0) : 0;
              if (u.carrying.resource === "gold") {
                // A Gold Depot refines what is brought to it, so hauling ore to one
                // is worth more than hauling the same ore to the Town Hall.
                const rate = drop?.def === "golddepot" ? 1.25 : 1;
                p.gold += Math.round((u.carrying.amount + bonus) * rate);
              } else p.lumber += u.carrying.amount + bonus;
              this.fx.push({ kind: "deposit", x: u.pos.x, y: u.pos.y, resource: u.carrying.resource });
              u.carrying = null;
            }
            t.phase = "toNode";
            this.pathTo(u, t.tx, t.ty);
            return;
          }
        }
      }
    }
  }

  private autoGatherAfterBuild(u: Unit, b: Building): void {
    const d = BUILDINGS[b.def]!;
    if (d.dropOff.includes("lumber")) {
      const node = this.findResourceNear(b.tx, b.ty, Tile.Tree, 10);
      if (node) {
        u.task = { kind: "gather", tx: node[0], ty: node[1], resource: "lumber", phase: "toNode", timer: 0 };
        this.pathTo(u, node[0], node[1]);
      }
    }
  }

  /** True when an amphibious unit is currently over water. */
  isAfloat(u: Unit): boolean {
    if (UNITS[u.def]!.domain !== "amphibious") return false;
    const tx = Math.floor(u.pos.x / SUB);
    const ty = Math.floor(u.pos.y / SUB);
    return this.map.inBounds(tx, ty) && this.map.get(tx, ty) === Tile.Water;
  }

  /** Advance along the path. Returns true when the path is exhausted. */
  private followPath(u: Unit): boolean {
    if (u.path.length === 0) return true;
    const def = UNITS[u.def]!;
    // Drop any waypoint naming the tile we are already standing in.
    //
    // This used to require reaching the tile's exact CENTRE before advancing,
    // which deadlocked crowds: separation shoves a jostling unit off-centre
    // faster than it can walk back, so a worker in a queue at the drop-off
    // would aim at its own tile centre forever and never reach it. Five of the
    // AI's workers were frozen this way by the six-minute mark, which is most
    // of what "the enemy gets stuck" looked like. Arriving anywhere inside the
    // tile is enough, and it makes units cut corners instead of zig-zagging
    // from centre to centre.
    {
      const utx = Math.floor(u.pos.x / SUB);
      const uty = Math.floor(u.pos.y / SUB);
      while (u.path.length > 0 && u.path[0]![0] === utx && u.path[0]![1] === uty) u.path.shift();
      if (u.path.length === 0) return true;
    }
    let speed = def.speed;
    // Swimmers move at roughly half pace while they are in the water.
    if (def.domain === "amphibious" && this.isAfloat(u)) speed = Math.max(1, Math.round(speed * 0.5));
    // Pushing through standing timber: a third of the pace. The wood is not a
    // wall any more, it is a cost -- and that is the whole tactical value of a
    // forest, because a defender who knows the ground can hold the open lane
    // while the attacker wades.
    if (def.domain === "land" || def.domain === "amphibious") {
      const tx0 = Math.floor(u.pos.x / SUB);
      const ty0 = Math.floor(u.pos.y / SUB);
      if (this.map.inBounds(tx0, ty0) && this.map.get(tx0, ty0) === Tile.Tree) speed = Math.max(1, Math.round(speed * 0.35));
    }
    // An Icebreaker in the pack is grinding, not sailing: she stops dead on a
    // floe until it has broken, then carries on into the next one. Merely
    // slowing her was not enough -- at a quarter speed she still crossed a tile
    // in twenty-three ticks and a floe takes forty to break, so she sailed over
    // four tiles of pack and left every one of them intact, which is the exact
    // opposite of the idea. Stopping her also makes the lane whole by
    // construction: she cannot pass a tile she has not opened.
    if (def.breaksIce) {
      const tx0 = Math.floor(u.pos.x / SUB);
      const ty0 = Math.floor(u.pos.y / SUB);
      if (this.map.inBounds(tx0, ty0) && this.map.get(tx0, ty0) === Tile.Ice) return false;
    }
    const [tx, ty] = u.path[0]!;
    const goal = { x: tx * SUB + SUB / 2, y: ty * SUB + SUB / 2 };
    // If the next tile has become blocked (a building was placed), re-path.
    if (!this.map.isWalkable(tx, ty, UNITS[u.def]!.domain)) {
      if (u.repathIn-- <= 0) {
        const last = u.path[u.path.length - 1]!;
        this.pathTo(u, last[0], last[1]);
        u.repathIn = 10;
      }
      return u.path.length === 0;
    }
    const dx = goal.x - u.pos.x;
    const dy = goal.y - u.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= speed) {
      u.pos.x = goal.x;
      u.pos.y = goal.y;
      u.path.shift();
    } else {
      u.pos.x = Math.round(u.pos.x + (dx / dist) * speed);
      u.pos.y = Math.round(u.pos.y + (dy / dist) * speed);
    }
    u.facing = Math.round(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 8) % 8;
    return u.path.length === 0;
  }

  private stepBuilding(b: Building): void {
    if (!b.complete) return;
    // A completed Church mends friendly units standing within its radius.
    const lv = LEVELLED[b.def] ? levelDef(b.def, b.level) : null;
    if (lv?.heal && lv.radius) {
      const c = centerOf(b);
      const r2 = (lv.radius * SUB) ** 2;
      for (const u of this.units()) {
        if (u.owner !== b.owner || u.hp >= u.maxHp) continue;
        if ((u.pos.x - c.x) ** 2 + (u.pos.y - c.y) ** 2 > r2) continue;
        u.hp = Math.min(u.maxHp, u.hp + lv.heal);
      }
    }
    if (b.research) {
      if (--b.research.remaining <= 0) {
        const up = UPGRADES[b.research.id]!;
        const p = this.players.get(b.owner)!;
        p.research[up.id] = b.research.toLevel;
        this.emit(b.owner, `${up.name} ${b.research.toLevel} complete`, "info");
        b.research = null;
      }
      return; // researching halts training, as upgrading does
    }
    if (b.upgrade) {
      if (--b.upgrade.remaining <= 0) {
        b.level = b.upgrade.toLevel;
        b.upgrade = null;
        const lv = levelDef(b.def, b.level);
        // Keep the damage proportion across the HP increase.
        const frac = b.hp / b.maxHp;
        b.maxHp = lv.hp;
        b.hp = Math.round(lv.hp * frac);
        this.emit(b.owner, `${lv.name} complete (level ${b.level})`, "info");
        if (lv.armour) this.refreshArmour(b.owner);
      }
      return; // upgrading halts training
    }
    const job = b.queue[0];
    if (!job) return;
    const d = UNITS[job.unit]!;
    const s = this.supply(b.owner);
    if (s.used + d.supply > s.max) {
      if (this.tick % 100 === 0) this.emit(b.owner, "Not enough supply — build another Town Hall");
      return;
    }
    // A levelled workshop trains faster.
    const speed = LEVELLED[b.def] ? (levelDef(b.def, b.level).trainSpeed ?? 1) : 1;
    job.remaining -= speed;
    if (job.remaining > 0) return;
    const spawn = this.findSpawnTile(b, d.domain);
    if (!spawn) {
      this.emit(b.owner, `No room to place ${d.name}`);
      job.remaining = 20; // retry shortly
      return;
    }
    b.queue.shift();
    const u = this.spawnUnit(b.owner, job.unit, { x: spawn[0] * SUB + SUB / 2, y: spawn[1] * SUB + SUB / 2 });
    if (b.rally) {
      u.task = { kind: "move", target: b.rally };
      this.pathTo(u, Math.floor(b.rally.x / SUB), Math.floor(b.rally.y / SUB));
    }
  }

  private findSpawnTile(b: Building, domain: Domain): [number, number] | null {
    for (let r = 1; r < 6; r++)
      for (let y = b.ty - r; y <= b.ty + b.size - 1 + r; y++)
        for (let x = b.tx - r; x <= b.tx + b.size - 1 + r; x++) {
          const edge = x === b.tx - r || x === b.tx + b.size - 1 + r || y === b.ty - r || y === b.ty + b.size - 1 + r;
          if (edge && this.map.isWalkable(x, y, domain)) return [x, y];
        }
    return null;
  }
}

export { Faction };
