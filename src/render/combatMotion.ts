import type { Projectile } from "../sim/entities";

/** Render between simulation ticks; the heading follows the curved trajectory. */
export function projectilePose(p: Projectile, alpha: number) {
  const t = Math.max(0, Math.min(1, p.t - p.speed * (1 - alpha)));
  const dx = p.to.x - p.from.x, dy = p.to.y - p.from.y;
  const distance = Math.hypot(dx, dy);
  const arc = p.kind === "bolt" ? 12 : Math.min(p.kind === "shell" ? 90 : 55, distance * .12);
  return {
    x: p.from.x + dx * t,
    y: p.from.y + dy * t - 4 * arc * t * (1 - t),
    angle: Math.atan2(dy - 4 * arc * (1 - 2 * t), dx),
  };
}

/** Fall first, hold the final pose, then fade. Durations are simulation ticks. */
export function deathPose(age: number) {
  const t = Math.max(0, Math.min(1, age / 18));
  return { fall: t * t * (3 - 2 * t), opacity: Math.max(0, Math.min(1, (100 - age) / 24)) };
}

export function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, zoom: number, heavy = false): void {
  const length = zoom * (heavy ? .46 : .29);
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#34291c"; ctx.lineWidth = Math.max(1.8, zoom * .045);
  ctx.beginPath(); ctx.moveTo(-length, 0); ctx.lineTo(0, 0); ctx.stroke();
  ctx.strokeStyle = "#c4a26a"; ctx.lineWidth = Math.max(.8, zoom * .019); ctx.stroke();
  ctx.fillStyle = "#b9c2c1";
  ctx.beginPath(); ctx.moveTo(length * .18, 0); ctx.lineTo(-length * .1, -length * .085);
  ctx.lineTo(-length * .05, 0); ctx.lineTo(-length * .1, length * .085); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#d1c8ae"; ctx.lineWidth = Math.max(.7, zoom * .018);
  ctx.beginPath(); ctx.moveTo(-length * .72, 0); ctx.lineTo(-length, -length * .1);
  ctx.moveTo(-length * .72, 0); ctx.lineTo(-length, length * .1); ctx.stroke();
  ctx.restore();
}
