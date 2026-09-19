/**
 * Universal presentation animation.
 *
 * Real sprite sheets are the highest-quality path, but every unit must still
 * move convincingly before its bespoke sheet exists. This file provides that
 * common fallback: breathing, work strokes, casting, recoil, air bob and other
 * state-driven motion. It never changes simulation state.
 */

import { UNITS } from "../data/units";
import type { Unit } from "../sim/entities";
import type { AnimState } from "./anim";

export interface MotionPose {
  /** Position offsets as fractions of the unit's drawn height. */
  dx: number;
  dy: number;
  /** Rotation in radians around the unit's feet. */
  rotate: number;
  sx: number;
  sy: number;
  /** 0..1 pulse used by casters/support effects. */
  pulse: number;
}

const STILL: MotionPose = { dx: 0, dy: 0, rotate: 0, sx: 1, sy: 1, pulse: 0 };

function wave(t: number, seed: number, speed = 1): number {
  return Math.sin(t * speed + seed * 0.731);
}

/** Presentation pose for any live unit. */
export function motionFor(u: Unit, state: AnimState, seconds: number, flash = 0): MotionPose {
  if (flash > 0) {
    const side = u.facing >= 4 ? -1 : 1;
    return {
      dx: -side * flash * 0.035,
      dy: 0.01 * flash,
      rotate: side * flash * 0.08,
      sx: 1 + flash * 0.025,
      sy: 1 - flash * 0.025,
      pulse: 0,
    };
  }

  const d = UNITS[u.def]!;
  const seed = u.id * 0.37;
  const idle = wave(seconds, seed, 2.2);
  const breathe = 1 + idle * 0.012;

  if (d.domain === "air") {
    const bob = wave(seconds, seed, state === "fly" || state === "run" ? 5.2 : 2.4);
    return {
      dx: 0,
      dy: -0.055 - bob * 0.035,
      rotate: wave(seconds, seed + 2.1, 1.7) * 0.018,
      sx: 1,
      sy: 1,
      pulse: 0,
    };
  }

  switch (state) {
    case "idle":
      return { ...STILL, dy: -Math.max(0, idle) * 0.008, sx: 2 - breathe, sy: breathe };
    case "walk":
    case "run":
    case "carry":
    case "flee":
    case "sail":
    case "fly":
      return STILL;
    case "chop":
    case "mine":
    case "build":
    case "repair": {
      const speed = state === "build" || state === "repair" ? 7.2 : 8.6;
      const s = wave(seconds, seed, speed);
      const strike = Math.sign(s) * Math.pow(Math.abs(s), 1.7);
      return {
        dx: 0.018 * Math.max(0, strike),
        dy: 0.01 * Math.abs(strike),
        rotate: -0.075 * strike,
        sx: 1 + 0.015 * Math.abs(strike),
        sy: 1 - 0.012 * Math.abs(strike),
        pulse: 0,
      };
    }
    case "attack": {
      const max = Math.max(1, d.cooldown);
      const k = u.cooldown > 0 ? 1 - Math.min(1, u.cooldown / max) : ((seconds * 2.5 + seed) % 1);
      const swing = Math.sin(Math.min(1, k * 2.5) * Math.PI);
      return {
        dx: swing * 0.035,
        dy: -swing * 0.01,
        rotate: -0.055 * swing,
        sx: 1 + swing * 0.025,
        sy: 1 - swing * 0.018,
        pulse: swing,
      };
    }
    case "cast":
    case "heal": {
      const max = Math.max(1, d.cooldown);
      const k = u.cooldown > 0 ? 1 - Math.min(1, u.cooldown / max) : ((seconds * 1.8 + seed) % 1);
      const pulse = Math.sin(Math.min(1, k * 2.2) * Math.PI);
      return {
        dx: 0,
        dy: -pulse * 0.045,
        rotate: wave(seconds, seed, 3.0) * 0.018,
        sx: 1 + pulse * 0.035,
        sy: 1 + pulse * 0.035,
        pulse,
      };
    }
    case "deposit":
      return { ...STILL, dy: Math.max(0, wave(seconds, seed, 5)) * 0.025, rotate: 0.025 * wave(seconds, seed, 5) };
    case "hurt":
      return STILL;
    case "die":
      return STILL;
    default:
      return STILL;
  }
}
