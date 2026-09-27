"""Rebuild the dragon sheet as a clean RGBA atlas.

The painted sheet has a baked checkerboard backdrop and frames that bleed into
each other (wings and fire cross the cell lines), so slicing it on a fixed grid
cut the fire off in square blocks. This keys out the backdrop, keeps only the
dragon whose body sits in each cell, and packs every frame into its own
roomy 320x300 cell, feet on a common baseline.
Rows out: 0 flying, 1 gliding, 2 rearing to breathe (no fire -- drawn live), 3 death.
"""
from PIL import Image
import numpy as np
from scipy import ndimage

src = Image.open("src/assets/motion-v2/dragon.webp").convert("RGB")
a = np.asarray(src).astype(np.int16)
hi, lo = a.max(2), a.min(2)
alpha = np.where(((hi - lo) < 34) & (lo > 140), 0, 255).astype(np.uint8)
mask = alpha > 0
X0, CW = 110, 222
ROWS = [(0, 262), (265, 262), (533, 262), (795, 262)]
OUT_W, OUT_H = 320, 300
out = Image.new("RGBA", (OUT_W * 6, OUT_H * 4), (0, 0, 0, 0))
rgba = np.dstack([a.astype(np.uint8), alpha])
lab, n = ndimage.label(mask)
for r, (y0, h) in enumerate(ROWS):
    src_row = 2 if r == 2 else r
    for c in range(6):
        cx0 = X0 + c * CW
        if r == 2:  # pre-fire poses only: frames 0 and 1, alternated
            cx0 = X0 + (c % 2) * CW
        cell = lab[y0:y0 + h, cx0:cx0 + CW]
        ids, counts = np.unique(cell[cell > 0], return_counts=True)
        if len(ids) == 0:
            continue
        keep = ids[np.argmax(counts)]
        # Take the component whole (it may spill outside the cell), but only
        # the part within a generous window around the cell.
        wy0, wy1 = max(0, y0 - 30), min(a.shape[0], y0 + h + 30)
        wx0, wx1 = max(0, cx0 - 70), min(a.shape[1], cx0 + CW + 70)
        win = lab[wy0:wy1, wx0:wx1] == keep
        # grow by 1px to keep the soft fringe
        win = ndimage.binary_dilation(win, iterations=1) & mask[wy0:wy1, wx0:wx1]
        piece = rgba[wy0:wy1, wx0:wx1].copy()
        piece[..., 3] = np.where(win, piece[..., 3], 0)
        ys, xs = np.nonzero(win)
        piece = piece[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        im = Image.fromarray(piece, "RGBA")
        if im.width > OUT_W - 8 or im.height > OUT_H - 8:
            k = min((OUT_W - 8) / im.width, (OUT_H - 8) / im.height)
            im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
        ox = c * OUT_W + (OUT_W - im.width) // 2
        oy = r * OUT_H + (OUT_H - 6 - im.height)
        out.alpha_composite(im, (ox, oy))
out.save("src/assets/motion-v2/dragon-clean.webp", "WEBP", quality=88, method=6)
out.save(".diag/dragon-clean.png")
print(out.size)
