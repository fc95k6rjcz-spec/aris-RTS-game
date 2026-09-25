import type { EntityId, PlayerId, Vec } from "./types";

export type UnitTask =
  | { kind: "idle" }
  | { kind: "move"; target: Vec }
  | { kind: "build"; building: EntityId }
  | { kind: "gather"; tx: number; ty: number; resource: "gold" | "lumber"; phase: "toNode" | "harvest" | "toDrop" | "deposit"; timer: number }
  | { kind: "repair"; building: EntityId }
  /** Ordered onto a specific target; chases it until it dies. */
  | { kind: "attack"; target: EntityId }
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
  /** Remaining A* waypoints in tile coords for the active order. */
  path: Array<[number, number]>;
  /**
   * Player-queued move destinations, in world sub-units.
   *
   * Kept in simulation state rather than the UI so Shift-waypoints are
   * deterministic and survive lockstep exactly like the active task.
   */
  moveQueue: Vec[];
  /** Ticks left before the unit will re-path after being blocked. */
  repathIn: number;
  carrying: { resource: "gold" | "lumber"; amount: number } | null;
  facing: number; // 0..7 for the renderer
  /** Ticks until this unit may attack again. */
  cooldown: number;
  /** What it is currently shooting at, for auto-acquired targets. */
  engaging: EntityId | null;
  ralliedUntil?: number;
  rallyReadyAt?: number;
  patrolHome?: Vec;
  patrolBand?: number;
  /** Unaligned travellers who join a king that reaches their band. */
  recruitBand?: number;
  buildQueue?: EntityId[];
  /** A work pause followed by a short walk to the next part of the structure. */
  constructionWork?: { building: EntityId; ticks: number; travel: number; target?: [number, number] };
}

/** An arrow, spear or shell in flight. Cosmetic: damage is applied on launch. */
export interface Projectile {
  from: Vec;
  to: Vec;
  /** 0..1 progress along the arc. */
  t: number;
  speed: number;
  kind: "arrow" | "bolt" | "shell";
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
