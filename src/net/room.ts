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
  mode?: "versus" | "coop";
  aiDifficulty?: "easy" | "normal" | "hard";
}

export type RoomEvent =
  | { kind: "waiting"; code: string }
  | { kind: "joined"; slot: number; setup: MatchSetup }
  | { kind: "peerLeft" }
  | { kind: "ready"; start: () => void }
  | { kind: "lobby"; setup: MatchSetup }
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
  private buffered: TurnOrders[] = [];
  private received = new Set<number>();
  private pending = new Map<number, { orders: TurnOrders; since: number }>();
  private retry: ReturnType<typeof setInterval> | undefined;
  private failure: string | null = null;

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
      if (o.slot !== 1 - this.slot || !Number.isInteger(o.turn) || o.turn < 0 || !Array.isArray(o.commands)) return;
      void channel.send({ type: 'broadcast', event: 'ordersAck', payload: { slot: o.slot, turn: o.turn } });
      if (this.received.has(o.turn)) return;
      this.received.add(o.turn);
      for (const turn of this.received) if (turn < o.turn - 256) this.received.delete(turn);
      if (this.orders) this.orders(o);
      else this.buffered.push(o);
    });
    channel.on('broadcast', { event: 'ordersAck' }, ({ payload }) => {
      if (payload.slot === this.slot) this.pending.delete(payload.turn);
    });
    channel.on("broadcast", { event: "bye" }, () => {
      if (!this.gone) this.reportFailure('The other player left the game.');
    });
  }

  private reportFailure(why: string): void {
    this.failure = why;
    clearInterval(this.retry);
    this.failed?.(why);
  }

  send(o: TurnOrders): void {
    if (this.gone) return;
    // Delivered to ourselves immediately and to the peer over the wire. Waiting
    // for our own orders to make a round trip would add the network's latency
    // to our own input for no reason at all.
    this.orders?.(o);
    this.pending.set(o.turn, { orders: o, since: Date.now() });
    void this.channel.send({ type: "broadcast", event: "orders", payload: o });
    this.retry ??= setInterval(() => {
      if (this.gone) return;
      for (const item of this.pending.values()) {
        if (Date.now() - item.since > 30000) {
          this.reportFailure('Connection to the other player was lost. Return to multiplayer and create a new room.');
          return;
        }
        void this.channel.send({ type: 'broadcast', event: 'orders', payload: item.orders });
      }
    }, 500);
  }

  onOrders(cb: (o: TurnOrders) => void): void {
    this.orders = cb;
    for (const o of this.buffered) cb(o);
    this.buffered = [];
  }

  onFailure(cb: (why: string) => void): void {
    this.failed = cb;
    if (this.failure) cb(this.failure);
  }

  close(): void {
    if (this.gone) return;
    this.gone = true;
    clearInterval(this.retry);
    this.pending.clear();
    this.buffered = [];
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
export async function host(setup: MatchSetup, on: (e: RoomEvent) => void, signal?: AbortSignal): Promise<Room> {
  const code=newRoomCode(),db=await supabase(),channel=await channelFor(code);
  return new Promise<Room>((resolve,reject)=>{
    const transport = new RoomTransport(0, channel, db);
    let settled=false,closed=false,guest='',ready=false;
    const cleanup=()=>signal?.removeEventListener('abort',abort);
    const fail=(why:string)=>{if(settled||closed)return;closed=true;cleanup();void channel.send({type:'broadcast',event:'lobbyClosed',payload:{}});void db.removeChannel(channel);reject(new Error(why));};
    const abort=()=>fail('Room closed.');
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
    const announce=()=>void channel.send({type:'broadcast',event:settled?'start':'lobby',payload:{setup,slot:1,guest,version:ROOM_VERSION}});
    const start=()=>{if(closed||settled||!ready)return;settled=true;cleanup();announce();on({kind:'joined',slot:0,setup});resolve({code,transport,setup,slot:0});};
    channel.on('broadcast',{event:'join'},({payload})=>{
      if(closed||payload.version!==ROOM_VERSION||typeof payload.guest!=='string')return;
      if(guest&&guest!==payload.guest)return;
      guest=payload.guest;announce();
    });
    channel.on('broadcast',{event:'ready'},({payload})=>{if(closed||settled||ready||!guest||payload.guest!==guest)return;ready=true;on({kind:'ready',start});});
    channel.on('broadcast',{event:'lobbyLeave'},({payload})=>{if(closed||settled||payload.guest!==guest)return;guest='';ready=false;on({kind:'peerLeft'});});
    channel.subscribe(status=>{if(closed)return;if(status==='SUBSCRIBED')on({kind:'waiting',code});else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')fail('Could not open a room. Check the connection and try again.');});
  });
}

const ROOM_VERSION='coop-5';

/** Reserve the second seat, then wait for the host to explicitly start. */
export async function join(code: string, on: (e: RoomEvent) => void, signal?: AbortSignal): Promise<Room> {
  const db=await supabase(),channel=await channelFor(code.toUpperCase());
  const guest=Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), n=>n.toString(16).padStart(8,'0')).join('');
  return new Promise<Room>((resolve,reject)=>{
    const transport = new RoomTransport(1, channel, db);
    let settled=false,closed=false,accepted=false;
    let asking:ReturnType<typeof setInterval>|undefined,timeout:ReturnType<typeof setTimeout>|undefined;
    const cleanup=()=>{clearInterval(asking);clearTimeout(timeout);signal?.removeEventListener('abort',abort);};
    const fail=(why:string)=>{if(settled||closed)return;closed=true;cleanup();void channel.send({type:'broadcast',event:'lobbyLeave',payload:{guest}});void db.removeChannel(channel);reject(new Error(why));};
    const abort=()=>fail('Left the room.');signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
    channel.on('broadcast',{event:'lobby'},({payload})=>{if(closed||settled||payload.guest!==guest||payload.version!==ROOM_VERSION)return;accepted=true;clearTimeout(timeout);on({kind:'lobby',setup:payload.setup as MatchSetup});void channel.send({type:'broadcast',event:'ready',payload:{guest}});});
    channel.on('broadcast',{event:'lobbyClosed'},()=>fail('The host closed the room.'));
    channel.on('broadcast',{event:'start'},({payload})=>{if(closed||settled||payload.guest!==guest||payload.version!==ROOM_VERSION)return;settled=true;cleanup();const setup=payload.setup as MatchSetup;on({kind:'joined',slot:1,setup});resolve({code:code.toUpperCase(),transport,setup,slot:1});});
    channel.subscribe(status=>{if(closed||settled)return;if(status==='SUBSCRIBED'){
      const ask=()=>void channel.send({type:'broadcast',event:'join',payload:{guest,version:ROOM_VERSION}});clearInterval(asking);ask();asking=setInterval(ask,900);
      if(!accepted){clearTimeout(timeout);timeout=setTimeout(()=>fail(`No compatible room found for ${code.toUpperCase()}. Check the code and update both games.`),20000);}
    }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')fail('Could not reach the room. Check the connection and try again.');});
  });
}
