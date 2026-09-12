"""
Key the new gold mine art onto transparency.

The backdrop is a flat slate grey with a soft vignette, so a fixed threshold
leaves a halo. Instead the background is flood-filled inward from the border with
a generous tolerance, which follows the vignette, and the resulting edge is
feathered by one pixel so the sprite does not read as a cut-out.
"""
from PIL import Image, ImageFilter
from scipy import ndimage
import numpy as np

SRC = "/root/.claude/uploads/c924b6f0-4b5e-51e7-8fe9-f91c13054c13/54c8113d-image.png"
OUT_W = 420

im = Image.open(SRC).convert("RGB")
a = np.asarray(im).astype(np.int16)
ref = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)

# Tolerance wide enough to follow the vignette but well short of the artwork,
# whose darkest rock is far bluer and lighter than the backdrop.
bg_like = np.abs(a - ref).max(axis=2) < 26
seeds = np.zeros(bg_like.shape, bool)
seeds[0, :] = seeds[-1, :] = True
seeds[:, 0] = seeds[:, -1] = True
seeds &= bg_like
bg = ndimage.binary_propagation(seeds, mask=bg_like)

alpha = (~bg).astype(np.uint8) * 255
# Drop specks the fill could not reach (compression noise in the backdrop).
lab, n = ndimage.label(alpha > 0)
if n:
    sizes = ndimage.sum(alpha > 0, lab, range(1, n + 1))
    keep = lab == int(np.argmax(sizes)) + 1
    alpha = np.where(keep, alpha, 0).astype(np.uint8)

rgba = np.dstack([a.astype(np.uint8), alpha])
img = Image.fromarray(rgba)
img.putalpha(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.7)))

ys, xs = np.where(alpha > 20)
img = img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
img = img.resize((OUT_W, max(1, round(img.height * OUT_W / img.width))), Image.LANCZOS)
# Save as RGBA, not a palette image: quantising collapses alpha to a single
# transparent index, which turns the feathered edge — and the backdrop colour
# still sitting under the transparent pixels — into an opaque grey box.
img.save("src/assets/goldmine.png", optimize=True)
print("goldmine.png", img.size)

# Preview on grass.
bgp = Image.new("RGBA", (img.width + 80, img.height + 60), (79, 125, 58, 255))
bgp.alpha_composite(img, (40, 30))
bgp.save("test/mine-check.png")
