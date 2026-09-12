/**
 * Deterministic lockstep.
 *
 * Two people in different houses play the same match by running the same
 * simulation, not by one of them running it and posting pictures. Nothing about
 * the world ever crosses the wire -- no unit positions, no health, no map. What
 * crosses is orders: "player 2 told these four units to move to 40,17". A few
 * hundred bytes a second, against the megabytes a state-sync design would need
 * for a 160-tile board with three hundred entities on it.
 *
 * The bargain that makes it work is that both machines must compute *exactly*
 * the same thing from the same orders, forever. The simulation here was written
 * for that from the start -- it is seeded, it takes commands and nothing else,
 * and the settings deliberately never reach into it -- but "written for it" and
 * "verified" are different things, so this module carries a checksum and shouts
 * when the two worlds disagree. A desync caught on the turn it happens is a bug
 * report. A desync noticed five minutes later is a mystery.
 *
 * ── Turns, and why the game does not stutter ──
 *
 * Ticks are not sent individually; that would be twenty messages a second each
 * way and twenty chances to stall. Ticks are grouped into TURNS, and orders are
 * scheduled for a turn a little way ahead -- the INPUT DELAY. Press a button
 * now and it is executed two turns from now on both machines at once. That is
 * the cost: up to a couple of hundred milliseconds between click and response,
 * which in an RTS, where you are commanding people who take time to set off
 * anyway, is close to invisible. It is what buys the network time to deliver.
 *
 * If a turn's orders have not all arrived, the simulation STOPS -- every client
 * stops at the same turn, which is why they stay identical. Rendering carries on
 * so the game does not appear frozen; it just stops advancing. This is the
 * classic RTS stall, and it is correct behaviour, not a failure.
 */

import type { Command } from "../sim/commands";

/** How often the two worlds are compared. Every turn would be wasteful. */
export const CHECKSUM_EVERY = 10;

/** One player's orders for one turn. An empty array is a real, required answer. */
export interface TurnOrders {
  turn: number;
  slot: number;
  commands: Command[];
  /** World checksum at the start of this turn, when one was taken. */
  checksum?: number;
}

/**
 * What a transport must do. Deliberately small: everything above it is the same
 * whether the other player is across the internet or does not exist.
 */
export interface Transport {
  /** Which seat this machine is playing. */
  readonly slot: number;
  /** How many seats must report before a turn may run. */
  readonly slots: number;
  /**
   * Sim ticks per network turn, and how many turns ahead orders are scheduled.
   *
   * These belong to the transport rather than to the scheduler because they are
   * a statement about the wire, and a local game has no wire. Over a network,
   * 4 and 2 means orders are published 400 ms before they run -- enough slack
   * for a round trip between two houses, and little enough that the delay
   * between clicking and a unit setting off is not something you notice in a
   * game where units take a moment to set off anyway.
   *
   * A local game sets 1 and 0, which collapses the whole turn machinery back to
   * "apply what was queued, then tick" -- exactly what the game did before any
   * of this existed. Single-player must not pay for multiplayer.
   */
  readonly ticksPerTurn: number;
  readonly inputDelay: number;
  /** Publish this machine's orders for a turn. */
  send(orders: TurnOrders): void;
  /** Called with every player's orders, including this machine's own. */
  onOrders(cb: (o: TurnOrders) => void): void;
  /** Called when the match cannot continue -- someone left, socket died. */
  onFailure(cb: (why: string) => void): void;
  close(): void;
}

/**
 * A transport for a game with nobody else in it.
 *
 * Single-player and skirmish-against-the-AI go through exactly the same turn
 * machinery as a network game. That is the point: the lockstep path is the only
 * path, so it is exercised every time anybody plays, and it cannot rot while
 * nobody is looking at multiplayer.
 */
export class LocalTransport implements Transport {
  readonly slot = 0;
  readonly slots = 1;
  readonly ticksPerTurn = 1;
  readonly inputDelay = 0;
  private cb: ((o: TurnOrders) => void) | null = null;
  send(orders: TurnOrders): void {
    // Straight back, same frame. No delay is simulated: a local game has no
    // network to be honest about.
    this.cb?.(orders);
  }
  onOrders(cb: (o: TurnOrders) => void): void {
    this.cb = cb;
  }
  onFailure(): void {
    // Nothing can fail.
  }
  close(): void {
    this.cb = null;
  }
}

/** What the scheduler decided this frame, for the HUD to show. */
export type LockstepState =
  | { kind: "running" }
  /** Waiting on orders: who from, and for how long. */
  | { kind: "stalled"; waitingOn: number[]; ms: number }
  | { kind: "desync"; turn: number }
  | { kind: "over"; why: string };

/**
 * Collects orders, decides when a turn may run, and hands the ticks out.
 *
 * It owns no simulation and no rendering. The game asks it "may I tick?" and it
 * answers; that keeps the rule about when time moves in one place instead of
 * spread through the frame loop.
 */
