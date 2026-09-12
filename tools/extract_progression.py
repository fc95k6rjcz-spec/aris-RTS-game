"""
Cut a "progression sheet" (levels 1..N laid out in a grid on parchment) into
transparent per-level sprites.

Usage:
  python3 tools/extract_progression.py SHEET.png OUT_PREFIX COLS ROWS X0 X1 Y0 Y1 [HEADROOM]

Each panel is keyed by flood-filling the parchment inward from its border, then the
building is isolated as the largest blob. Caption text, the level badge and panel
rules survive the key as their own blobs and are discarded. A short erosion severs
hairline links (a panel rule can bridge a flag tip to the artwork in the next panel)
before the blob is chosen, then it is dilated back so no real pixels are lost.
"""
from PIL import Image, ImageFilter
from scipy import ndimage
import numpy as np
from collections import deque
import sys

sheet, prefix = sys.argv[1], sys.argv[2]
COLS, ROWS = int(sys.argv[3]), int(sys.argv[4])
X0, X1, Y0, Y1 = (int(v) for v in sys.argv[5:9])
HEADROOM = int(sys.argv[9]) if len(sys.argv) > 9 else 0
TARGET_W = 352

src = Image.open(sheet).convert("RGB")
# Parchment colour: the sheet is overwhelmingly parchment, so its median is that.
REF = np.median(np.asarray(src).reshape(-1, 3).astype(np.int16), axis=0)
cw = (X1 - X0) / COLS
rh = (Y1 - Y0) / ROWS


def key_bg(panel):
    """
    Alpha mask: 0 where parchment is reachable from the panel border.

    The reference is this panel's own median colour. Parchment dominates every
    panel, so the median lands on it, and unlike a sheet-wide reference it follows
    the vignette (edges print darker than centres, enough to break a fixed
    threshold) and unlike corner sampling it can't land on a rule or level badge.
    """
    a = np.asarray(panel).astype(np.int16)
    # Reference the parchment, not the panel as a whole: on the busiest panels the
    # artwork covers more than half the area, so a plain median lands on paint and
    # then nothing keys. Parchment is the largest *bright* region, so take the
    # median of the brighter pixels instead.
    lum = a.mean(axis=2)
    bright = a.reshape(-1, 3)[(lum >= np.percentile(lum, 60)).ravel()]
    ref = np.median(bright, axis=0)
    bg_like = np.abs(a - ref).max(axis=2) < 30

    # Flood the parchment inward from the border.
    seeds = np.zeros(bg_like.shape, bool)
    seeds[0, :] = seeds[-1, :] = True
    seeds[:, 0] = seeds[:, -1] = True
    seeds &= bg_like
    mask = ndimage.binary_propagation(seeds, mask=bg_like)

    # Parchment fully enclosed by artwork (a gap between a crane and a roof, say)
    # is unreachable from the border, so punch out any sizeable pocket directly.
    pockets = (np.abs(a - ref).max(axis=2) < 20) & ~mask
    lab, n = ndimage.label(pockets)
    if n:
        for idx, area in enumerate(ndimage.sum(pockets, lab, range(1, n + 1))):
            if area > 120:
                mask |= lab == idx + 1
    return (~mask).astype(np.uint8) * 255


