/**
 * Skirmish AI.
 *
 * It plays through the same `Command` queue a human uses — it never touches sim
 * state directly. That constraint is deliberate: anything the AI can do, a player
 * could have done, so the AI cannot desync a lockstep game and cannot cheat by
 * accident. It also means a replay of an AI game is just a command log.
 *
 * The behaviour is a build order with a few standing rules layered over it:
 * keep workers busy, keep supply ahead of the army, build what the order asks for
 * next, train soldiers when there is somewhere to train them, and attack once a
 * warband is big enough.
 */

import { BUILDINGS } from "../data/buildings";
import { UNITS } from "../data/units";
import type { Command } from "../sim/commands";
import { centerOf, type Building, type Unit } from "../sim/entities";
import { SUB, Tile, type PlayerId } from "../sim/types";
import type { World } from "../sim/world";
import { findPath } from "../sim/pathfinding";

/**
 * "none" leaves the opponent absent entirely -- an empty map to build on.
 * "peaceful" gives you a living neighbour who develops its own base and will
 * defend itself if provoked, but never marches on you. Between the two you can
 * build undisturbed either in silence or with something to look at.
 */
export type Difficulty = "none" | "peaceful" | "easy" | "normal" | "hard";

/** How the difficulties differ: pace, army size before attacking, worker count. */
const SETTINGS: Record<
  Exclude<Difficulty, "none">,
  { think: number; armySize: number; workers: number; patience: number }
> = {
  // `patience` is seconds a warband will wait for its last recruits before
  // attacking with what it has. Hard is impatient, which reads as aggression;
  // easy dithers, which reads as an opponent you can out-tempo.
  // Peaceful builds and defends its ground but never launches an attack, so the
  // numbers below only govern how briskly it develops.
  peaceful: { think: 30, armySize: 99, workers: 12, patience: 1e9 },
  easy: { think: 40, armySize: 5, workers: 6, patience: 90 },
  normal: { think: 20, armySize: 8, workers: 10, patience: 55 },
  hard: { think: 12, armySize: 12, workers: 14, patience: 30 },
};

/** The order it builds in. Repeats the last entries once the list is exhausted. */
const BUILD_ORDER = ["farm", "barracks", "lumbermill", "farm", "barracks", "tower", "farm", "stables", "farm", "church"];

export class SkirmishAI {
  private wave = 0;
  /** Cached answer to "can we get out of here at all", and when it was asked. */
  private gateOpen: boolean | null = null;
  private gateChecked = -1e9;
  /** Tick the current warband started massing, for the patience timer below. */
  private massingSince = 0;

  constructor(
    private readonly world: World,
    private readonly player: PlayerId,
    private readonly difficulty: Exclude<Difficulty, "none"> = "normal",
  ) {}

  private get cfg() {
    return SETTINGS[this.difficulty];
  }

  private mine(): Building[] {
    return this.world.buildings().filter((b) => b.owner === this.player);
  }
  private myUnits(): Unit[] {
    return this.world.units().filter((u) => u.owner === this.player);
  }
  private workers(): Unit[] {
    return this.myUnits().filter((u) => UNITS[u.def]!.canGather);
  }
  /** Anything that can raise a building -- workers, and the royal line. */
  private builders(): Unit[] {
    return this.myUnits().filter((u) => UNITS[u.def]!.canBuild);
  }
  /** The King and his heirs: the only units that may found a Town Hall. */
  private royals(): Unit[] {
    return this.myUnits().filter((u) => UNITS[u.def]!.royal);
  }
  private soldiers(): Unit[] {
    return this.myUnits().filter((u) => UNITS[u.def]!.damage > 0 && !UNITS[u.def]!.canGather);
  }
  private has(def: string): boolean {
    return this.mine().some((b) => b.def === def && b.complete);
  }

