import type { EntityId, PlayerId, Vec } from "./types";

export type UnitTask =
  | { kind: "idle" }
  | { kind: "move"; target: Vec }
  | { kind: "build"; building: EntityId }
  | { kind: "gather"; tx: number; ty: number; resource: "gold" | "lumber"; phase: "toNode" | "harvest" | "toDrop" | "deposit"; timer: number }
  | { kind: "repair"; building: EntityId }
  /**
   * Ordered onto a specific target; chases it until it dies.
   *
   * `guard` marks a chase the unit started by itself, having spotted something
   * from where it was standing rather than being told to. Those are leashed to
   * `post` so that a picket does not follow one scout across the map; an
   * ordered attack has no leash, because the player meant it.
   */
  | { kind: "attack"; target: EntityId; guard?: boolean }
  /** Move to a point, engaging anything hostile met on the way. */
  | { kind: "attackMove"; target: Vec };

export interface Unit {
  kind: "unit";
  id: EntityId;
  owner: PlayerId;
  def: string;
  pos: Vec; // sub-tile units, centre of unit
  hp: number;
  maxHp: number;
  task: UnitTask;
  /** Remaining waypoints in tile coords. */
  path: Array<[number, number]>;
  /** Ticks left before the unit will re-path after being blocked. */
  repathIn: number;
  carrying: { resource: "gold" | "lumber"; amount: number } | null;
  facing: number; // 0..7 for the renderer
  /** Ticks until this unit may attack again. */
  cooldown: number;
  /** What it is currently shooting at, for auto-acquired targets. */
  engaging: EntityId | null;
  /** Consecutive ticks spent with nothing to do. Reset by any order. */
  idleFor: number;
  /**
   * The ground this unit came to rest on, and the anchor its self-started
   * chases are leashed to. Null whenever it is busy with something else.
   */
  post: Vec | null;
  /**
   * Lying down for the night. Purely how the unit is drawn: a sleeper fights,
   * sees and takes damage exactly as a man on his feet does, and is on his feet
   * the moment anything hostile comes near. See `World.stepRest`.
   */
  asleep: boolean;
}

/** An arrow, spear or shell in flight. Cosmetic: damage is applied on launch. */
export interface Projectile {
  from: Vec;
  to: Vec;
  /** 0..1 progress along the arc. */
  t: number;
  speed: number;
  kind: "arrow" | "bolt" | "shell" | "fire";
}

export interface TrainJob {
  unit: string;
  remaining: number;
  total: number;
}

export interface UpgradeJob {
  toLevel: number;
  remaining: number;
  total: number;
}

export interface Building {
  kind: "building";
  id: EntityId;
  owner: PlayerId;
  def: string;
  tx: number;
  ty: number;
  size: number;
  hp: number;
  maxHp: number;
  /** 0..buildTime while under construction; === buildTime when complete. */
  progress: number;
  complete: boolean;
  queue: TrainJob[];
  /** Tier for levelled buildings (Town Hall 1–10); 1 for everything else. */
  level: number;
  upgrade: UpgradeJob | null;
  rally: Vec | null;
  /** Upgrade being researched here, if any. Blocks training while it runs. */
  research: { id: string; toLevel: number; remaining: number; total: number } | null;
  /** Workers currently applying construction this tick (for the renderer / progress rate). */
  builders: number;
}

export type Entity = Unit | Building;

export function centerOf(b: Building): Vec {
  return { x: (b.tx + b.size / 2) * 64, y: (b.ty + b.size / 2) * 64 };
}
