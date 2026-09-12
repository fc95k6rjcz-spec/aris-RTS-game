/**
 * The five weapons, drawn as line work.
 *
 * These are small -- a tile across at most -- and they are seen exactly once a
 * match, in a shaft of light, before being picked up. That makes painted art the
 * wrong answer: at this size the silhouette is the whole message, and a few
 * strokes read more clearly than a photograph reduced to thirty pixels. Each is
 * drawn standing upright in the ground, point or haft down, centred on the
 * origin, so the caller only has to translate and scale.
 */

/** Draw a clan's weapon standing in the ground. `s` is the tile size in pixels. */
export function drawWeapon(ctx: CanvasRenderingContext2D, weapon: string, s: number): void {
  const h = s * 1.05;
  ctx.lineJoin = "round";
  switch (weapon) {
    case "axe": {
      // Haft down, a broad crescent head near the top.
      line(ctx, 0, h * 0.45, 0, -h * 0.5);
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.42);
      ctx.quadraticCurveTo(s * 0.42, -h * 0.3, s * 0.06, -h * 0.06);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.42);
      ctx.quadraticCurveTo(-s * 0.42, -h * 0.3, -s * 0.06, -h * 0.06);
      ctx.stroke();
      break;
    }
    case "spiked pick": {
      // A shaft with a hooked head, and spikes off the hook.
      line(ctx, 0, h * 0.45, 0, -h * 0.45);
      ctx.beginPath();
      ctx.moveTo(-s * 0.38, -h * 0.22);
      ctx.quadraticCurveTo(0, -h * 0.52, s * 0.38, -h * 0.22);
      ctx.stroke();
      for (const k of [-0.24, 0, 0.24]) line(ctx, s * k, -h * (0.38 + Math.abs(k)), s * k * 1.5, -h * (0.52 + Math.abs(k)));
      break;
    }
    case "bow": {
      // A stave bent through its whole length, string taut across it.
      ctx.beginPath();
      ctx.moveTo(-s * 0.05, -h * 0.5);
      ctx.quadraticCurveTo(s * 0.46, 0, -s * 0.05, h * 0.5);
      ctx.stroke();
      line(ctx, -s * 0.05, -h * 0.5, -s * 0.05, h * 0.5);
      break;
    }
    case "brand": {
      // A torch: short haft, flame above it.
      line(ctx, 0, h * 0.45, 0, -h * 0.1);
      ctx.beginPath();
      ctx.moveTo(-s * 0.18, -h * 0.1);
      ctx.quadraticCurveTo(-s * 0.22, -h * 0.42, 0, -h * 0.55);
      ctx.quadraticCurveTo(s * 0.22, -h * 0.42, s * 0.18, -h * 0.1);
      ctx.stroke();
      break;
    }
    default: {
      // Sword: blade down in the earth, quillons and pommel above.
      line(ctx, 0, h * 0.55, 0, -h * 0.45);
      line(ctx, -s * 0.3, -h * 0.3, s * 0.3, -h * 0.3);
      ctx.beginPath();
      ctx.arc(0, -h * 0.5, Math.max(1.5, s * 0.07), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
  }
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}