  /** One decision pass. Returns the commands to issue this tick. */
  think(tick: number): Command[] {
    if (this.world.winner !== null) return [];
    if (tick % this.cfg.think !== 0) return [];
    const out: Command[] = [];
    this.seekWeapon(out);
    this.workGate(out);
    this.keepWorkersBusy(out);
    this.trainUnits(out);
    this.buildSomething(out, tick);
    // Defence first: a warband massing for an attack that ignores an enemy
    // already inside its own base is the single most obviously stupid thing an
    // RTS opponent can do.
    // A peaceful neighbour still answers an attack on its own ground -- it is
    // peaceful, not defenceless -- but it never goes looking for one.
    const attacked = this.defend(out);
    if (!attacked && this.difficulty !== "peaceful") this.attackIfReady(out, tick);
    return out;
  }

  // ───────────────────────────── economy ─────────────────────────────

  private keepWorkersBusy(out: Command[]): void {
    const idle = this.workers().filter((u) => u.task.kind === "idle");
    if (idle.length === 0) return;
    const hall = this.mine().find((b) => b.def === "townhall");
    if (!hall) return;
    const c = centerOf(hall);
    // Split roughly two thirds onto gold, since gold gates almost everything.
    const p = this.world.players.get(this.player)!;
    const wantLumber = p.lumber < p.gold * 0.6;
    for (const u of idle) {
      // Try the resource we want, then the other one, then anything at all.
      // Falling through matters: a worker that finds no tree within range used
      // to stand still for the rest of the game rather than go and mine gold.
      const node =
        this.nearestResource(c.x, c.y, wantLumber ? Tile.Tree : Tile.Gold) ??
        this.nearestResource(c.x, c.y, wantLumber ? Tile.Gold : Tile.Tree);
      if (node) {
        out.push({ type: "gather", player: this.player, units: [u.id], tx: node[0], ty: node[1] });
        continue;
      }
      // Nothing left to gather: put them on whatever is half-built instead.
      const site = this.mine().find((b) => !b.complete);
      if (site) out.push({ type: "repair", player: this.player, units: [u.id], target: site.id });
    }
  }

  /** Can this unit walk to that point at all? */
  private canReach(from: Unit, wx: number, wy: number): boolean {
    const map = this.world.map;
    return (
      findPath(
        map,
        Math.floor(from.pos.x / SUB),
        Math.floor(from.pos.y / SUB),
        Math.floor(wx / SUB),
        Math.floor(wy / SUB),
        "land",
      ).length > 0
    );
  }

  /**
   * Act one: send the peasant for the weapon.
   *
   * In the crowning opening nobody starts royal, and only royalty may found a
   * hall -- so until this errand is run the opponent cannot build anything at
   * all. It knows where its own weapon lies, which is fair: it is its own
   * destiny, and a computer opponent wandering a 160-tile board hoping to
   * stumble on it would simply never play the game.
   */
  private seekWeapon(out: Command[]): void {
    const mine = this.world.relics.find((r) => r.owner === this.player && !r.taken);
    if (!mine) return;
    const man = this.myUnits().find((u) => UNITS[u.def]!.canGather);
    if (!man || man.task.kind !== "idle") return;
    out.push({
      type: "move",
      player: this.player,
      units: [man.id],
      x: (mine.x + 0.5) * SUB,
      y: (mine.y + 0.5) * SUB,
    });
  }

