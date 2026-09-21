/**
 * Transient combat feedback, driven entirely by the sim's per-tick `fx` list.
 *
 * The sim tells us a swing happened; how long the sprite leans forward, how the
 * corpse falls and how fast the slash fades are decisions that live here, on the
 * render side, where getting them wrong costs nothing but looks. Everything is
 * keyed to sim ticks so it stays in step with the game at any speed.
 */

import type { FxEvent } from "../sim/world";
import type { EntityId, PlayerId } from "../sim/types";

/** Ticks a unit leans into its swing and settles back. */
const LUNGE = 7;
/** Ticks a struck sprite stays lit. */
const FLASH = 3;
/** Ticks a slash arc is visible. */
const SLASH = 5;
/** Ticks one work stroke -- an axe into a trunk, a pick into a seam -- takes. */
const STROKE = 11;
/** Ticks a floating damage number rises and fades for. */
const NUMBER = 26;
/** Ticks a body takes to fall, fade and sink. */
const FALL = 16;
/** Buildings collapse quickly but leave readable rubble for several seconds. */
const BUILDING_RUIN = 140;
/** Ticks the dust ring under a finished building lasts. */
const DUST = 22;

interface Lunge {
  /** Tick the swing started. */
  t0: number;
  /** Unit direction toward the target, normalised. */
  dx: number;
  dy: number;
}

export interface Corpse {
  x: number;
  y: number;
  def: string;
  owner: PlayerId;
  facing: number;
  building: boolean;
  t0: number;
}

interface Slash {
  x: number;
  y: number;
  tx: number;
  ty: number;
  ranged: boolean;
  t0: number;
}

interface Puff {
  x: number;
  y: number;
  t0: number;
  life: number;
  color: string;
  /** Number of motes; a felled load throws more than a pick stroke. */
  n: number;
  /** Mote radius as a fraction of the tile size. */
  size: number;
  /** How far the motes travel, as a fraction of the tile size. */
  spread: number;
}

/**
 * Holds every in-flight effect. One instance per renderer; `apply` is fed the
 * sim's list once per tick and `prune` drops what has expired.
 */
export class Fx {
  private lunges = new Map<EntityId, Lunge>();
  private flashes = new Map<EntityId, number>();
  private strokes = new Map<EntityId, number>();
  private slashes: Slash[] = [];
  private puffs: Puff[] = [];
  private numbers: Array<{ x: number; y: number; text: string; crit: boolean; heal: boolean; t0: number; drift: number }> = [];
  corpses: Corpse[] = [];

  /** Absorb one tick's worth of events. `tick` is the sim tick they happened on. */
  apply(events: readonly FxEvent[], tick: number): void {
    for (const e of events) {
      switch (e.kind) {
        case "attack": {
          const dx = e.tx - e.x;
          const dy = e.ty - e.y;
          const len = Math.hypot(dx, dy) || 1;
          this.slashes.push({ x: e.x, y: e.y, tx: e.tx, ty: e.ty, ranged: e.ranged, t0: tick });
          // Only melee leans in. An archer that lunged would look like it was
          // trying to stab something five tiles away.
          if (!e.ranged) this.lungeAt(e, dx / len, dy / len, tick);
          break;
        }
        case "hit":
          this.flashes.set(e.id, tick);
          this.numbers.push({
            x: e.x,
            y: e.y,
            text: e.crit ? `CRIT ${e.amount}` : String(e.amount),
            crit: e.crit,
            heal: false,
            // Deterministic sideways drift, so simultaneous hits on one target
            // do not stack into an unreadable pile.
            drift: ((this.numbers.length * 37) % 21) - 10,
            t0: tick,
          });
          // Sparks, not blood: small, bright and quick. Big soft motes here read
          // as a red blob painted over the sprite rather than a blow landing.
          this.puffs.push({
            x: e.x,
            y: e.y,
            t0: tick,
            life: 6,
            color: e.building ? "#e8d6ae" : "#ffd7a0",
            n: 5,
            size: 0.028,
            spread: 0.34,
          });
          break;
        case "heal":
          this.numbers.push({
            x: e.x,
            y: e.y,
            text: `+${e.amount}`,
            crit: false,
            heal: true,
            drift: ((this.numbers.length * 37) % 21) - 10,
            t0: tick,
          });
          this.puffs.push({ x: e.x, y: e.y, t0: tick, life: 12, color: "#8ff0ad", n: 7, size: 0.04, spread: 0.42 });
          break;
        case "death":
          this.corpses.push({ ...e, t0: tick });
          break;
        case "built":
          this.puffs.push({ x: e.x, y: e.y, t0: tick, life: DUST, color: "#cbbfa6", n: 14, size: 0.075, spread: 0.7 });
          break;
        case "deposit":
          this.puffs.push({
            x: e.x,
            y: e.y,
            t0: tick,
            life: 12,
            color: e.resource === "gold" ? "#f2c14e" : "#8a6a44",
            n: 5,
            size: 0.045,
            spread: 0.4,
          });
          break;
        case "chop":
          this.strokes.set(e.id, tick);
          this.puffs.push({ x: e.x, y: e.y, t0: tick, life: 7, color: "#9b7a52", n: 3, size: 0.035, spread: 0.3 });
          break;
      }
    }
  }

