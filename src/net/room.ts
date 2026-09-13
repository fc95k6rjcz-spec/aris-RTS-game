/**
 * Two people in different houses, playing the same match.
 *
 * The orders have to meet somewhere. The obvious somewhere was a small relay on
 * Vercel beside the game, and it does not work: a relay needs both players'
 * sockets in one process, and Vercel spreads connections across instances with
 * no way to pin them together. The failure mode is the bad kind -- it works
 * when you test it alone and fails intermittently for a friend, with nothing
 * useful in the logs. So the meeting place is a Supabase Realtime broadcast
 * channel instead: a named room that both clients subscribe to, with no server
 * of ours in the middle to be in the wrong place.
 *
 * Nothing is stored. A broadcast channel holds no rows and writes no tables --
 * messages pass through it and are gone. When the match ends the channel ends
 * with it.
 *
 * ── What crosses the wire ──
 *
 *   join   a guest announcing itself, and asking for a seat
 *   start  the host's answer: the seat, and the match everyone must build
 *   orders one player's commands for one turn, plus a checksum now and then
 *   bye    a clean departure, so the other end can say so rather than hang
 *
 * The match parameters in `start` matter more than they look. Both machines
 * build their own world from scratch and must build the SAME one, so the seed,
 * the map and every setting the simulation reads travel with it. Anything the
 * simulation does not read -- volume, health bars, edge scrolling -- stays
 * local, which is the whole reason settings were split that way to begin with.
 */

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Command } from "../sim/commands";
import type { Transport, TurnOrders } from "./lockstep";

/**
 * Where the rooms live.
 *
 * A publishable key, which is designed to be public and ships in the client of
 * every Supabase app there is. It grants nothing here beyond joining a named
 * broadcast channel: the game reads no tables and writes none.
 */
const URL = "https://chgrnwcwgkmjioutxjem.supabase.co";
const KEY = "sb_publishable_zAJoVzUsJyH6Fvgo0xkKbg_EhOT6ssD";

/** Everything both machines must agree on to build the same world. */
export interface MatchSetup {
  seed: number;
  mapId: string;
  pace: number;
  stockade: boolean;
  crowning: boolean;
  nomad: boolean;
  wildlife: boolean;
}

export type RoomEvent =
  | { kind: "waiting"; code: string }
  | { kind: "joined"; slot: number; setup: MatchSetup }
  | { kind: "peerLeft" }
  | { kind: "error"; why: string };

/** Codes people read aloud: no O/0, no I/1, no vowels to accidentally spell things. */
const ALPHABET = "BCDFGHJKLMNPQRSTVWXYZ23456789";

export function newRoomCode(): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

/**
 * The client, loaded only when somebody actually wants to play a friend.
 *
 * The Supabase library is about 230KB of the bundle, which is a lot to hand
 * every player who is only going to play alone. Imported on demand it costs
 * nothing until the moment it is needed, and by then the player is looking at a
 * lobby and expecting a short wait anyway.
 */
let client: SupabaseClient | null = null;
async function supabase(): Promise<SupabaseClient> {
  if (!client) {
    const { createClient } = await import("@supabase/supabase-js");
    client = createClient(URL, KEY, {
      auth: { persistSession: false },
      // Five turns a second each way is nothing, but the default cap is lower
      // than that and would silently start dropping orders -- which in a
      // lockstep game is not dropped orders, it is a stalled match.
      realtime: { params: { eventsPerSecond: 40 } },
    });
  }
  return client;
}

/**
 * A seat at a table, once both players are sitting down.
 *
 * Implements the same Transport interface the single-player game uses, so
 * everything above it -- the scheduler, the game loop, the whole simulation --
 * cannot tell the difference and does not have to.
 */
export class RoomTransport implements Transport {
  /** Four ticks a turn, published two turns ahead: 400ms of slack at normal speed. */
  readonly ticksPerTurn = 4;
  readonly inputDelay = 2;
  readonly slots = 2;

  private orders: ((o: TurnOrders) => void) | null = null;
  private failed: ((why: string) => void) | null = null;
  private gone = false;