  /**
   * The gate crew.
   *
   * On a walled start the opponent is fenced into its own timber exactly as the
   * player is, and without this it simply developed a fine base and never once
   * left it. So a standing crew of woodcutters works a lane outwards from the
   * first minute, the way a player's first three peasants would: pick the line
   * towards the enemy, put every spare axe on the nearest trunk in it, and keep
   * going until daylight shows through.
   *
   * They are ordered only when idle. The first version re-sent the order every
   * think cycle, which reset each walk before a blow landed -- 1,151 orders in
   * 4,000 ticks felled three trees.
   */
  private workGate(out: Command[]): void {
    // The reachability test is a full-board A* that fails, which is the most
    // expensive search there is -- running it every think cycle cost more than
    // the rest of the AI put together. Once a minute is plenty: a gate does not
    // open between one glance and the next.
    const tick = this.world.tick;
    if (tick - this.gateChecked > 200) {
      this.gateChecked = tick;
      this.gateOpen = null;
    }
    if (this.gateOpen === true) return;
    const map = this.world.map;
    const hall = this.mine().find((b) => b.def === "townhall") ?? this.mine()[0];
    if (!hall) return;
    const enemy = this.world
      .buildings()
      .filter((b) => b.owner !== this.player)
      .sort((a, b) => a.id - b.id)[0];
    if (!enemy) return;
    const scout = this.workers()[0];
    if (!scout) return;
    const goal = centerOf(enemy);
    // Nothing to do once there is a way through.
    if (this.gateOpen === null) this.gateOpen = this.canReach(scout, goal.x, goal.y);
    if (this.gateOpen) return;

    const from = centerOf(hall);
    const x0 = from.x / SUB;
    const y0 = from.y / SUB;
    const dx = goal.x / SUB - x0;
    const dy = goal.y / SUB - y0;
    const len = Math.hypot(dx, dy) || 1;
    // Walk out along the line and take the first standing trunks, two abreast so
    // the gate is wide enough for a column rather than single file.
    const targets: Array<[number, number]> = [];
    for (let step = 1; step < 60 && targets.length < 2; step++)
      for (const off of [0, 1]) {
        const px = Math.round(x0 + (dx / len) * step - (dy / len) * off);
        const py = Math.round(y0 + (dy / len) * step + (dx / len) * off);
        if (!map.inBounds(px, py) || map.get(px, py) !== Tile.Tree) continue;
        if (map.amount[map.idx(px, py)]! <= 0) continue;
        if (targets.some(([tx, ty]) => tx === px && ty === py)) continue;
        targets.push([px, py]);
      }
    if (targets.length === 0) return;

    // Half the workforce, and only the ones standing about.
    const all = this.workers();
    const crew = all.slice(0, Math.max(2, Math.ceil(all.length / 2))).filter((u) => u.task.kind === "idle");
    for (let i = 0; i < crew.length; i++) {
      const t = targets[i % targets.length]!;
      out.push({ type: "gather", player: this.player, units: [crew[i]!.id], tx: t[0], ty: t[1] });
    }
  }

