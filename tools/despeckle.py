"""
Erase leftover panel-rule hairlines from extracted sprites.

A rule fragment survives as a one- or two-pixel vertical run standing in open
space: tall, but with empty columns either side. Real artwork never looks like
that — even a flagpole has the flag and roof beside it — so isolation is a safe
test. Run after tools/extract_progression.py.
"""
from PIL import Image
import numpy as np
import glob
import sys

cleaned = 0
for path in sorted(glob.glob("src/assets/*.png")):
    im = Image.open(path).convert("RGBA")
    a = np.array(im)
    alpha = a[..., 3]
    h, w = alpha.shape
    solid = alpha > 20
    col = solid.sum(axis=0)

    # A rule fragment shows up as a one- to three-column spike: far more opaque
    # pixels than the columns on either side, because it runs the panel's height
    # while the artwork beside it does not.
    spikes = []
    for x in range(w):
        left = col[max(0, x - 6):max(0, x - 1)]
        right = col[x + 2:x + 7]
        if left.size == 0 or right.size == 0:
            continue
        around = max(np.median(left), np.median(right))
        if col[x] > 0.12 * h and col[x] > around * 1.3:
            spikes.append(x)
    if not spikes:
        continue

    # Delete only the hairline itself: pixels in those columns with clear space a
    # few pixels to either side. Pixels that are part of a solid mass are kept.
    removed = 0
    for x in spikes:
        lo, hi = max(0, x - 6), min(w - 1, x + 6)
        isolated = ~solid[:, lo] & ~solid[:, hi]
        for xx in range(max(0, x - 1), min(w, x + 2)):
            hit = isolated & solid[:, xx]
            removed += int(hit.sum())
            alpha[hit, xx] = 0
    if removed == 0:
        continue

    a[..., 3] = alpha
    ys, xs = np.where(alpha > 20)
    im2 = Image.fromarray(a).crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    im2.quantize(colors=144, method=Image.FASTOCTREE).save(path, optimize=True)
    cleaned += 1
    print(f"cleaned {path}: {removed} px across {len(spikes)} column(s)")
print(f"{cleaned} sprite(s) cleaned")
