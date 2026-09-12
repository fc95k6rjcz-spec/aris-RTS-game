"""
Cut the tree sheet into ten sprites.

Backdrop is a flat dark grey, so each cell is keyed by flooding the background
inward from the cell border and keeping the largest remaining blob — which drops
the neighbouring trees' overhang as well as the backdrop.
"""
from PIL import Image, ImageFilter
from scipy import ndimage
import numpy as np

SRC = "/root/.claude/uploads/c924b6f0-4b5e-51e7-8fe9-f91c13054c13/0b97f7b0-image.png"
COLS, ROWS, OUT_W = 5, 2, 190

im = Image.open(SRC).convert("RGB")
W, H = im.size
cw, ch = W / COLS, H / ROWS
whole = np.asarray(im).astype(np.int16)
ref = np.median(np.concatenate([whole[0], whole[-1], whole[:, 0], whole[:, -1]]), axis=0)
print("backdrop", ref)

for i in range(COLS * ROWS):
    c, r = i % COLS, i // COLS
    cell = im.crop((int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)))
    a = np.asarray(cell).astype(np.int16)

    bg_like = np.abs(a - ref).max(axis=2) < 30
    seeds = np.zeros(bg_like.shape, bool)
    seeds[0, :] = seeds[-1, :] = True
    seeds[:, 0] = seeds[:, -1] = True
    seeds &= bg_like
    bg = ndimage.binary_propagation(seeds, mask=bg_like)

    alpha = (~bg).astype(np.uint8) * 255
    lab, n = ndimage.label(alpha > 0, np.ones((3, 3)))
    if n:
        sizes = ndimage.sum(alpha > 0, lab, range(1, n + 1))
        alpha = np.where(lab == int(np.argmax(sizes)) + 1, alpha, 0).astype(np.uint8)

    img = Image.fromarray(np.dstack([a.astype(np.uint8), alpha]))
    img.putalpha(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.6)))
    ys, xs = np.where(alpha > 20)
    img = img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    img = img.resize((OUT_W, max(1, round(img.height * OUT_W / img.width))), Image.LANCZOS)
    img.save(f"src/assets/tree_{i + 1}.png", optimize=True)  # RGBA, not a palette image
    print(f"tree_{i + 1}", img.size)

sprites = [Image.open(f"src/assets/tree_{i + 1}.png").convert("RGBA") for i in range(10)]
maxh = max(s.height for s in sprites)
prev = Image.new("RGBA", (sum(s.width for s in sprites) + 110, maxh + 20), (79, 125, 58, 255))
x = 10
for s in sprites:
    prev.alpha_composite(s, (x, 10 + maxh - s.height))
    x += s.width + 10
prev.save("test/trees-check.png")