  private nearestResource(wx: number, wy: number, tile: Tile): [number, number] | null {
    const map = this.world.map;
    const tx = Math.floor(wx / SUB);
    const ty = Math.floor(wy / SUB);
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let r = 1; r < 24 && !best; r++) {
      for (let y = ty - r; y <= ty + r; y++)
        for (let x = tx - r; x <= tx + r; x++) {
          if (!map.inBounds(x, y) || map.get(x, y) !== tile || map.isHidden(x, y)) continue;
          if (map.amount[map.idx(x, y)]! <= 0) continue;
          const d = (x - tx) ** 2 + (y - ty) ** 2;
          if (d < bestD) {
            bestD = d;
            best = [x, y];
          }
        }
    }
    return best;
  }

  // ───────────────────────────── production ─────────────────────────────

  private trainUnits(out: Command[]): void {
    const supply = this.world.supply(this.player);
    const headroom = supply.max - supply.used;
    const hall = this.mine().find((b) => b.def === "townhall" && b.complete);

    // Workers first, up to the target, while there is room to feed them.
    if (hall && this.workers().length < this.cfg.workers && headroom >= 1 && hall.queue.length === 0) {
      out.push({ type: "train", player: this.player, building: hall.id, unit: "worker" });
      return;
    }
    // Then soldiers from every idle barracks.
    for (const b of this.mine()) {
      if (!b.complete || b.queue.length > 0) continue;
      const trains = BUILDINGS[b.def]!.trains.filter((u) => UNITS[u]!.damage > 0 && !UNITS[u]!.canGather);
      if (trains.length === 0) continue;
      const unit = trains[this.wave % trains.length]!;
      if (headroom < UNITS[unit]!.supply) continue;
      if (!this.world.canAfford(this.player, UNITS[unit]!.cost)) continue;
      out.push({ type: "train", player: this.player, building: b.id, unit });
    }
  }

  private buildSomething(out: Command[], tick: number): void {
    // No hall, so found one before anything else -- and only the royal line may.
    // In a nomad opening the King is the ONLY unit on the field, so looking for
    // a peasant here (as this did) left the AI standing on an empty map for the
    // whole game.
    if (!this.mine().some((b) => b.def === "townhall")) {
      const royal = this.royals().find((u) => u.task.kind === "idle" || u.task.kind === "gather");
      if (!royal) return;
      const site = this.foundSite(royal);
      if (site) out.push({ type: "build", player: this.player, units: [royal.id], building: "townhall", tx: site[0], ty: site[1] });
      return;
    }

    // Everything else is peasants' work; the King is too valuable for it.
    const builder =
      this.builders().find((u) => !UNITS[u.def]!.royal && (u.task.kind === "gather" || u.task.kind === "idle")) ??
      this.workers().find((u) => u.task.kind === "gather" || u.task.kind === "idle");
    if (!builder) return;

    const supply = this.world.supply(this.player);

    // Supply block trumps the build order — an army that cannot be fed is no army.
    let want: string | null = null;
    if (supply.max - supply.used <= 2) want = "farm";
    else {
      const built = this.mine();
      for (const def of BUILD_ORDER) {
        const wanted = BUILD_ORDER.filter((d) => d === def).length;
        const have = built.filter((b) => b.def === def).length;
        if (have < wanted) {
          want = def;
          break;
        }
      }
    }
    if (!want) return;

    const d = BUILDINGS[want]!;
    if (!this.world.canAfford(this.player, d.cost)) return;
    if (d.requires.some((r) => !this.has(r))) return;

    const site = this.findSite(want, tick);
    if (!site) return;
    out.push({ type: "build", player: this.player, units: [builder.id], building: want, tx: site[0], ty: site[1] });
  }

  /**
   * Somewhere to put the very first Town Hall, spiralling out from a worker.
   * Prefers a spot with gold within a short walk, since a hall far from a seam
   * is a lost game however pretty the ground is.
   */
  private foundSite(builder: Unit): [number, number] | null {
    const bx = Math.floor(builder.pos.x / SUB);
    const by = Math.floor(builder.pos.y / SUB);
    let fallback: [number, number] | null = null;
    for (let r = 0; r < 14; r++) {
      for (let i = 0; i < Math.max(1, r * 8); i++) {
        const a = (i / Math.max(1, r * 8)) * Math.PI * 2;
        const x = bx + Math.round(Math.cos(a) * r);
        const y = by + Math.round(Math.sin(a) * r);
        if (this.world.placementError(this.player, "townhall", x, y) !== null) continue;
        if (!fallback) fallback = [x, y];
        const gold = this.nearestResource(x * SUB, y * SUB, Tile.Gold);
        if (gold && Math.hypot(gold[0] - x, gold[1] - y) < 9) return [x, y];
      }
    }
    return fallback;
  }

  /** A buildable spot spiralling out from the town hall. */
  private findSite(def: string, tick: number): [number, number] | null {
    const hall = this.mine().find((b) => b.def === "townhall");
    if (!hall) return null;
    const cx = hall.tx;
    const cy = hall.ty;
    // Vary the search origin a little over time so it does not wall itself in.
    const skew = tick % 4;
    for (let r = 3; r < 18; r++) {
      for (let i = 0; i < r * 8; i++) {
        const a = ((i + skew) / (r * 8)) * Math.PI * 2;
        const x = cx + Math.round(Math.cos(a) * r);
        const y = cy + Math.round(Math.sin(a) * r);
        if (this.world.placementError(this.player, def, x, y) === null) return [x, y];
      }
    }
    return null;
  }

  // ───────────────────────────── aggression ─────────────────────────────

  /**
   * Answer an attack on our own ground. Returns true when it took command of the
   * army, so the attack logic stands down for this pass.
   *
   * Anything hostile within eight tiles of a building of ours pulls every idle
   * soldier onto it, whatever the warband is doing. Nearby workers are left
   * alone: pulling them off gold to throw them at a knight loses the economy and
   * the fight.
   */
  private defend(out: Command[]): boolean {
    const mine = this.mine();
    if (mine.length === 0) return false;
    const range = 8 * SUB;
    let threat: Unit | null = null;
    let bestD = Infinity;
    for (const e of this.world.units()) {
      if (e.owner === this.player || UNITS[e.def]!.damage <= 0) continue;
      for (const b of mine) {
        const c = centerOf(b);
        const d = (e.pos.x - c.x) ** 2 + (e.pos.y - c.y) ** 2;
        if (d < range * range && d < bestD) {
          bestD = d;
          threat = e;
        }
      }
    }
    if (!threat) return false;
    const idle = this.soldiers().filter((u) => u.task.kind === "idle");
    if (idle.length === 0) return true; // under attack, nothing spare — still our problem
    out.push({ type: "attack", player: this.player, units: idle.map((u) => u.id), target: threat.id });
    return true;
  }

  /**
   * Launch the warband.
   *
   * The size threshold used to be absolute, and that was the single worst thing
   * about this opponent: an army one soldier short of the target stood in its own
   * base indefinitely. Measured on a normal game, it issued no attack order at all
   * in six thousand ticks while seven footmen at full health watched the enemy
   * rebuild. Two escapes now: a patience timer, so a warband that has waited long
   * enough goes with what it has, and a rule that a nearly-dead enemy is worth
   * attacking with anything.
   */
  private attackIfReady(out: Command[], tick: number): void {
    const army = this.soldiers();
    if (army.length === 0) {
      this.massingSince = tick;
      return;
    }
    const enemyBuildings = this.world.buildings().filter((b) => b.owner !== this.player).length;
    const waited = tick - this.massingSince;
    const ready =
      army.length >= this.cfg.armySize ||
      // Patience: go with what we have rather than wait for a soldier that may
      // never be affordable.
      (army.length >= 3 && waited > 20 * this.cfg.patience) ||
      // A crippled enemy is worth finishing with whatever is standing.
      (enemyBuildings <= 2 && army.length >= 2);
    if (!ready) return;
    // Send everything at the enemy's nearest building; workers stay home.
    const enemy = this.world
      .buildings()
      .filter((b) => b.owner !== this.player)
      .sort((a, b) => a.id - b.id)[0];
    if (!enemy) return;
    const c = centerOf(enemy);
    // If the warband cannot walk there, it has to cut its way out first. On a
    // walled start the opponent is fenced into its own timber exactly as the
    // player is, and an army that could not reach anything simply milled about
    // at home for the whole match. Felling a lane is a real decision, made with
    // the same gather orders a player would give.
    // No road out yet: the gate crew is already on it (see workGate). Hold the
    // warband at home rather than sending it to mill about against a treeline.
    if (this.gateOpen === false) return;
    // Anything standing still goes, including survivors of the last wave: they
    // used to sit on the wreckage of what they had killed waiting for a whole
    // fresh warband to mass behind them.
    const idle = army.filter((u) => u.task.kind === "idle");
    if (idle.length === 0) return;
    this.wave++;
    this.massingSince = tick;
    out.push({ type: "attackMove", player: this.player, units: idle.map((u) => u.id), x: c.x, y: c.y });
  }
}
