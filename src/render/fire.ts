/**
 * Buildings burn.
 *
 * Nothing in the simulation changes for this: a building's health already says
 * how badly it is hurt, so fire is drawn straight from hp and needs no state, no
 * events and no bookkeeping. Damage a building and it smoulders; keep at it and
 * it is an inferno; repair it and the flames go out on their own.
 *
 * The flicker is deterministic, seeded from the building's id and the tick, so
 * two players watching the same siege see the same fire, and a paused frame does
 * not reshuffle itself every time the renderer redraws.
 */

/** Health fraction below which a building starts to smoke. */
export const BURN_AT = 0.65;

/** Cheap deterministic hash, 0..1. */
function noise(a: number, b: number): number {
  let t = (a * 374761393 + b * 668265263) >>> 0;
  t = Math.imul(t ^ (t >>> 13), 1274126177) >>> 0;
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/**
 * Draw fire over a building.
 *
 * @param x,y   top-left of the building's footprint on screen
 * @param w     footprint width in pixels
 * @param frac  current health fraction, 0..1
 * @param tick  sim tick plus interpolation, for the flicker
 * @param seed  the building's id, so neighbouring fires differ
 */
export function drawFire(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  frac: number,
  tick: number,
  seed: number,
): void {
  if (frac >= BURN_AT) return;
  // 0 at the first singe, 1 at the point of collapse.
  const heat = Math.min(1, (BURN_AT - frac) / BURN_AT);
  const plumes = 1 + Math.round(heat * 5);

  ctx.save();
  for (let i = 0; i < plumes; i++) {
    // Fires sit across the building's roofline, not its floor.
    const fx = x + w * (0.18 + noise(seed, i) * 0.64);
    const fy = y + w * (0.30 + noise(seed, i + 90) * 0.34);
    const size = w * (0.14 + heat * 0.2) * (0.7 + noise(seed, i + 40) * 0.6);
    // Each plume runs on its own clock, so they do not pulse in unison.
    const phase = tick * (0.22 + noise(seed, i + 7) * 0.12) + i * 2.4;
    const lick = 0.75 + Math.sin(phase) * 0.25 + Math.sin(phase * 2.7) * 0.1;

    // Body of the flame, added rather than painted over, so overlapping plumes
    // brighten into a core the way real fire does.
    ctx.globalCompositeOperation = "lighter";
    const h = size * 2.1 * lick;
    const grad = ctx.createLinearGradient(fx, fy, fx, fy - h);
    grad.addColorStop(0, "rgba(255,96,16,0.85)");
    grad.addColorStop(0.45, "rgba(255,168,42,0.6)");
    grad.addColorStop(1, "rgba(255,236,150,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(fx - size * 0.5, fy);
    // A tongue: wide at the base, whipping sideways as it rises to a point.
    ctx.quadraticCurveTo(fx - size * 0.55, fy - h * 0.55, fx + Math.sin(phase * 1.6) * size * 0.35, fy - h);
    ctx.quadraticCurveTo(fx + size * 0.55, fy - h * 0.55, fx + size * 0.5, fy);
    ctx.closePath();
    ctx.fill();

    // A hot white-yellow heart, only once the fire has really taken.
    if (heat > 0.35) {
      ctx.fillStyle = "rgba(255,230,140,0.5)";
      ctx.beginPath();
      ctx.ellipse(fx, fy - h * 0.2, size * 0.22, h * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Smoke, drawn normally: it must darken the sky, not brighten it.
    ctx.globalCompositeOperation = "source-over";
    const puffs = 2 + Math.round(heat * 2);
    for (let p = 0; p < puffs; p++) {
      const k = ((tick * 0.02 + noise(seed, i * 13 + p) * 1) % 1 + 1) % 1;
      const drift = Math.sin(phase * 0.5 + p) * size * 0.8;
      ctx.globalAlpha = (1 - k) * 0.3 * (0.4 + heat * 0.6);
      ctx.fillStyle = "#3a3a3c";
      ctx.beginPath();
      ctx.arc(fx + drift * k, fy - h - k * w * 0.8, size * (0.35 + k * 0.9), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
