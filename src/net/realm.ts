/**
 * The shared realm: one world that lives on everybody's computer.
 *
 * There is no server of ours. Every player's browser runs the whole world,
 * tick for tick, and they stay identical for the same reason a two-player
 * match does: the simulation is deterministic and everyone applies the same
 * orders in the same order. What is new is that people come and go.
 *
 * ── The keeper ──
 *
 * One computer at a time is the keeper: whoever has been in the realm longest.
 * Everyone sends their orders to the keeper, and the keeper numbers them into
 * turns -- "turn 4812: these orders" -- and broadcasts each turn to everybody.
 * A turn is four ticks. Everyone, the keeper included, advances the world only
 * by applying turns in order, so the realm is one ledger of turns that every
 * machine replays.
 *
 * When somebody new arrives, the keeper hands them a copy of the world as it
 * stands at a turn boundary, plus every turn after it, and puts a "joinRealm"
 * order in the ledger so every machine gives the newcomer the same seat.
 *
 * When the keeper leaves, the next-oldest computer becomes keeper. Anyone who
 * heard turns the new keeper missed passes them on first, then the new keeper
 * carries on numbering from there. Nothing is lost and nobody has to notice.
 *
 * ── Privacy ──
 *
 * Nobody is shown who else is in the realm. Every machine does hold the whole
 * world (that is what makes it a shared ledger), and the fog of war hides what
 * you have not seen.
 *
 * ── The wire ──
 *
 * A Supabase Realtime broadcast channel, the same meeting place Play a Friend
 * uses, plus Presence to know who is connected and who has been there longest.
 * Broadcast is best-effort, so turns are numbered and gaps are asked for again,
 * and orders are resent until a turn shows the keeper took them.
 */

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Command } from "../sim/commands";

const URL = "https://chgrnwcwgkmjioutxjem.supabase.co";
const KEY = "sb_publishable_zAJoVzUsJyH6Fvgo0xkKbg_EhOT6ssD";
/** Bumped whenever the ledger format or the simulation changes incompatibly. */
export const REALM_VERSION = "realm-1";
/** Ticks in a turn: 200 ms at normal speed. */
export const TICKS_PER_TURN = 4;
/** How many past turns each machine keeps, to hand on to a new keeper or a straggler. */
const HISTORY = 3000;
/** Snapshot chunk size in characters -- well under the channel's message limit. */
const CHUNK = 60000;

export interface RealmTurn {
  n: number;
  commands: Command[];
  /** Ids of order batches this turn includes, so senders can stop resending them. */
  took: string[];
  /** World checksum at the start of this turn, every tenth turn. */
  sum?: number;
}

/** What the realm needs from the game: a way to copy the world out, and to load one in. */
export interface RealmHost {
  /** The world as it stands right now (a turn boundary), packed for the wire. */
  snapshot(): Promise<string>;
  /** Replace the local world with this packed copy; turn `n` is the next to apply. */
  load(packed: string, n: number): Promise<void>;
  checksum(): number;
  /** Keeper only: seat a newcomer in the local world right now, before copying it for them. */
  claim(seat: string): void;
  /** Something the player should know ("You are the keeper", "Connection lost"). */
  status(text: string): void;
}

export type RealmState =
  | { kind: "running" }
  | { kind: "stalled"; ms: number }
  | { kind: "joining" }
  | { kind: "over"; why: string };

let client: SupabaseClient | null = null;
/** Headless tests: swap the real network for an in-memory one. */
export function setRealmWireForTest(fake: unknown): void {
  client = fake as SupabaseClient;
}
async function supabase(): Promise<SupabaseClient> {
  if (!client) {
    const { createClient } = await import("@supabase/supabase-js");
    client = createClient(URL, KEY, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 60 } } });
  }
  return client;
}

function randomId(): string {
  return Array.from(globalThis.crypto.getRandomValues(new Uint32Array(3)), (n) => n.toString(36)).join("");
}

/** This browser's lasting identity in the realm: the key to its seat. Kept private. */
export function seatId(): string {
  try {
    let id = localStorage.getItem("rov-realm-seat");
    if (!id) { id = randomId() + randomId(); localStorage.setItem("rov-realm-seat", id); }
    return id;
  } catch {
    return "guest-" + randomId();
  }
}