  constructor(
    readonly slot: number,
    private readonly channel: RealtimeChannel,
    private readonly db: SupabaseClient,
  ) {
    channel.on("broadcast", { event: "orders" }, ({ payload }) => {
      if (this.gone) return;
      const o = payload as TurnOrders;
      // Our own orders come back to us through the channel as well; we already
      // delivered them locally, so they are dropped here rather than applied
      // twice.
      if (o.slot === this.slot) return;
      this.orders?.(o);
    });
    channel.on("broadcast", { event: "bye" }, () => {
      if (!this.gone) this.failed?.("The other player left the game.");
    });
  }

  send(o: TurnOrders): void {
    if (this.gone) return;
    // Delivered to ourselves immediately and to the peer over the wire. Waiting
    // for our own orders to make a round trip would add the network's latency
    // to our own input for no reason at all.
    this.orders?.(o);
    void this.channel.send({ type: "broadcast", event: "orders", payload: o });
  }

  onOrders(cb: (o: TurnOrders) => void): void {
    this.orders = cb;
  }

  onFailure(cb: (why: string) => void): void {
    this.failed = cb;
  }

  close(): void {
    if (this.gone) return;
    this.gone = true;
    void this.channel.send({ type: "broadcast", event: "bye", payload: {} });
    void this.db.removeChannel(this.channel);
  }
}

/** Both ends of the handshake return this once the match is agreed. */
export interface Room {
  code: string;
  transport: RoomTransport;
  setup: MatchSetup;
  slot: number;
}

async function channelFor(code: string): Promise<RealtimeChannel> {
  // `self: true` would echo our own broadcasts back; we deliver those locally
  // instead, so it is off.
  const db = await supabase();
  return db.channel(`rov-${code}`, { config: { broadcast: { self: false, ack: false } } });
}

/**
 * Open a room and wait for somebody to walk in.
 *
 * The host decides the match -- seed, map, and every setting the simulation
 * reads -- because somebody has to, and a negotiation between two clients about
 * whose wildlife setting wins is a great deal of code for no benefit.
 */
export async function host(setup: MatchSetup, on: (e: RoomEvent) => void): Promise<Room> {
  const code = newRoomCode();
  const db = await supabase();
  const channel = await channelFor(code);
  return new Promise<Room>((resolve, reject) => {
    let settled = false;
    channel.on("broadcast", { event: "join" }, () => {
      // Answer every join, not just the first: a guest whose subscription
      // landed before ours never heard the first reply and will ask again.
      void channel.send({ type: "broadcast", event: "start", payload: { setup, slot: 1 } });
      if (settled) return;
      settled = true;
      const transport = new RoomTransport(0, channel, db);
      on({ kind: "joined", slot: 0, setup });
      resolve({ code, transport, setup, slot: 0 });
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") on({ kind: "waiting", code });
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        if (!settled) reject(new Error("Could not open a room. Check the connection and try again."));
      }
    });
  });
}

/** Walk into somebody else's room and take the other seat. */
export async function join(code: string, on: (e: RoomEvent) => void): Promise<Room> {
  const db = await supabase();
  const channel = await channelFor(code.toUpperCase());
  return new Promise<Room>((resolve, reject) => {
    let settled = false;
    let asking: number | undefined;
    channel.on("broadcast", { event: "start" }, ({ payload }) => {
      if (settled) return;
      settled = true;
      clearInterval(asking);
      const { setup, slot } = payload as { setup: MatchSetup; slot: number };
      const transport = new RoomTransport(slot, channel, db);
      on({ kind: "joined", slot, setup });
      resolve({ code: code.toUpperCase(), transport, setup, slot });
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // Ask, and keep asking. The host may still be subscribing when the
        // first request goes out, and a single lost hello is a lobby that
        // waits forever for no reason.
        const ask = () => void channel.send({ type: "broadcast", event: "join", payload: {} });
        ask();
        asking = window.setInterval(ask, 900);
        window.setTimeout(() => {
          if (settled) return;
          clearInterval(asking);
          void db.removeChannel(channel);
          reject(new Error(`Nobody is hosting room ${code.toUpperCase()}.`));
        }, 20000);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        if (!settled) reject(new Error("Could not reach the room. Check the connection and try again."));
      }
    });
  });
}