def isolate(alpha, panel_top):
    """Bounding box and mask of the artwork blob for this panel."""
    solid = alpha > 20
    core = ndimage.binary_erosion(solid, np.ones((3, 3)), iterations=2)
    lab, n = ndimage.label(core)
    if n == 0:
        ys, xs = np.where(solid)
        return (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())), solid
    sizes = ndimage.sum(core, lab, range(1, n + 1))
    pick = None
    for idx in np.argsort(sizes)[::-1]:
        blob = lab == idx + 1
        ys = np.where(blob.any(axis=1))[0]
        # Ignore anything sitting wholly above this panel (pulled in by HEADROOM).
        if ys.max() < panel_top:
            continue
        pick = blob
        break
    if pick is None:
        pick = lab == int(np.argmax(sizes)) + 1
    # Reconstruct the full original blob from the eroded seed, so thin appendages the
    # erosion severed (flag poles, chimneys, crane arms) come back intact.
    grown = ndimage.binary_propagation(pick, mask=solid)
    # Reconstruction also follows any panel rule the artwork happens to touch. Those
    # read as hairline runs spanning most of the panel, so drop them; a flag pole is
    # equally thin but far too short to qualify.
    h, w = grown.shape
    thin = grown & ~ndimage.binary_opening(grown, np.ones((3, 3)))
    lab2, n2 = ndimage.label(thin, np.ones((3, 3)))
    for sl in ndimage.find_objects(lab2):
        if sl is None:
            continue
        y_s, x_s = sl
        bh = y_s.stop - y_s.start
        bw = x_s.stop - x_s.start
        vertical_rule = bh > 0.3 * h and bw < 8 and (y_s.start <= 2 or y_s.stop >= h - 2)
        horizontal_rule = bw > 0.3 * w and bh < 8 and (x_s.start <= 2 or x_s.stop >= w - 2)
        if vertical_rule or horizontal_rule:
            grown[sl] &= ~thin[sl]
    # Frame from the eroded core (which already holds the building and the flag
    # cloth) rather than the reconstruction, so sheet border ornaments and rule
    # fragments that survived the filter above cannot inflate the crop.
    core_box = ndimage.binary_dilation(pick, np.ones((3, 3)), iterations=4)
    ys, xs = np.where(core_box)
    # Pad so thin bits the erosion trimmed (a flag's upper cloth, a spire finial)
    # still fit. Kept well short of the panel edges, where sheet ornaments live.
    pad = int(0.055 * max(grown.shape))
    y0 = max(0, int(ys.min()) - pad)
    y1 = min(grown.shape[0] - 1, int(ys.max()) + pad)
    x0 = max(0, int(xs.min()) - pad)
    x1 = min(grown.shape[1] - 1, int(xs.max()) + pad)
    # Clip to that box. The flag cloth is the topmost solid mass and is already in
    # the core, so nothing real is lost; sheet corner ornaments fall outside.
    clipped = np.zeros_like(grown)
    clipped[y0:y1 + 1, x0:x1 + 1] = grown[y0:y1 + 1, x0:x1 + 1]
    # A panel rule can still leave a hairline sliver hugging the crop's side edge.
    # Flag poles are equally narrow but sit above the roof, not against the margin.
    thin2 = clipped & ~ndimage.binary_opening(clipped, np.ones((3, 3)))
    lab3, n3 = ndimage.label(thin2, np.ones((3, 3)))
    for sl in ndimage.find_objects(lab3):
        if sl is None:
            continue
        y_s, x_s = sl
        bh = y_s.stop - y_s.start
        bw = x_s.stop - x_s.start
        near_edge = min(x_s.start - x0, x1 - x_s.stop) < 0.07 * (x1 - x0)
        if bw <= 8 and bh > 0.2 * (y1 - y0) and near_edge:
            clipped[sl] &= ~thin2[sl]
    ys, xs = np.where(clipped)
    return (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())), clipped


for i in range(COLS * ROWS):
    c, r = i % COLS, i // COLS
    px0 = int(X0 + c * cw)
    py0 = int(Y0 + r * rh)
    top = max(0, py0 - HEADROOM)
    panel = src.crop((px0, top, int(px0 + cw), int(py0 + rh)))
    alpha = key_bg(panel)
    (x0, y0, x1, y1), keep = isolate(alpha, py0 - top)
    alpha = np.where(keep, alpha, 0).astype(np.uint8)
    # A leftover panel rule shows up as a lone vertical hairline standing apart from
    # the artwork. Any column that is tall yet has near-empty neighbours is one.
    colcount = keep.sum(axis=0)
    ph = keep.shape[0]
    for cx in np.where(colcount > 0.25 * ph)[0]:
        lo = max(0, cx - 5)
        hi = min(keep.shape[1], cx + 6)
        neigh = np.delete(colcount[lo:hi], cx - lo)
        if neigh.size and neigh.max() < 0.06 * ph:
            keep[:, cx] = False
    ys, xs = np.where(keep)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())

    rgba = panel.convert("RGBA")
    rgba.putalpha(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.5)))
    crop = rgba.crop((max(0, x0 - 2), max(0, y0 - 2), x1 + 3, y1 + 3))
    s = TARGET_W / crop.width
    crop = crop.resize((TARGET_W, max(1, round(crop.height * s))), Image.LANCZOS)
    crop = crop.convert("RGBA").quantize(colors=200, method=Image.FASTOCTREE)
    out = f"src/assets/{prefix}_{i + 1}.png"
    crop.save(out, optimize=True)
    a = np.asarray(Image.open(out).convert("RGBA"))[..., 3]
    edges = [n for n, v in (("top", a[0].max()), ("bottom", a[-1].max()),
                            ("left", a[:, 0].max()), ("right", a[:, -1].max())) if v > 20]
    print(f"{prefix} {i + 1}: {crop.size}" + (f"  CLIPPED:{','.join(edges)}" if edges else "  clean"))
