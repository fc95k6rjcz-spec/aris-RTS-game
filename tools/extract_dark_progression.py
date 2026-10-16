"""
Cut a progression sheet painted on a DARK background (the Orc sheets) into
transparent per-level sprites.

  python3 tools/extract_dark_progression.py SHEET.png OUT_PREFIX TOP1 CUT1 TOP2 CUT2

Layout: 5 columns x 2 rows, a title band on top, and a "Level N" badge plus
caption under each building. TOPn/CUTn bound each row in sheet pixels (for a
1536x1024 sheet; scaled for others). The badge overlaps the bottom of the grass
mound, so everything from its top edge down is dropped and the last rows fade
out, so the mound does not end on a ruler-straight line. The same fade is used
on a side where a mound runs past its fifth of the sheet.

The background is keyed as near-black, low-chroma paint flooded in from the
panel border -- painted shadow inside a building is as dark but warmer, so it
survives. The building is the blob that owns the middle of the panel, which
throws away title text and slivers of the neighbouring mound.
"""
from PIL import Image, ImageFilter
from scipy import ndimage
import numpy as np
import sys

sheet, prefix = sys.argv[1], sys.argv[2]
t1, c1, t2, c2 = (int(v) for v in sys.argv[3:7])
ROWS = [(t1, c1), (t2, c2)]
COLS = 5
TARGET_W = 352
FADE = 10

src = Image.open(sheet).convert("RGB")
W, H = src.size
sx, sy = W / 1536, H / 1024
cw = W / COLS

n = 0
for top, cut in ROWS:
    top, cut = int(top * sy), int(cut * sy)
    for c in range(COLS):
        n += 1
        x0 = int(c * cw)
        panel = src.crop((x0, top, int(x0 + cw), cut))
        a = np.asarray(panel).astype(np.int16)
        mx = a.max(axis=2)
        chroma = mx - a.min(axis=2)
        dark = (mx < 34) & (chroma < 14)
        seeds = np.zeros(dark.shape, bool)
        seeds[0, :] = seeds[:, 0] = seeds[:, -1] = True
        bg = ndimage.binary_propagation(seeds & dark, mask=dark)
        solid = ~bg

        core = ndimage.binary_erosion(solid, np.ones((3, 3)), iterations=3)
        lab, k = ndimage.label(core)
        h, w = core.shape
        central = np.zeros_like(core)
        central[int(h * 0.3):, int(w * 0.3):int(w * 0.7)] = True
        owns = ndimage.sum(core & central, lab, range(1, k + 1))
        pick = lab == int(np.argmax(owns)) + 1
        body = ndimage.binary_propagation(pick, mask=ndimage.binary_erosion(solid, iterations=1))
        keep = ndimage.binary_dilation(body, iterations=2) & solid
        keep = ndimage.binary_closing(keep, np.ones((9, 9))) | keep
        keep = ndimage.binary_fill_holes(keep)

        ramp = np.clip((mx - 28) / 30.0, 0, 1)
        edge = keep & ~ndimage.binary_erosion(keep, np.ones((3, 3)), iterations=3)
        alpha = np.where(keep, 1.0, 0.0)
        alpha = np.where(edge, ramp, alpha)
        for i in range(FADE):
            f = (i + 1) / (FADE + 1)
            alpha[h - 1 - i] *= f
            if keep[:, i].any() and i == 0:
                pass
        # Soften whichever sides the mound was cut on.
        for side in (0, w - 1):
            if keep[:, side].sum() > 4:
                for i in range(FADE):
                    col = i if side == 0 else w - 1 - i
                    alpha[:, col] *= (i + 1) / (FADE + 1)
        alpha8 = (alpha * 255).astype(np.uint8)
        ys, xs = np.where(alpha8 > 8)
        bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max(), ys.max()
        rgba = panel.convert("RGBA")
        rgba.putalpha(Image.fromarray(alpha8).filter(ImageFilter.GaussianBlur(0.6)))
        crop = rgba.crop((max(0, bx0 - 2), max(0, by0 - 2), bx1 + 3, by1 + 3))
        s = TARGET_W / crop.width
        crop = crop.resize((TARGET_W, max(1, round(crop.height * s))), Image.LANCZOS)
        out = f"src/assets/{prefix}_{n}.png"
        crop.quantize(colors=200, method=Image.FASTOCTREE).save(out, optimize=True)
        print(f"{prefix} {n}: {crop.size}" + ("  TOUCHES:top" if by0 <= 1 else ""))
