"""
Cut a sheet of ten building levels on a plain white (or transparent) background
into per-level sprites with no background.

  python3 tools/extract_white_sheet.py SHEET.png OUT_PREFIX [ERASE ...]

ERASE paints part of the sheet back to white before cutting, for screenshot
buttons that sit on top of a building: "x0,y0,x1,y1" for a box, or "c:x,y,r"
for a circle.

No grid is assumed: the ten largest separate shapes are the ten levels, read
top row first, left to right. Anything small (stray text, an icon from a
screenshot) is ignored. The white is keyed by flooding inward from the border,
so white or pale paint inside a building (bone, smoke, flags) survives.
"""
from PIL import Image, ImageFilter
from scipy import ndimage
import numpy as np
import sys

sheet, prefix = sys.argv[1], sys.argv[2]
ERASE = sys.argv[3:]
TARGET_W = 352

im = Image.open(sheet).convert("RGBA")
if ERASE:
    from PIL import ImageDraw
    d = ImageDraw.Draw(im)
    for e in ERASE:
        if e.startswith("c:"):
            x, y, r = (int(v) for v in e[2:].split(","))
            d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, 255))
        else:
            d.rectangle(tuple(int(v) for v in e.split(",")), fill=(255, 255, 255, 255))
a = np.asarray(im).astype(np.int16)
rgb, alpha_in = a[..., :3], a[..., 3]
mx, mn = rgb.max(axis=2), rgb.min(axis=2)
# Near-white and the pale grey-blue of a screenshot's window edge both count.
paper = ((mn > 205) & (mx - mn < 22)) | (alpha_in < 16)
seeds = np.zeros(paper.shape, bool)
seeds[0, :] = seeds[-1, :] = seeds[:, 0] = seeds[:, -1] = True
bg = ndimage.binary_propagation(seeds & paper, mask=paper)
solid = ~bg

# Two rows of five. Rows are split at the emptiest band across the middle;
# within a row, each separate shape goes to whichever fifth of the row its
# centre falls in, so a flag or torch standing apart still joins its building.
rows_fill = solid.sum(axis=1)
ys_any = np.where(rows_fill > 0)[0]
lo, hi = ys_any.min(), ys_any.max()
band = slice(lo + (hi - lo) // 3, lo + 2 * (hi - lo) // 3)
cut = band.start + int(np.argmin(rows_fill[band]))
lab, k = ndimage.label(solid, np.ones((3, 3)))
objs = ndimage.find_objects(lab)
sizes = ndimage.sum(solid, lab, range(1, k + 1))
ordered = []
groups = [[] for _ in range(10)]
for r, (ya, yb) in enumerate(((0, cut), (cut, solid.shape[0]))):
    part = solid[ya:yb]
    xs_any = np.where(part.sum(axis=0) > 0)[0]
    xa, xb = xs_any.min(), xs_any.max() + 1
    cw = (xb - xa) / 5
    for i, sl in enumerate(objs):
        if sl is None or sizes[i] < 12:
            continue
        # Flat slivers along the sheet's edge are screenshot chrome (a scroll
        # bar, a button), not buildings.
        Hh, Ww = solid.shape
        touches = sl[0].start == 0 or sl[1].start == 0 or sl[0].stop == Hh or sl[1].stop == Ww
        if touches and (sl[0].stop - sl[0].start) < 14:
            continue
        # A line of screenshot text: short and wide, in the top margin.
        if (sl[0].stop - sl[0].start) < 16 and sl[0].start < 30:
            continue
        cyc = (sl[0].start + sl[0].stop) / 2
        if not (ya <= cyc < yb):
            continue
        cxc = (sl[1].start + sl[1].stop) / 2
        col = min(4, max(0, int((cxc - xa) // cw)))
        groups[r * 5 + col].append(i + 1)
# Drop crumbs that sit far outside their building (screenshot text, icons).
for g in range(10):
    big = max(groups[g], key=lambda L: sizes[L - 1]) if groups[g] else None
    if big is None:
        sys.exit(f"level {g + 1} not found")
    bsl = objs[big - 1]
    keep = []
    for L in groups[g]:
        sl = objs[L - 1]
        near = sl[0].start < bsl[0].stop + 10 and sl[0].stop > bsl[0].start - 40 and sl[1].start < bsl[1].stop + 10 and sl[1].stop > bsl[1].start - 10
        if L == big or near:
            keep.append(L)
    m = np.isin(lab, keep)
    ys, xs = np.where(m)
    ordered.append((m, xs.min(), ys.min(), xs.max(), ys.max()))

for n, (mask, x0, y0, x1, y1) in enumerate(ordered, 1):
    # Close pinholes, but leave enclosed white (the gap under a derrick) see-through.
    mask = mask | (ndimage.binary_fill_holes(mask) & ~paper)
    # White pockets fenced in by the building (under a derrick, between
    # towers) are sheet, not paint: punch out any that are more than a speck.
    pockets, npk = ndimage.label(mask & paper)
    if npk:
        areas = ndimage.sum(mask & paper, pockets, range(1, npk + 1))
        for i, ar in enumerate(areas):
            if ar > 25:
                mask &= pockets != i + 1
    # Soft edge: fade the outermost pixels so the cut-out does not show a halo
    # of white from the sheet.
    edge = mask & ~ndimage.binary_erosion(mask, iterations=1)
    al = np.where(mask, 255, 0).astype(np.float32)
    whiteish = (mn > 200)
    al[edge & whiteish] *= 0.35
    al = np.minimum(al, np.where(alpha_in < 255, alpha_in, 255))
    out = im.copy()
    out.putalpha(Image.fromarray(al.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.4)))
    crop = out.crop((max(0, x0 - 2), max(0, y0 - 2), x1 + 3, y1 + 3))
    s = TARGET_W / crop.width
    crop = crop.resize((TARGET_W, max(1, round(crop.height * s))), Image.LANCZOS)
    crop.quantize(colors=220, method=Image.FASTOCTREE).save(f"src/assets/{prefix}_{n}.png", optimize=True)
    print(f"{prefix} {n}: {crop.size} from {x1 - x0 + 1}x{y1 - y0 + 1}")
