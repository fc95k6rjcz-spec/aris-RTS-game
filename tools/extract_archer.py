"""
Cut the Archer's three views from the right-hand column of the character sheet.

The column's backdrop is mottled and compression-noisy rather than flat, so it is
keyed by flooding inward from each panel's border with a wide tolerance — which
follows the mottling — and then keeping the largest blob.
"""
from PIL import Image, ImageFilter
from scipy import ndimage
import numpy as np

SRC = "/root/.claude/uploads/c924b6f0-4b5e-51e7-8fe9-f91c13054c13/b9965dd2-image.png"
COL = (1028, 1254)
PANELS = {"front": (0, 400), "back": (400, 802), "side": (802, 1254)}
OUT_H = 180

im = Image.open(SRC).convert("RGB")

for name, (y0, y1) in PANELS.items():
    cell = im.crop((COL[0], y0, COL[1], y1))
    a = np.asarray(cell).astype(np.int16)
    ref = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)

    # Flood the backdrop inward from the border. A colour test does not work here:
    # the archer's trousers and boots are as dark as the mottled ground, so keying
    # on brightness punches the legs out and leaves the boots floating.
    bg_like = np.abs(a - ref).max(axis=2) < 30
    # Seed the fill from the sides and top only. The archer's legs run to the
    # bottom edge and his trousers are as dark as the ground, so a seed along the
    # bottom lets the fill climb straight up through him.
    seeds = np.zeros(bg_like.shape, bool)
    seeds[0, :] = True
    seeds[:, 0] = seeds[:, -1] = True
    seeds &= bg_like
    bg = ndimage.binary_propagation(seeds, mask=bg_like)

    fg = ndimage.binary_closing(~bg, np.ones((5, 5)))
    fg = ndimage.binary_fill_holes(fg)

    # Keep the figure plus anything close to it — the bow is held at arm's length
    # and forms its own blob — and drop the sheet's compression artefacts further out.
    lab, n = ndimage.label(fg, np.ones((3, 3)))
    if n:
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        main = int(np.argmax(sizes)) + 1
        near = ndimage.binary_dilation(lab == main, iterations=18)
        keep = lab == main
        for idx, area in enumerate(sizes):
            piece = lab == idx + 1
            if idx + 1 == main or area < 300 or not (near & piece).any():
                continue
            mean = a[piece].mean(axis=0)
            if mean[0] - mean[1] > 42 and mean[0] - mean[2] > 42:
                continue  # a red artefact, not the bow
            keep |= piece
        fg = keep

    # A tolerance tight enough to keep the legs also leaves a halo of mottled
    # backdrop clinging to the outline. Fade it on colour distance: figure pixels
    # sit far from the backdrop tone and stay solid, haze goes.
    dist = np.abs(a - ref).max(axis=2)
    ramp = np.clip((dist - 26) / 22, 0, 1)
    # The thumbnails also carry a near-black vertical band that sits FAR from the
    # backdrop tone, so the ramp above keeps it. Nothing on the archer is that
    # dark and that colourless — his darkest leather still has warmth — so drop
    # near-black, unsaturated pixels outright.
    sat = a.max(axis=2) - a.min(axis=2)
    lum = a.mean(axis=2)
    void = (lum < 34) & (sat < 26)
    alpha = (fg.astype(float) * 255 * ramp * (~void)).astype(np.uint8)
    img = Image.fromarray(np.dstack([a.astype(np.uint8), alpha]))
    img.putalpha(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.6)))
    ys, xs = np.where(alpha > 20)
    img = img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    img = img.resize((max(1, round(img.width * OUT_H / img.height)), OUT_H), Image.LANCZOS)
    img.save(f"src/assets/archer_{name}.png", optimize=True)   # RGBA, not palette
    print(f"archer_{name}", img.size)

sp = [Image.open(f"src/assets/archer_{n}.png").convert("RGBA") for n in PANELS]
prev = Image.new("RGBA", (sum(s.width for s in sp) + 60, OUT_H + 20), (60, 92, 44, 255))
x = 15
for s in sp:
    prev.alpha_composite(s, (x, 10))
    x += s.width + 15
prev.save("test/archer-check.png")
