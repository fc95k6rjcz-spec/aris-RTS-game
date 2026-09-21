/// <reference types="vite/client" />

/**
 * Animation asset registry.
 *
 * Drop PNG frames into src/assets/anim using:
 *
 *   [faction_]unit_state_frame.png
 *
 * Examples:
 *   worker_idle_0.png              -> human worker
 *   human_footman_attack_3.png     -> human footman
 *   orc_grunt_walk_2.png           -> orc grunt
 *
 * No TypeScript import list has to be maintained. Vite discovers every frame at
 * build time, this file groups them into clips, and anim.ts provides graceful
 * procedural fallbacks for any state that has not been painted yet.
 */

import { registerSheet, type AnimState, type Clip } from "./anim";

const FRAME_MODULES = import.meta.glob<string>("../assets/anim/*.png", {
  eager: true,
  import: "default",
});

const STATES: AnimState[] = [
  "idle",
  "walk",
  "run",
  "fly",
  "sail",
  "flee",
  "chop",
  "mine",
  "build",
  "repair",
  "carry",
  "gather",
  "deposit",
  "attack",
  "cast",
  "heal",
  "hurt",
  "die",
];

const STATE_SET = new Set<string>(STATES);

/** Default clip timing. Individual art sets can override here if needed. */
const FPS: Record<AnimState, number> = {
  idle: 3,
  walk: 7,
  run: 10,
  fly: 9,
  sail: 6,
  flee: 11,
  chop: 8,
  mine: 8,
  build: 8,
  repair: 8,
  carry: 6,
  gather: 8,
  deposit: 6,
  attack: 10,
  cast: 9,
  heal: 8,
  hurt: 8,
  die: 8,
};

const LOOP = new Set<AnimState>([
  "idle",
  "walk",
  "run",
  "fly",
  "sail",
  "flee",
  "chop",
  "mine",
  "build",
  "repair",
  "carry",
  "gather",
]);

/** Nominal sprite height in tiles. Unknown units use the common 1.45. */
const HEIGHT: Record<string, number> = {
  worker: 1.4,
  footman: 1.48,
  archer: 1.48,
  knight: 1.72,
  mage: 1.55,
  priest: 1.55,
  king: 1.4,
  prince: 1.62,
  ballista: 1.35,
  cannon: 1.4,
  gryphon: 1.8,
  scout: 1.55,
  bomber: 1.8,
  bear: 1.55,
  deer: 1.35,
  cow: 1.4,
};

interface Frame {
  index: number;
  src: string;
}

interface Group {
  faction: string;
  def: string;
  clips: Map<AnimState, Frame[]>;
}

/**
 * Parse from the right because unit ids may eventually contain underscores.
 * A missing faction prefix means Human, matching the original worker assets.
 */
function parse(path: string): { faction: string; def: string; state: AnimState; index: number } | null {
  const file = path.split("/").pop()?.replace(/\.png$/i, "");
  if (!file) return null;
  const parts = file.split("_");
  if (parts.length < 3) return null;

  const indexText = parts.pop()!;
  const stateText = parts.pop()!;
  const index = Number(indexText);
  if (!Number.isInteger(index) || !STATE_SET.has(stateText)) return null;

  let faction = "human";
  if (parts[0] === "human" || parts[0] === "orc") faction = parts.shift()!;
  const def = parts.join("_");
  if (!def) return null;
  return { faction, def, state: stateText as AnimState, index };
}

export function registerSheets(): void {
  const groups = new Map<string, Group>();

  for (const [path, src] of Object.entries(FRAME_MODULES)) {
    const parsed = parse(path);
    if (!parsed) continue;
    const key = `${parsed.faction}|${parsed.def}`;
    let group = groups.get(key);
    if (!group) {
      group = { faction: parsed.faction, def: parsed.def, clips: new Map() };
      groups.set(key, group);
    }
    const frames = group.clips.get(parsed.state) ?? [];
    frames.push({ index: parsed.index, src });
    group.clips.set(parsed.state, frames);
  }

  for (const group of groups.values()) {
    const clips: Partial<Record<AnimState, Clip>> = {};
    for (const [state, frames] of group.clips) {
      frames.sort((a, b) => a.index - b.index);
      clips[state] = {
        srcs: frames.map((f) => f.src),
        fps: FPS[state],
        loop: LOOP.has(state),
      };
    }
    registerSheet(group.faction, group.def, {
      height: HEIGHT[group.def] ?? 1.45,
      clips,
    });
  }
}

