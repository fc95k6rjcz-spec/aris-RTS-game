"""Key the gold depot art (flat dark backdrop) onto transparency."""
from PIL import Image, ImageFilter
from scipy import ndimage
import numpy as np

SRC = "/root/.claude/uploads/c924b6f0-4b5e-51e7-8fe9-f91c13054c13/deddb386-image.png"
OUT_W = 420

im = Image.open(SRC).convert("RGB")
a = np.asarray(im).astype(np.int16)
ref = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)

bg_like = np.abs(a - ref).max(axis=2) < 30
seeds = np.zeros(bg_like.shape, bool)
seeds[0, :] = seeds[-1, :] = True
seeds[:, 0] = seeds[:, -1] = True
seeds &= bg_like
bg = ndimage.binary_propagation(seeds, mask=bg_like)

alpha = (~bg).astype(np.uint8) * 255
lab, n = ndimage.label(alpha > 0)
if n:
    sizes = ndimage.sum(alpha > 0, lab, range(1, n + 1))
    alpha = np.where(lab == int(np.argmax(sizes)) + 1, alpha, 0).astype(np.uint8)

img = Image.fromarray(np.dstack([a.astype(np.uint8), alpha]))
img.putalpha(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.7)))
ys, xs = np.where(alpha > 20)
img = img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
img = img.resize((OUT_W, max(1, round(img.height * OUT_W / img.width))), Image.LANCZOS)
img.save("src/assets/golddepot.png", optimize=True)   # RGBA, never a palette image
print("golddepot.png", img.size)

prev = Image.new("RGBA", (img.width + 60, img.height + 60), (79, 125, 58, 255))
prev.alpha_composite(img, (30, 30))
prev.save("test/depot-check.png")