  /**
   * A swing is recorded against the attacking unit, but the sim's attack event
   * carries a position rather than an id -- ids would have to be threaded through
   * three call sites for no other gain -- so the nearest unit at that spot claims
   * it. `lookup` is supplied by the renderer, which has the entity list to hand.
   */
  private pending: Array<{ x: number; y: number; dx: number; dy: number; t0: number }> = [];

  private lungeAt(e: { x: number; y: number }, dx: number, dy: number, tick: number): void {
    this.pending.push({ x: e.x, y: e.y, dx, dy, t0: tick });
  }

  /** Attach pending swings to whichever unit is standing where they came from. */
  resolve(units: Iterable<{ id: EntityId; pos: { x: number; y: number } }>): void {
    if (this.pending.length === 0) return;
    for (const p of this.pending) {
      let best: EntityId | null = null;
      let bestD = Infinity;
      for (const u of units) {
        const d = (u.pos.x - p.x) ** 2 + (u.pos.y - p.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = u.id;
        }
      }
      // 1.5 tiles of slack: the unit may have been nudged apart since it swung.
      if (best !== null && bestD < (96 * 1.5) ** 2) this.lunges.set(best, { t0: p.t0, dx: p.dx, dy: p.dy });
    }
    this.pending.length = 0;
  }

  /**
   * Screen-space offset for a unit mid-swing, in pixels, given the tile size.
   * Out fast over the first third, back slowly over the rest -- a swing is a
   * strike and a recovery, not a symmetrical wobble.
   */
  lungeOffset(id: EntityId, tick: number, scale: number): { x: number; y: number } {
    const l = this.lunges.get(id);
    if (!l) return { x: 0, y: 0 };
    const k = (tick - l.t0) / LUNGE;
    if (k < 0 || k > 1) return { x: 0, y: 0 };
    const amp = k < 0.34 ? k / 0.34 : 1 - (k - 0.34) / 0.66;
    const push = amp * scale * 0.22;
    return { x: l.dx * push, y: l.dy * push };
  }

  /** 0..1 brightness boost for a sprite that was just struck. */
  flashAt(id: EntityId, tick: number): number {
    const t0 = this.flashes.get(id);
    if (t0 === undefined) return 0;
    const k = (tick - t0) / FLASH;
    return k < 0 || k > 1 ? 0 : 1 - k;
  }

  /** 0..1 through a work stroke, or null when this unit is not mid-swing. */
  strokeAt(id: EntityId, tick: number): number | null {
    const t0 = this.strokes.get(id);
    if (t0 === undefined) return null;
    const k = (tick - t0) / STROKE;
    return k < 0 || k > 1 ? null : k;
  }

