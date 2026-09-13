/**
 * What the server and a client say to each other.
 *
 * The shape of this is the whole architecture in miniature, so it is worth
 * being explicit about why it is not the other shape.
 *
 * A two-player match can be run in lockstep: both machines simulate the same
 * world from the same orders and never exchange a single unit position. That is
 * beautiful, and it is impossible here. Lockstep requires every participant to
 * simulate everything, and a browser cannot simulate hundreds of players'
 * economies across a huge map, nor can somebody joining on day forty replay
 * forty days of orders to catch up.
 *
 * So the server owns the world and the client renders a view of it. The client
 * sends what it wants to do; the server decides what happened and describes the
 * neighbourhood back. The client's World object survives that change -- it is
 * filled from these messages rather than simulated -- which is why the
 * renderer, the HUD and every piece of art carry over untouched.
 *
 * ── Area of interest ──
 *
 * A client is told about its own things wherever they are, and about everything
 * else only near where it is looking. That is what makes "hundreds of players"
 * a number about the server rather than about the client: a player in the north
 * pays nothing for a war in the south.
 */

import type { Command } from "../src/sim/commands";

/** Milliseconds between world snapshots to one client. */
export const SNAPSHOT_MS = 200;

/** How far beyond the camera a client is told about, in tiles. */
export const AOI_MARGIN = 12;

/** A unit, as much of it as anyone else needs to draw it. */
export interface NetUnit {
  id: number;
  owner: number;
  def: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  facing: number;
  /** Whether it is walking, so the client animates feet rather than guessing. */
  moving: boolean;
  /** Coarse activity, for picking the right sprite. */
  doing: string;
  carrying: string | null;
}

export interface NetBuilding {
  id: number;
  owner: number;
  def: string;
  tx: number;
  ty: number;
  size: number;
  hp: number;
  maxHp: number;
  complete: boolean;
  progress: number;
}

export interface NetPlayer {
  id: number;
  name: string;
  color: string;
  gold: number;
  lumber: number;
  food: number;
  oil: number;
  /**
   * The King's gear.
   *
   * Here from the first message rather than added later, because a persistent
   * world means a King who lives for months, and a King who lives for months is
   * a King who accumulates things. Empty for now; the slots exist so the loot
   * that fills them is a change to the game and not a change to the protocol.
   */
  gear: { weapon: string | null; armour: string | null; shield: string | null };
}

export type ClientMessage =
  | { t: "join"; name: string; token: string | null }
  | { t: "watch"; x: number; y: number; w: number; h: number }
  | { t: "cmd"; cmd: Command }
  | { t: "pong"; at: number };

export type ServerMessage =
  | {
      t: "welcome";
      /** Which seat this connection owns. Its town is already in the world. */
      player: number;
      /** A secret to reclaim the same town next time. */
      token: string;
      tick: number;
      map: { width: number; height: number; seed: number; kind: string };
      /** Everything about the world that never changes after generation. */
      terrain: string;
    }
  | { t: "snap"; tick: number; units: NetUnit[]; buildings: NetBuilding[]; players: NetPlayer[]; gone: number[] }
  | { t: "tiles"; changes: Array<[number, number, number]> }
  | { t: "note"; text: string; level: "info" | "error" }
  | { t: "ping"; at: number }
  | { t: "full" };