export class RealmNet {
  /** This tab's identity on the channel (a fresh one every visit). */
  readonly tab = randomId();
  /** When this tab arrived, as the keeper election's tie-breaker order. */
  readonly since = Date.now();
  readonly seat = seatId();

  private channel: RealtimeChannel | null = null;
  private db: SupabaseClient | null = null;
  private keeper = false;
  /** The next turn this machine will apply. */
  private next = 0;
  private tickInTurn = 0;
  private inbox = new Map<number, RealmTurn>();
  private history = new Map<number, RealmTurn>();
  /** Keeper: orders gathered for the next turn, and batches already taken. */
  private gathered: Command[] = [];
  private gatheredIds: string[] = [];
  private takenIds = new Set<string>();
  /** Everyone: orders waiting to be taken by the keeper. */
  private outbox: Command[] = [];
  private unacked = new Map<string, { commands: Command[]; at: number }>();
  private seq = 0;
  private stalledSince = 0;
  private lastNeed = 0;
  private failure: string | null = null;
  private joining = false;
  /** Keeper-in-waiting: collecting turns from peers who heard more than we did. */
  private adoptingUntil = 0;
  /** Keeper: newcomers waiting for a copy of the world. */
  private newcomers: Array<{ tab: string; seat: string }> = [];
  private snaps = new Map<string, { parts: string[]; got: number; n: number }>();
  private peers: Array<{ tab: string; since: number }> = [];
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly host: RealmHost, readonly realmName = "ari") {}

  get isKeeper(): boolean {
    return this.keeper;
  }
  get currentTurn(): number {
    return this.next;
  }
  /** Turns received but not yet applied: the game runs extra ticks to catch up. */
  backlog(): number {
    let k = 0;
    while (this.inbox.has(this.next + k)) k++;
    return this.keeper ? 0 : k;
  }

  /**
   * Walk into the realm. Resolves "keeper" if nobody else is here (the caller
   * should then load its own copy of the world or make a new one), or
   * "joining" once a copy has been asked for.
   */
  async connect(): Promise<"keeper" | "joining" | "offline"> {
    try {
      this.db = await supabase();
    } catch {
      this.keeper = true;
      return "offline";
    }
    const ch = this.db.channel(`rov-realm-${this.realmName}-${REALM_VERSION}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: this.tab } },
    });
    this.channel = ch;
    ch.on("broadcast", { event: "turn" }, ({ payload }) => this.onTurn(payload as RealmTurn));
    ch.on("broadcast", { event: "orders" }, ({ payload }) => this.onOrders(payload as { id: string; commands: Command[] }));
    ch.on("broadcast", { event: "hello" }, ({ payload }) => this.onHello(payload as { tab: string; seat: string }));
    ch.on("broadcast", { event: "snap" }, ({ payload }) => void this.onSnap(payload as { to: string; id: string; i: number; of: number; n: number; data: string }));
    ch.on("broadcast", { event: "need" }, ({ payload }) => this.onNeed(payload as { from: number; to?: string }));
    ch.on("broadcast", { event: "keeper" }, ({ payload }) => this.onKeeperAnnounce(payload as { tab: string; next: number }));
    ch.on("presence", { event: "sync" }, () => this.onPresence());

    const subscribed = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 8000);
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") { clearTimeout(t); resolve(true); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(t); resolve(false); }
      });
    });
    if (!subscribed) {
      this.keeper = true;
      return "offline";
    }
    await ch.track({ since: this.since });
    // Give presence a moment to tell us who is already here.
    await new Promise((r) => setTimeout(r, 1800));
    this.peers = this.readPresence();
    const elder = this.peers.find((p) => p.tab !== this.tab && (p.since < this.since || (p.since === this.since && p.tab < this.tab)));
    this.timer = setInterval(() => this.housekeeping(), 400);
    if (!elder) {
      this.keeper = true;
      this.host.status("You have the realm to yourself");
      return "keeper";
    }
    this.askToJoin();
    return "joining";
  }

  private askToJoin(): void {
    this.keeper = false;
    this.joining = true;
    this.inbox.clear();
    this.send("hello", { tab: this.tab, seat: this.seat });
    this.host.status("Entering the realm…");
  }

  /** Queue one of this player's orders. */
  issue(c: Command): void {
    this.outbox.push(c);
  }

  private send(event: string, payload: unknown): void {
    void this.channel?.send({ type: "broadcast", event, payload });
  }

  private readPresence(): Array<{ tab: string; since: number }> {
    const state = this.channel?.presenceState() ?? {};
    const out: Array<{ tab: string; since: number }> = [];
    for (const [tab, metas] of Object.entries(state)) {
      const m = (metas as Array<{ since?: number }>)[0];
      out.push({ tab, since: typeof m?.since === "number" ? m.since : Date.now() });
    }
    return out.sort((a, b) => a.since - b.since || (a.tab < b.tab ? -1 : 1));
  }

  private onPresence(): void {
    this.peers = this.readPresence();
    if (this.joining) return;
    const eldest = this.peers[0];
    if (!eldest) return;
    if (eldest.tab === this.tab) {
      // The keeper has gone and we are next in line: take over.
      if (!this.keeper) this.becomeKeeper();
    } else if (this.keeper && (eldest.since < this.since)) {
      // Two people arrived at the same moment and both thought they were alone.
      // The elder realm stands; ours folds into it.
      this.host.status("Joining the older realm…");
      this.askToJoin();
    }
  }

  private becomeKeeper(): void {
    this.keeper = true;
    this.adoptingUntil = Date.now() + 900;
    // Anyone who heard more of the old keeper's ledger than we did passes it on.
    this.send("keeper", { tab: this.tab, next: this.next });
    this.host.status("You are now keeping the realm");
  }

  private onKeeperAnnounce(p: { tab: string; next: number }): void {
    if (p.tab === this.tab) return;
    // Hand the new keeper any turns it missed.
    for (let n = p.next; this.history.has(n); n++) this.send("turn", this.history.get(n));
  }

  private onTurn(t: RealmTurn): void {
    if (!t || !Number.isInteger(t.n) || !Array.isArray(t.commands)) return;
    if (this.keeper && Date.now() > this.adoptingUntil) return; // we write the ledger now
    if (t.n < this.next) return;
    this.inbox.set(t.n, t);
    // Stop resending anything the keeper has taken.
    for (const id of t.took ?? []) this.unacked.delete(id);
  }

  private onOrders(o: { id: string; commands: Command[] }): void {
    if (!this.keeper || !o || typeof o.id !== "string" || !Array.isArray(o.commands)) return;
    if (this.takenIds.has(o.id) || this.gatheredIds.includes(o.id)) {
      return;
    }
    this.gathered.push(...o.commands);
    this.gatheredIds.push(o.id);
  }

  private onHello(h: { tab: string; seat: string }): void {
    if (!this.keeper || !h || typeof h.tab !== "string" || typeof h.seat !== "string") return;
    if (!this.newcomers.some((n) => n.tab === h.tab)) this.newcomers.push(h);
  }

  private async onSnap(s: { to: string; id: string; i: number; of: number; n: number; data: string }): Promise<void> {
    if (!this.joining || s.to !== this.tab) return;
    let entry = this.snaps.get(s.id);
    if (!entry) { entry = { parts: new Array(s.of).fill(""), got: 0, n: s.n }; this.snaps.set(s.id, entry); }
    if (entry.parts[s.i]) return;
    entry.parts[s.i] = s.data;
    entry.got++;
    if (entry.got < s.of) return;
    this.snaps.clear();
    try {
      await this.host.load(entry.parts.join(""), entry.n);
      this.next = entry.n;
      this.tickInTurn = 0;
      for (const n of [...this.inbox.keys()]) if (n < entry.n) this.inbox.delete(n);
      this.joining = false;
      this.host.status("You have entered the realm");
    } catch {
      this.host.status("The copy of the realm arrived damaged — asking again");
      this.askToJoin();
    }
  }

  private onNeed(p: { from: number }): void {
    if (!this.keeper || !Number.isInteger(p?.from)) return;
    for (let n = p.from; n < p.from + 60 && this.history.has(n); n++) this.send("turn", this.history.get(n));
  }

  /** Resend orders the keeper has not taken yet, and chase missing turns. */
  private housekeeping(): void {
    const now = Date.now();
    if (!this.keeper) {
      for (const [id, b] of this.unacked) {
        if (now - b.at > 900) { b.at = now; this.send("orders", { id, commands: b.commands }); }
      }
      if (!this.joining && !this.inbox.has(this.next) && [...this.inbox.keys()].some((n) => n > this.next) && now - this.lastNeed > 600) {
        this.lastNeed = now;
        this.send("need", { from: this.next });
      }
      if (this.joining && now - this.lastNeed > 6000) {
        // No copy arrived: ask again (the keeper may have changed hands).
        this.lastNeed = now;
        if (this.peers.length <= 1) {
          this.joining = false;
          this.keeper = true;
          this.host.status("Nobody answered — you have the realm to yourself");
        } else this.send("hello", { tab: this.tab, seat: this.seat });
      }
    }
  }

  /**
   * The game asks whether it may tick, and with which orders.
   * Returns null while waiting for the next turn (or while joining).
   */
  nextTick(now: number): { commands: Command[] } | null {
    if (this.failure || this.joining) return null;
    let commands: Command[] = [];
    if (this.tickInTurn === 0) {
      // Send our own orders on their way first, whoever we are.
      if (this.outbox.length) {
        const id = `${this.tab}:${this.seq++}`;
        const batch = this.outbox;
        this.outbox = [];
        if (this.keeper) { this.gathered.push(...batch); this.gatheredIds.push(id); }
        else { this.unacked.set(id, { commands: batch, at: Date.now() }); this.send("orders", { id, commands: batch }); }
      }
      let turn = this.inbox.get(this.next);
      if (!turn && this.keeper && Date.now() > this.adoptingUntil) {
        turn = this.writeTurn();
      }
      if (!turn) {
        if (this.stalledSince === 0) this.stalledSince = now;
        return null;
      }
      this.stalledSince = 0;
      // A copy that has drifted from the keeper's is fiction from here on:
      // throw it away and ask for a fresh one.
      if (!this.keeper && turn.sum !== undefined && turn.sum !== this.host.checksum()) {
        this.host.status("Re-syncing with the realm…");
        this.askToJoin();
        return null;
      }
      this.inbox.delete(this.next);
      this.remember(turn);
      commands = turn.commands;
    }
    this.tickInTurn++;
    if (this.tickInTurn >= TICKS_PER_TURN) {
      this.tickInTurn = 0;
      this.next++;
    }
    return { commands };
  }

  /** Keeper: number the next turn, hand out snapshots owed, and broadcast it. */
  private writeTurn(): RealmTurn {
    // Newcomers get the world exactly as it stands now -- before this turn --
    // and their seat is claimed in this very turn, so everyone agrees on it.
    const arriving = this.newcomers.splice(0);
    // Seat them here first, so the copy they are sent already has their town
    // in it; the same order in the ledger seats them on every other machine
    // (and is a no-op here, and on theirs). Seating goes first in the turn so
    // every machine does it at the same moment.
    for (const a of arriving) this.host.claim(a.seat);
    const seating: Command[] = arriving.map((a) => ({ type: "joinRealm", player: 0, peer: a.seat }));
    const turn: RealmTurn = { n: this.next, commands: [...seating, ...this.gathered], took: this.gatheredIds };
    if (this.next % 10 === 0) turn.sum = this.host.checksum();
    for (const id of this.gatheredIds) this.takenIds.add(id);
    if (this.takenIds.size > 4000) this.takenIds = new Set([...this.takenIds].slice(-2000));
    this.gathered = [];
    this.gatheredIds = [];
    if (arriving.length) {
      const n = this.next;
      void this.host.snapshot().then((packed) => {
        for (const a of arriving) {
          const id = randomId();
          const of = Math.ceil(packed.length / CHUNK);
          for (let i = 0; i < of; i++) this.send("snap", { to: a.tab, id, i, of, n, data: packed.slice(i * CHUNK, (i + 1) * CHUNK) });
        }
      });
    }
    this.send("turn", turn);
    return turn;
  }

  private remember(t: RealmTurn): void {
    this.history.set(t.n, t);
    this.history.delete(t.n - HISTORY);
  }

  state(now: number): RealmState {
    if (this.failure) return { kind: "over", why: this.failure };
    if (this.joining) return { kind: "joining" };
    if (this.stalledSince && !this.keeper) return { kind: "stalled", ms: now - this.stalledSince };
    return { kind: "running" };
  }

  close(): void {
    clearInterval(this.timer);
    if (this.channel && this.db) {
      void this.channel.untrack();
      void this.db.removeChannel(this.channel);
    }
    this.channel = null;
  }
}
