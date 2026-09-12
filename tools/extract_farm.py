"""
Cut the farm sheet into per-level sprites.

This sheet differs from the parchment progression sheets: each panel is a
full-bleed scene with its own ground, and a farm's fields are part of the
building, so the whole panel becomes the sprite rather than a cut-out structure.
The outer edge is feathered so the scene's grass blends into the map instead of
ending on a hard rectangle.

The banners carry a lion crest. That is a recognisable brand emblem, so it is
painted out here: gold pixels sitting inside a blue banner are replaced with the
banner's own blue, leaving a plain colour field that the renderer can tint.
"""
from PIL import Image, ImageFilter
import numpy as np

SRC = "/root/.claude/uploads/c924b6f0-4b5e-51e7-8fe9-f91c13054c13/b69a4b32-image.png"
COLS = [(18, 303), (316, 603), (615, 895), (918, 1206), (1218, 1505)]
ROWS = [(163, 452), (585, 898)]
OUT = 288

im = Image.open(SRC).convert("RGB")


def strip_emblems(a):
    """Replace gold-on-blue emblem pixels with the surrounding banner blue."""
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    blue = (b > r + 25) & (b > 60)
    gold = (r > 90) & (g > 70) & (b < g - 10) & (r >= g)
    # Only gold that sits within a blue field — i.e. on a banner, not on a roof
    # finial or a wooden cart standing against grass.
    near_blue = np.array(Image.fromarray((blue * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 128
    target = gold & near_blue
    if not target.any():
        return a
    # Median banner blue, used as the replacement fill.
    if blue.any():
        fill = np.median(a[blue], axis=0)
    else:
        fill = np.array([40, 60, 130])
    out = a.copy()
    out[target] = fill
    # Soften the patch so it reads as cloth rather than a flat sticker.
    sm = np.array(Image.fromarray(out).filter(ImageFilter.GaussianBlur(1.2)))
    out[target] = sm[target]
    return out


def feather(rgba, frac=0.10):
    """Fade the outer border to transparent so the scene blends into the map."""
    h, w = rgba.shape[:2]
    fx = np.minimum(np.arange(w), np.arange(w)[::-1]) / (w * frac)
    fy = np.minimum(np.arange(h), np.arange(h)[::-1]) / (h * frac)
    m = np.clip(np.minimum(fx[None, :], fy[:, None]), 0, 1)
    rgba[..., 3] = (rgba[..., 3] * m).astype(np.uint8)
    return rgba


i = 0
for y0, y1 in ROWS:
    for x0, x1 in COLS:
        i += 1
        panel = np.asarray(im.crop((x0, y0, x1, y1))).copy()
        panel = strip_emblems(panel)
        p = Image.fromarray(panel).resize((OUT, OUT), Image.LANCZOS)
        rgba = np.dstack([np.asarray(p), np.full((OUT, OUT), 255, np.uint8)])
        rgba = feather(rgba)
        Image.fromarray(rgba).quantize(colors=160, method=Image.FASTOCTREE).save(
            f"src/assets/farm_{i}.png", optimize=True
        )
        print(f"farm {i}: {OUT}x{OUT}")
