"""Cut the cannon's side, front and back views out of the supplied sheet.

Unlike every art sheet before this one, the source already has what the renderer
wants: clean orthographic views on a flat dark ground. So the work is only three
things.

Keying: the background is a dark, desaturated wash with a soft vignette, the
opposite of the parchment sheets, so the key is "dark and grey" flooded inward
from each panel's border rather than a colour match. The cast shadow under each
view keys out with it, which is right -- the game draws its own.

The crest: the red banner on the carriage carries a faction sigil that is not
ours to ship. It is black on red, so the banner is found by hue, the holes
punched in it by the sigil are found by filling the banner solid, and those
holes are repainted in the banner's own colour. The banner survives; the mark on
it does not.

Scale: the three views are scaled by ONE common factor and padded onto a shared
canvas, bottom-aligned. If each were normalised on its own, the cannon would
swell and shrink as it turned -- the side view is nearly three times the width
of the front.
"""

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SRC = "/mnt/user-data/uploads/Ari's fun game/Spences Cannon Human.png"
OUT = "/root/openrts/src/assets"

# Panels in the view strip, as (name, x0, y0, x1, y1) on the source.
PANELS = [
    ("side", 10, 540, 500, 745),
    ("front", 535, 540, 775, 745),
    ("back", 810, 540, 1045, 745),
]
# Width the side view is scaled to; the others follow by the same factor.
SIDE_W = 190


def key(panel: Image.Image) -> np.ndarray:
    """True where the artwork is: everything the background flood cannot reach."""
    a = np.asarray(panel).astype(np.float32) / 255.0
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    # Background: dark and close to grey. The metalwork is dark too, but it is
    # never this flat, and the flood from the border stops where it stops.
    bg_like = (mx < 0.36) & (sat < 0.30)

    seeds = np.zeros(bg_like.shape, bool)
    seeds[0, :] = seeds[-1, :] = True
    seeds[:, 0] = seeds[:, -1] = True
    seeds &= bg_like
    bg = ndimage.binary_propagation(seeds, mask=bg_like)

    keep = ~bg
    keep = ndimage.binary_closing(keep, np.ones((5, 5)))
    keep = ndimage.binary_fill_holes(keep)
    keep = ndimage.binary_opening(keep, np.ones((3, 3)))
    lab, n = ndimage.label(keep)
    if n == 0:
        raise SystemExit("nothing survived the key")
    sizes = ndimage.sum(keep, lab, range(1, n + 1))
    return lab == (1 + int(np.argmax(sizes)))


def strip_sigil(rgb: np.ndarray) -> np.ndarray:
    """Repaint the banner over its emblem, leaving a plain red field.

    An earlier attempt looked for the sigil as holes punched in the red -- fill
    the banner solid, and whatever the fill added must be the mark. It failed:
    the sigil is painted in a very dark red, not black, so it passes a
    red-dominance test and never reads as a hole at all.

    So the mark is found by brightness instead. Inside the banner, it is far
    darker than the cloth around it. The repaint is nearest-neighbour inpainting
    from the surviving cloth, which carries the banner's own shading gradient
    across the gap -- flooding a flat colour leaves an obvious patch.
    """
    a = rgb.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    red = (r > 55) & (r > g * 1.45) & (r > b * 1.45)
    if red.sum() < 200:
        return rgb  # this view shows no banner

    band = ndimage.binary_fill_holes(ndimage.binary_closing(red, np.ones((9, 9))))
    lum = a.mean(axis=2)
    cloth = red & band
    if cloth.sum() < 100:
        return rgb
    ref = float(np.median(lum[cloth]))
    sigil = band & (lum < ref * 0.62)
    # Take the mark with its anti-aliased fringe, or a dark outline survives.
    sigil = ndimage.binary_dilation(sigil, np.ones((3, 3)))
    sigil &= band
    if sigil.sum() == 0:
        return rgb

    # Nearest surviving cloth pixel for every pixel of the mark.
    donor = band & ~sigil
    if donor.sum() < 50:
        return rgb
    _, idx = ndimage.distance_transform_edt(~donor, return_indices=True)
    out = rgb.copy()
    out[sigil] = rgb[idx[0][sigil], idx[1][sigil]]
    # Blur only across the repaint so the join does not read as a seam.
    blurred = np.asarray(Image.fromarray(out).filter(ImageFilter.GaussianBlur(1.4)))
    soft = ndimage.binary_dilation(sigil, np.ones((3, 3)))
    out[soft] = blurred[soft]
    return out


cuts = []
for name, x0, y0, x1, y1 in PANELS:
    panel = Image.open(SRC).convert("RGB").crop((x0, y0, x1, y1))
    mask = key(panel)
    rgb = strip_sigil(np.asarray(panel))
    alpha = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    im = Image.fromarray(rgb).convert("RGBA")
    im.putalpha(alpha)
    im = im.crop(im.getbbox())
    cuts.append((name, im))

# One scale for all three, so the cannon does not change size as it turns.
scale = SIDE_W / cuts[0][1].width
scaled = [(n, im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)) for n, im in cuts]
cw = max(im.width for _, im in scaled)
ch = max(im.height for _, im in scaled)
for name, im in scaled:
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    # Bottom-aligned and centred: the wheels should sit on the ground in every
    # view, and a shared canvas keeps the renderer's aspect maths identical.
    canvas.alpha_composite(im, ((cw - im.width) // 2, ch - im.height))
    canvas.save(f"{OUT}/cannon_{name}.png")
    print("cannon", name, canvas.size)
