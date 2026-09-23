"""
Cut the Orc farm sheet (orc_farm.png) into ten per-level sprites.

  python3 tools/extract_orc_farm.py SHEET.png

Unlike the other Orc sheets this one has no dark backdrop and no badges: the
farms sit on a soft, out-of-focus wash with a "Level N" title above each, in
rows of 4, 3 and 3. The wash is blurred and the farms are sharp, so the farm is
found by local detail (edge energy) rather than by colour, then filled solid.
The white titles are painted out first so they do not count as detail.
"""
from PIL import Image, ImageFilter
from scipy import ndimage
import numpy as np
import sys

src = Image.open(sys.argv[1]).convert("RGB")
W, H = src.size
sx, sy = W / 1536, H / 1024
TARGET_W = 352

# (x0, x1, y0, y1) per level, in 1536x1024 sheet pixels. Generous boxes; the
# detail mask decides the real edge.
ROW1 = [(0, 384), (384, 768), (768, 1152), (1152, 1536)]
ROW23 = [(0, 512), (512, 1024), (1024, 1536)]
PANELS = [(x0, x1, 0, 285) for x0, x1 in ROW1] + [(x0, x1, 272, 600) for x0, x1 in ROW23] + [(x0, x1, 596, 1024) for x0, x1 in ROW23]

a_full = np.asarray(src).astype(np.float32)
for n, (x0, x1, y0, y1) in enumerate(PANELS, 1):
    box = (int(x0 * sx), int(y0 * sy), int(x1 * sx), int(y1 * sy))
    panel = src.crop(box)
    a = np.asarray(panel).astype(np.float32)
    mx, mn = a.max(axis=2), a.min(axis=2)
    # Title lettering: near-white, low chroma. Mask it out of the detail map.
    text = (mn > 185) & (mx - mn < 40)
    # Only in the title band at the top of the panel: bone spikes and flames
    # further down are just as pale, and are part of the farm.
    text[int(48 * sy):] = False
    text = ndimage.binary_dilation(text, iterations=4)
    grey = a.mean(axis=2)
    gx = ndimage.sobel(grey, axis=1)
    gy = ndimage.sobel(grey, axis=0)
    energy = np.hypot(gx, gy)
    energy[text] = 0
    energy = ndimage.gaussian_filter(energy, 4)
    detail = energy > 28
    lab, k = ndimage.label(detail)
    sizes = ndimage.sum(detail, lab, range(1, k + 1))
    keep = lab == int(np.argmax(sizes)) + 1
    keep = ndimage.binary_closing(keep, np.ones((15, 15)))
    keep = ndimage.binary_fill_holes(keep)
    keep &= ~text
    keep = ndimage.binary_opening(keep, np.ones((5, 5)))
    lab, k = ndimage.label(keep)
    sizes = ndimage.sum(keep, lab, range(1, k + 1))
    keep = lab == int(np.argmax(sizes)) + 1
    alpha = ndimage.gaussian_filter(keep.astype(np.float32), 2.0)
    alpha = np.clip((alpha - 0.2) / 0.6, 0, 1)
    alpha8 = (alpha * 255).astype(np.uint8)
    ys, xs = np.where(alpha8 > 8)
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max(), ys.max()
    rgba = panel.convert("RGBA")
    rgba.putalpha(Image.fromarray(alpha8))
    crop = rgba.crop((max(0, bx0 - 2), max(0, by0 - 2), bx1 + 3, by1 + 3))
    s = TARGET_W / crop.width
    crop = crop.resize((TARGET_W, max(1, round(crop.height * s))), Image.LANCZOS)
    crop.quantize(colors=200, method=Image.FASTOCTREE).save(f"src/assets/orc_farm_{n}.png", optimize=True)
    edges = [nm for nm, v in (("top", by0 <= 1), ("bottom", by1 >= alpha.shape[0] - 2),
                              ("left", bx0 <= 1), ("right", bx1 >= alpha.shape[1] - 2)) if v]
    print(f"orc_farm {n}: {crop.size}" + (f"  TOUCHES:{','.join(edges)}" if edges else ""))
