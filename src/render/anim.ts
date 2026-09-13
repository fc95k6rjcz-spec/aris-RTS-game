/**
 * Frame animation.
 *
 * Until now every unit in this game has been a single painting, moved about by
 * arithmetic: `gait()` bobs it, leans it and squashes it about the feet, and
 * `drawWalk` slices the image in two and swings the halves. That is a
 * remarkable amount of life to get out of one still image and it is the right
 * answer while one still image is all there is -- but it cannot show a man
 * swinging an axe, because the axe is painted where it is painted.
 *
 * This is the other half: named runs of real frames, chosen by what the unit is
 * actually doing. The two live side by side on purpose. A unit with a sheet
 * uses it; a unit without one keeps the procedural treatment and looks exactly
 * as it did. There is no flag day, and no unit has to wait for every other unit
 * to be drawn before it can move properly.
 *
 * ── Where the frames come from ──
 *
 * The art arrives as contact sheets: one image per character with labelled
 * bands -- IDLE, WALK, RUN, CHOP WOOD, BUILD -- and a row of frames in each.
 * They are not uniform grids, so they are cut by `tools/slice_sheet.mjs`, which
 * finds the bands and the gaps between frames and writes out a descriptor of
 * the shape below. Nothing here knows or cares how the cutting was done.
 *
 * ── Determinism ──
 *
 * None of this is simulation. Which frame is showing is a function of wall
 * clock and unit id, and two machines playing a network game are free to
 * disagree about it entirely. Nothing here may ever be read back into a
 * decision the sim makes.
 */

import type { Unit } from "../sim/entities";
import { UNITS } from "../data/units";

/** What a unit can be shown doing. Not every sheet carries every one. */
export type AnimState =
  | "idle"
  | "walk"
  | "run"
  | "chop"
  | "mine"
  | "build"
  | "repair"
  | "carry"
  | "gather"
  | "deposit"
  | "attack"
  | "hurt"
  | "die";

/** One frame's box within the sheet image. */
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Clip {
  frames: Frame[];
  /** Frames a second. */
  fps: number;
  /** Whether it runs round again, or holds on the last frame. */
  loop: boolean;
}

export interface SheetDef {
  /** Resolved image URL, from the bundler. */
  src: string;
  /** How tall the character stands, in tiles, so frames scale with the zoom. */
  height: number;
  clips: Partial<Record<AnimState, Clip>>;
}

/**
 * What this unit is doing, as far as the eye is concerned.
 *
 * Deliberately coarser than the simulation's task list: the sim distinguishes
 * four phases of gathering because it has to, and a viewer only needs to know
 * whether the man is swinging, walking, or carrying something home.
 */
export function stateFor(u: Unit, moving: boolean): AnimState {
  const t = u.task;
  switch (t.kind) {
    case "build":
      return moving ? "walk" : "build";
    case "repair":
      return moving ? "walk" : "repair";
    case "attack":
    case "attackMove":
      return moving ? "run" : "attack";
    case "gather": {
      if (t.phase === "harvest") return t.resource === "lumber" ? "chop" : "mine";
      if (t.phase === "deposit") return "deposit";
      // Walking there empty-handed, or walking back with a load.
      return u.carrying ? "carry" : "walk";
    }
    case "move":
      return u.carrying ? "carry" : "walk";
    default:
      return moving ? "walk" : "idle";
  }
}

/**
 * The frame to show, given a clip and the wall clock.
 *
 * `offset` staggers units against each other -- a dozen men on the same frame
 * of the same walk cycle reads as a chorus line, not a crowd -- and is the
 * unit's id, so a given man is consistent with himself from frame to frame.
 */
export function frameAt(clip: Clip, seconds: number, offset: number): Frame {
  const n = clip.frames.length;
  if (n === 0) return { x: 0, y: 0, w: 1, h: 1 };
  const i = Math.floor(seconds * clip.fps + (offset % n));
  return clip.frames[clip.loop ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i))]!;
}

/**
 * Pick the clip for a state, falling back sideways rather than to nothing.
 *
 * A sheet that has WALK but not RUN should show a walk when the man runs, not
 * freeze. A sheet with no IDLE should stand on the first frame of its walk.
 * Every fallback here ends at `idle`, and `idle` ends at whatever the sheet
 * does have, so a partially drawn character is still animated.
 */
const FALLBACK: Record<AnimState, AnimState[]> = {
  idle: [],
  walk: ["idle"],
  run: ["walk", "idle"],
  chop: ["build", "attack", "idle"],
  mine: ["chop", "build", "attack", "idle"],
  build: ["repair", "chop", "idle"],
  repair: ["build", "chop", "idle"],
  carry: ["walk", "idle"],
  gather: ["chop", "idle"],
  deposit: ["carry", "walk", "idle"],
  attack: ["chop", "idle"],
  hurt: ["idle"],
  die: ["hurt", "idle"],
};

export function clipFor(sheet: SheetDef, state: AnimState): Clip | null {
  const direct = sheet.clips[state];
  if (direct && direct.frames.length > 0) return direct;
  for (const alt of FALLBACK[state]) {
    const c = sheet.clips[alt];
    if (c && c.frames.length > 0) return c;
  }
  for (const c of Object.values(sheet.clips)) if (c && c.frames.length > 0) return c;
  return null;
}

/**
 * The sheets the build knows about, by faction and unit id.
 *
 * Empty until art is cut. Every lookup miss is silent and falls through to the
 * painted single-frame sprite, so this file existing changes nothing about how
 * the game looks until something is actually registered here.
 */
const SHEETS = new Map<string, SheetDef>();

export function registerSheet(faction: string, def: string, sheet: SheetDef): void {
  SHEETS.set(`${faction}|${def}`, sheet);
}

export function sheetFor(faction: string, def: string): SheetDef | null {
  return SHEETS.get(`${faction}|${def}`) ?? SHEETS.get(`*|${def}`) ?? null;
}

/** Whether any sheet at all has been registered, so the renderer can skip the lookup. */
export function anySheets(): boolean {
  return SHEETS.size > 0;
}

/** How fast this unit's feet should look, for choosing walk against run. */
export function isRunning(u: Unit): boolean {
  return UNITS[u.def]!.speed >= 8;
}
