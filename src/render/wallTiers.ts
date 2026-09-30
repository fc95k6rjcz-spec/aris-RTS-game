/**
 * Wall tiers drawn on the connecting pieces.
 *
 * The sixteen joined wall pieces (one per north/east/south/west combination)
 * are what let a wall run, turn and cross at the game's camera angle. Justin's
 * ten painted wall tiers are showcase sections at another angle, so they can't
 * be laid on the grid -- but their stone can. Each tier re-surfaces the same
 * pieces with that painting's stonework (tools/prepare-wall-tiers.mjs cuts the
 * swatches), keeping the pieces' own light and shade, and the wall grows a
 * taller and paler with each tier. From Bastion Wall (tier 8) straight runs fly
 * the realm's banners, and the Royal Wall (tier 10) is trimmed in gold.
 */

/** Stone colour per tier, and how much lighter (+) or darker (-) than the piece. */
const TIER_STONE: Array<[string, number]> = [
  ["#8a6f4c", -0.25], ["#8f7652", -0.18], ["#968063", -0.1],
  ["#8e8b84", 0], ["#908d86", 0.05], ["#96938b", 0.1],
  ["#b8ae98", 0.18], ["#c2b89f", 0.24], ["#cbc2aa", 0.3], ["#d8cfb6", 0.36],
];

/** How much taller than a tier-1 piece each tier stands. */
export function wallTierHeight(tier: number): number {
  // Low dry-stone at tier 1, half again as tall as today's wall by tier 10.
  return 0.72 + (Math.max(1, Math.min(10, tier)) - 1) * 0.09;
}

/** A tier's version of one connecting piece, as a canvas the same size as the piece. */
export function tierWallPiece(piece: HTMLImageElement | HTMLCanvasElement, stone: HTMLImageElement | HTMLCanvasElement | null, tier: number, mask: number): HTMLCanvasElement {
  const w = piece.width, h = piece.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(piece, 0, 0);
  if (stone) {
    // The painting's stone, scaled so a block reads about the size the piece's own blocks do.
    const scale = Math.max(0.35, w / 520);
    const tile = document.createElement("canvas");
    tile.width = Math.max(8, Math.round(stone.width * scale));
    tile.height = Math.max(8, Math.round(stone.height * scale));
    tile.getContext("2d")!.drawImage(stone, 0, 0, tile.width, tile.height);
    const pattern = ctx.createPattern(tile, "repeat")!;
    // Colour and grain from the painting, light and shade from the piece.
    ctx.globalCompositeOperation = "color";
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.75;
    ctx.fillRect(0, 0, w, h);
    // The stone itself moves up the ladder: rough brown field stone, then
    // dressed grey, then pale limestone for the royal walls.
    const [hue, light] = TIER_STONE[Math.max(1, Math.min(10, tier)) - 1]!;
    ctx.globalCompositeOperation = "color";
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = hue;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = light > 0 ? "screen" : "multiply";
    ctx.globalAlpha = Math.abs(light);
    ctx.fillStyle = light > 0 ? "#ffffff" : "#3a3026";
    ctx.fillRect(0, 0, w, h);
    // Blending paints the empty corners too: cut back to the piece's outline.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(piece, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }
  const run = (mask & 10) !== 0 && (mask & 5) === 0; // a straight east-west run
  if (tier >= 8 && run) {
    // A royal banner hung on the face, blue with a gold charge.
    const bw = w * (tier >= 10 ? 0.2 : 0.16), bh = h * 0.36, bx = w * 0.5 - bw / 2, by = h * 0.36;
    ctx.fillStyle = "#1f3f8f";
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + bw, by);
    ctx.lineTo(bx + bw, by + bh);
    ctx.lineTo(bx + bw / 2, by + bh * 0.82);
    ctx.lineTo(bx, by + bh);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = tier >= 10 ? "#e2b43c" : "#b99a4a";
    ctx.lineWidth = Math.max(1, w * 0.012);
    ctx.stroke();
    ctx.fillStyle = "#e2b43c";
    ctx.beginPath();
    ctx.arc(bx + bw / 2, by + bh * 0.4, bw * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  if (tier >= 10) {
    // Gold along the wall-walk: a warm wash over the top of the piece.
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.35);
    g.addColorStop(0, "rgba(226,180,60,0.55)");
    g.addColorStop(1, "rgba(226,180,60,0)");
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h * 0.35);
    ctx.globalCompositeOperation = "source-over";
  }
  return c;
}