  /** Slash arcs and shot traces, drawn over the world. */
  drawMarks(
    ctx: CanvasRenderingContext2D,
    tick: number,
    toScreen: (x: number, y: number) => { x: number; y: number },
    scale = 40,
    numbers = true,
  ): void {
    for (const s of this.slashes) {
      const k = (tick - s.t0) / SLASH;
      if (k < 0 || k > 1) continue;
      const a = toScreen(s.x, s.y);
      const b = toScreen(s.tx, s.ty);
      // Weights scale with the tile size: a fixed 2px arc that reads well zoomed
      // in disappears entirely zoomed out, which is exactly where a player most
      // needs to see that a fight is happening.
      ctx.globalAlpha = (1 - k) * (s.ranged ? 0.55 : 1);
      ctx.strokeStyle = "#fffbe8";
      ctx.lineWidth = Math.max(1.5, scale * (s.ranged ? 0.035 : 0.1));
      ctx.lineCap = "round";
      if (s.ranged) {
        // A ranged shot leaves a brief line of flight; the projectile itself is
        // drawn separately by the renderer.
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + (b.x - a.x) * 0.25, a.y + (b.y - a.y) * 0.25);
        ctx.stroke();
      } else {
        // Melee gets an arc swept across the face of the target.
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const r = Math.max(scale * 0.3, Math.hypot(b.x - a.x, b.y - a.y) * 0.5);
        // A soft wide pass under a tight bright one: the blur reads as speed,
        // the core reads as an edge.
        ctx.globalAlpha = (1 - k) * 0.35;
        ctx.lineWidth = Math.max(3, scale * 0.22);
        ctx.beginPath();
        ctx.arc(mx, my, r, ang - 1.15 + k * 1.5, ang + 0.15 + k * 1.5);
        ctx.stroke();
        ctx.globalAlpha = (1 - k) * 0.95;
        ctx.lineWidth = Math.max(1.5, scale * 0.09);
        ctx.beginPath();
        ctx.arc(mx, my, r, ang - 1.1 + k * 1.5, ang + 0.1 + k * 1.5);
        ctx.stroke();
        // The point of contact, brightest at the moment of the blow.
        ctx.globalAlpha = (1 - k) ** 2;
        ctx.fillStyle = "#fffdf2";
        ctx.beginPath();
        ctx.arc(b.x, b.y, scale * 0.1 * (1 - k) + 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const p of this.puffs) {
      const k = (tick - p.t0) / p.life;
      if (k < 0 || k > 1) continue;
      const o = toScreen(p.x, p.y);
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.fillStyle = p.color;
      for (let i = 0; i < p.n; i++) {
        // Deterministic scatter: the same puff draws the same way every frame.
        const ang = (i / p.n) * Math.PI * 2 + p.t0;
        const rad = k * scale * p.spread * (0.5 + ((i * 37) % 10) / 10);
        const r = scale * p.size * (1 - k) + 0.6;
        ctx.beginPath();
        ctx.arc(o.x + Math.cos(ang) * rad, o.y + Math.sin(ang) * rad * 0.6 - k * scale * 0.18, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Damage numbers last, so nothing paints over them.
    for (const n of numbers ? this.numbers : []) {
      const k = (tick - n.t0) / NUMBER;
      if (k < 0 || k > 1) continue;
      const o = toScreen(n.x, n.y);
      // Up fast, then slowing: the number pops off the blow and settles.
      const rise = (1 - (1 - k) ** 2) * scale * 0.95;
      ctx.globalAlpha = k > 0.65 ? (1 - k) / 0.35 : 1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const size = Math.max(9, scale * (n.crit ? 0.42 : 0.3)) * (n.crit ? 1 + (1 - k) * 0.25 : 1);
      ctx.font = `${n.crit ? "800" : "700"} ${size}px system-ui, sans-serif`;
      ctx.lineWidth = Math.max(2, size * 0.28);
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.strokeText(n.text, o.x + n.drift, o.y - scale * 0.55 - rise);
      ctx.fillStyle = n.heal ? "#8ff0ad" : n.crit ? "#ffd75e" : "#fff1f1";
      ctx.fillText(n.text, o.x + n.drift, o.y - scale * 0.55 - rise);
    }
    ctx.globalAlpha = 1;
  }

  /** How far through its fall a corpse is, 0..1, or null once it is gone. */
  fallProgress(c: Corpse, tick: number): number | null {
    const life = c.building ? BUILDING_RUIN : FALL;
    const k = (tick - c.t0) / life;
    return k < 0 || k > 1 ? null : k;
  }

  /** Drop anything that has finished. Cheap, and keeps the lists from growing. */
  prune(tick: number): void {
    this.slashes = this.slashes.filter((s) => tick - s.t0 <= SLASH);
    this.puffs = this.puffs.filter((p) => tick - p.t0 <= p.life);
    this.numbers = this.numbers.filter((n) => tick - n.t0 <= NUMBER);
    this.corpses = this.corpses.filter((c) => tick - c.t0 <= (c.building ? BUILDING_RUIN : FALL));
    for (const [id, t0] of this.flashes) if (tick - t0 > FLASH) this.flashes.delete(id);
    for (const [id, l] of this.lunges) if (tick - l.t0 > LUNGE) this.lunges.delete(id);
    for (const [id, t0] of this.strokes) if (tick - t0 > STROKE) this.strokes.delete(id);
  }

  /** Forget everything -- used when a new game starts. */
  clear(): void {
    this.lunges.clear();
    this.flashes.clear();
    this.strokes.clear();
    this.slashes.length = 0;
    this.puffs.length = 0;
    this.numbers.length = 0;
    this.corpses.length = 0;
    this.pending.length = 0;
  }
}

