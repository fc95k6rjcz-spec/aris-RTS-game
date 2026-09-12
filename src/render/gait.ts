/**
 * A walk cycle from a single still sprite.
 *
 * Real sprite animation means several drawn frames per direction per action --
 * a lot of art to generate and keep consistent. This is the cheap approximation
 * that gets most of the way there: the body rises and falls twice per stride,
 * squashes as weight lands, sways once per stride, and drags a shadow that
 * tightens as it lifts. None of it moves a limb, but the eye reads weight and
 * cadence from the body alone, and a marching line stops looking like furniture
 * sliding across the ground.
 *
 * Idle units breathe instead -- a fraction of a percent, slowly. It is barely
 * visible on one unit and unmistakable across twenty standing still.
 */

/** How far a leg swings at the top of its arc, in radians. */
export const LEG_SWING = 0.17;

export interface Gait {
  /** Pixels to raise the sprite. */
  lift: number;
  /** Radians to lean. */
  lean: number;
  /** Horizontal scale. */
  sx: number;
  /** Vertical scale. */
  sy: number;
  /** Multiplier on the ground shadow's radius. */
  shadow: number;
}

const STILL: Gait = { lift: 0, lean: 0, sx: 1, sy: 1, shadow: 1 };

/**
 * @param phase  0..1 through the stride, already offset per unit so a crowd
 *               does not march in lockstep.
 * @param moving whether the unit is travelling.
 * @param s      tile size in pixels; every displacement scales with it.
 * @param heavy  wheeled or mounted things: they roll rather than step, so they
 *               get the sway and none of the bounce.
 */
export function gait(phase: number, moving: boolean, s: number, heavy = false): Gait {
  if (!moving) {
    // Breathing: one slow cycle, driven off the same phase at a fifth the rate.
    const b = Math.sin(phase * Math.PI * 2 * 0.2);
    return { lift: 0, lean: 0, sx: 1 - b * 0.006, sy: 1 + b * 0.010, shadow: 1 };
  }
  const sway = Math.sin(phase * Math.PI * 2);
  if (heavy) return { lift: 0, lean: sway * 0.012, sx: 1, sy: 1, shadow: 1 };

  // Two footfalls per stride: |sin| peaks twice over the cycle.
  const rise = Math.abs(Math.sin(phase * Math.PI * 2));
  // Weight lands at the bottom of the rise, so squash is strongest there.
  const land = 1 - rise;
  return {
    lift: rise * s * 0.055,
    lean: sway * 0.045,
    sx: 1 + land * 0.045,
    sy: 1 - land * 0.05,
    shadow: 1 - rise * 0.22,
  };
}

/**
 * How far a working unit is through one stroke, as a rotation in radians.
 * Back slowly, through fast: an axe that swung symmetrically would look like a
 * metronome rather than a blow.
 */
export function swingLean(k: number): number {
  if (k < 0.45) return -(k / 0.45) * 0.3; // wind up
  const f = (k - 0.45) / 0.55;
  return -0.3 + f * f * 0.72; // and through
}


/**
 * Draw a still sprite as a walking one by cutting it in two and swinging the
 * legs.
 *
 * The painted art is a single standing pose -- there is no second frame to flip
 * to -- so the walk is made by slicing the sprite at the hip, splitting the
 * lower band down the middle, and rotating each half about the hip in
 * antiphase. Rendered small and in motion that reads as a stride; the eye fills
 * in the rest. It is not frame animation and does not pretend to be, but it
 * costs no new art and works for every unit we have and every one we add.
 *
 * Two details do the work. The bands overlap by a pixel, or the seam at the hip
 * shows as a hairline. And the swing is small -- a few degrees -- because the
 * halves are rectangles of paint, not jointed limbs, and a big angle makes that
 * obvious.
 *
 * @param draw called with (sx, sy, sw, sh, dx, dy, dw, dh) to blit part of the
 *             source; the caller owns the image and any tinting.
 */
export function drawWalk(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  iw: number,
  ih: number,
  w: number,
  h: number,
  phase: number,
  swing: number,
): void {
  // Legs are the bottom third of a standing figure, near enough for every
  // sprite in the set.
  const hip = 0.66;
  const hipPx = h * hip;
  const srcHip = Math.round(ih * hip);
  const overlap = Math.max(1, Math.round(ih * 0.01));

  // Torso: everything above the hip, drawn once and unmoved.
  ctx.drawImage(img, 0, 0, iw, srcHip + overlap, -w / 2, -h, w, hipPx + (overlap / ih) * h);

  // Each leg is half the lower band, pivoting at the hip.
  const a = Math.sin(phase * Math.PI * 2) * swing;
  for (const [side, angle] of [
    [0, a],
    [1, -a],
  ] as const) {
    ctx.save();
    // Pivot at the middle of the hip line, a little inboard for the far leg so
    // the two do not rotate about the same point and read as one wedge.
    const px = (side === 0 ? -1 : 1) * w * 0.08;
    // Move the origin to the hip, turn, then move it back. The inverse of
    // translate(px, -h + hipPx) is translate(-px, h - hipPx) -- getting that
    // second term wrong (it was -hipPx) threw the legs clean off the sprite and
    // left every unit cut off at the waist.
    ctx.translate(px, -h + hipPx);
    ctx.rotate(angle);
    ctx.translate(-px, h - hipPx);
    ctx.beginPath();
    ctx.rect(side === 0 ? -w / 2 : 0, -h + hipPx - 0.5, w / 2, h - hipPx + 1);
    ctx.clip();
    ctx.drawImage(
      img,
      0,
      srcHip - overlap,
      iw,
      ih - srcHip + overlap,
      -w / 2,
      -h + hipPx - (overlap / ih) * h,
      w,
      h - hipPx + (overlap / ih) * h,
    );
    ctx.restore();
  }
}
