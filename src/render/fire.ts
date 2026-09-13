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


// ───────────────────────────── camp fires ─────────────────────────────

/**
 * A flame, on its own, standing on the ground.
 *
 * The building fire above draws a cluster of plumes scaled to a roofline; this
 * is one tongue of the same shape scaled to a ring of stones, plus the stones.
 * Kept separate rather than generalised because the two want different things:
 * a burning barracks should look out of control, and a camp fire should look
 * like somebody is sitting at it.
 *
 * @param x,y  where the fire meets the ground, on screen
 * @param s    tile size in pixels, so the fire scales with the zoom
 * @param heat 0 for cold ash through 1 for a fire freshly fed
 * @param tick sim tick plus interpolation, for the flicker
 * @param seed per-fire variation
 */
export function drawCampfire(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  heat: number,
  tick: number,
  seed: number,
): void {
  const r = s * 0.34;

  // The ring of stones. Always there, lit or not -- a cold camp is a landmark.
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.15, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + noise(seed, i) * 0.4;
    const sx = x + Math.cos(a) * r;
    const sy = y + Math.sin(a) * r * 0.46;
    const sz = s * (0.055 + noise(seed, i + 30) * 0.035);
    ctx.fillStyle = i % 2 === 0 ? "#8b8b86" : "#6f6f6b";
    ctx.beginPath();
    ctx.ellipse(sx, sy, sz, sz * 0.72, a, 0, Math.PI * 2);
    ctx.fill();
  }

  // Two logs across the middle.
  ctx.strokeStyle = heat > 0.15 ? "#3a2a1c" : "#4a3a2c";
  ctx.lineWidth = Math.max(1, s * 0.07);
  ctx.lineCap = "round";
  for (const a of [-0.5, 0.7]) {
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * r * 0.7, y - Math.sin(a) * r * 0.34);
    ctx.lineTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.34);
    ctx.stroke();
  }

  // Embers. Present whenever there is any heat at all, and all there is by day.
  if (heat > 0.02) {
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(255,110,30,${0.25 + heat * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.02, r * 0.55, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (heat > 0.12) {
    // The flame itself: the same tongue the buildings burn with, one of it.
    const phase = tick * 0.26 + noise(seed, 3) * 6.3;
    const lick = 0.78 + Math.sin(phase) * 0.22 + Math.sin(phase * 2.9) * 0.09;
    const h = s * (0.34 + heat * 0.5) * lick;
    const w = s * 0.2 * (0.8 + heat * 0.4);
    ctx.globalCompositeOperation = "lighter";
    const grad = ctx.createLinearGradient(x, y, x, y - h);
    grad.addColorStop(0, `rgba(255,88,12,${0.85 * heat})`);
    grad.addColorStop(0.45, `rgba(255,170,44,${0.62 * heat})`);
    grad.addColorStop(1, "rgba(255,238,160,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w * 1.1, y - h * 0.55, x + Math.sin(phase * 1.7) * w * 0.7, y - h);
    ctx.quadraticCurveTo(x + w * 1.1, y - h * 0.55, x + w, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255,236,168,${0.45 * heat})`;
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.22, w * 0.35, h * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sparks going up. Three is plenty: this is a camp fire, not a forge.
    for (let i = 0; i < 3; i++) {
      const k = ((tick * 0.012 + noise(seed, i + 60)) % 1 + 1) % 1;
      ctx.globalAlpha = (1 - k) * heat * 0.8;
      ctx.fillStyle = "#ffcf7a";
      ctx.beginPath();
      ctx.arc(x + Math.sin(phase * 0.7 + i * 2) * s * 0.12 * k, y - h * 0.6 - k * s * 0.9, Math.max(0.6, s * 0.018), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/**
 * The pool of light a fire throws, laid over the finished picture.
 *
 * This has to happen AFTER the daylight wash, and that is the entire reason it
 * is a separate function. The wash is a multiply over everything on screen, so
 * a glow drawn with the world gets multiplied by night-blue along with the
 * grass it is lighting and comes out as a slightly-less-dark patch of blue.
 * Drawn afterwards, in `lighter`, it adds warmth back on top -- which is what a
 * fire in the dark actually does to a photograph of a field.
 *
 * @param strength 0 by day, 1 in the dead of night
 */
export function drawFireGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  strength: number,
  tick: number,
  seed: number,
): void {
  if (strength <= 0.01 || radius <= 0) return;
  // The pool breathes with the flame, or it reads as a decal.
  const flicker = 0.9 + Math.sin(tick * 0.24 + noise(seed, 11) * 6.3) * 0.07 + Math.sin(tick * 0.61) * 0.03;
  const r = radius * flicker;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,176,86,${0.5 * strength})`);
  g.addColorStop(0.35, `rgba(255,140,58,${0.26 * strength})`);
  g.addColorStop(0.7, `rgba(190,92,40,${0.09 * strength})`);
  g.addColorStop(1, "rgba(120,50,20,0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