export class Lockstep {
  /** The turn currently being executed. */
  private turn = 0;
  /** Ticks already spent inside the current turn. */
  private tickInTurn = 0;
  /** Orders received, by turn then by slot. */
  private inbox = new Map<number, Map<number, TurnOrders>>();
  /** Turns this machine has already published. */
  private sentUpTo = -1;
  /** Orders queued locally, waiting to be published for a future turn. */
  private outbox: Command[] = [];
  private stalledSince = 0;
  private failure: string | null = null;
  private desyncAt: number | null = null;
  /** Checksums this machine computed, by turn, for comparison against peers. */
  private mine = new Map<number, number>();

  constructor(private readonly transport: Transport) {
    transport.onOrders((o) => {
      let bySlot = this.inbox.get(o.turn);
      if (!bySlot) {
        bySlot = new Map();
        this.inbox.set(o.turn, bySlot);
      }
      bySlot.set(o.slot, o);
      this.checkAgreement(o);
    });
    transport.onFailure((why) => {
      this.failure = why;
    });
  }

  get currentTurn(): number {
    return this.turn;
  }

  /** Queue a command. It will be executed a couple of turns from now. */
  issue(c: Command): void {
    this.outbox.push(c);
  }

  /**
   * Publish everything queued, for a turn far enough ahead that it can arrive
   * in time. Called once per turn boundary, and once at the start so the first
   * few turns are not waiting on orders that were never sent.
   */
  private publish(forTurn: number, checksum: number | undefined): void {
    if (forTurn <= this.sentUpTo) return;
    this.sentUpTo = forTurn;
    const commands = this.outbox;
    this.outbox = [];
    this.transport.send({ turn: forTurn, slot: this.transport.slot, commands, checksum });
  }

  /** Prime the pipeline: the first INPUT_DELAY turns carry nobody's orders. */
  start(): void {
    for (let t = 0; t <= this.transport.inputDelay; t++) this.publish(t, undefined);
  }

  /**
   * Two machines that disagree about the world have already diverged; the only
   * useful thing left is to say so loudly and stop, because every turn after
   * this one is fiction.
   */
  private checkAgreement(o: TurnOrders): void {
    if (o.checksum === undefined || o.slot === this.transport.slot) return;
    const ours = this.mine.get(o.turn);
    if (ours === undefined || ours === o.checksum) return;
    this.desyncAt = o.turn;
  }

  /** Record what this machine thinks the world looks like at a turn boundary. */
  noteChecksum(turn: number, sum: number): void {
    this.mine.set(turn, sum);
    // Only a short history is useful; anything older cannot still be in dispute.
    for (const t of this.mine.keys()) if (t < turn - CHECKSUM_EVERY * 4) this.mine.delete(t);
  }

  /** Whether every seat has reported for a turn. */
  private ready(turn: number): boolean {
    return (this.inbox.get(turn)?.size ?? 0) >= this.transport.slots;
  }

  private missing(turn: number): number[] {
    const have = this.inbox.get(turn);
    const out: number[] = [];
    for (let s = 0; s < this.transport.slots; s++) if (!have?.has(s)) out.push(s);
    return out;
  }

  /**
   * Ask for the commands to execute on the next tick.
   *
   * Returns null when the game may not advance -- because a turn's orders have
   * not arrived, or because it is over. The caller renders anyway.
   */
  nextTick(now: number, checksumFor: (turn: number) => number): { commands: Command[] } | null {
    if (this.failure !== null || this.desyncAt !== null) return null;

    if (this.tickInTurn === 0) {
      if (!this.ready(this.turn)) {
        if (this.stalledSince === 0) this.stalledSince = now;
        return null;
      }
      this.stalledSince = 0;
      // A turn boundary is the only place the two worlds are guaranteed
      // comparable, so it is the only place a checksum is taken.
      if (this.turn % CHECKSUM_EVERY === 0) this.noteChecksum(this.turn, checksumFor(this.turn));
      // Publish this machine's next batch before running the turn, so the other
      // end is never waiting on us while we work.
      this.publish(this.turn + this.transport.inputDelay + 1, this.turn % CHECKSUM_EVERY === 0 ? this.mine.get(this.turn) : undefined);
    }

    // Every seat's orders for this turn, executed on the turn's first tick so
    // both machines apply them at the same instant.
    let commands: Command[] = [];
    if (this.tickInTurn === 0) {
      const bySlot = this.inbox.get(this.turn)!;
      // Sorted by seat: two clients must apply orders in the same order, and
      // arrival order is whatever the network felt like.
      for (const s of [...bySlot.keys()].sort((a, b) => a - b)) commands = commands.concat(bySlot.get(s)!.commands);
    }

    this.tickInTurn++;
    if (this.tickInTurn >= this.transport.ticksPerTurn) {
      this.inbox.delete(this.turn);
      this.turn++;
      this.tickInTurn = 0;
    }
    return { commands };
  }

  state(now: number): LockstepState {
    if (this.failure !== null) return { kind: "over", why: this.failure };
    if (this.desyncAt !== null) return { kind: "desync", turn: this.desyncAt };
    if (this.stalledSince !== 0) return { kind: "stalled", waitingOn: this.missing(this.turn), ms: now - this.stalledSince };
    return { kind: "running" };
  }

  close(): void {
    this.transport.close();
  }
}
