"""
Key the ore cart art onto transparency.

The backdrop is near-black with a vignette and a warm glow thrown by the gold, so
a plain threshold either eats the cart's dark ironwork or leaves an orange halo.
Instead the background is flood-filled inward from the border against the corner
colour, which follows the vignette, and the remaining edge is feathered.
"""
from PIL import Image, ImageFilter
from scipy import ndimage
import numpy as np

SRC = "/root/.claude/uploads/c924b6f0-4b5e-51e7-8fe9-f91c13054c13/590dbd37-image.png"
OUT_W = 200

im = Image.open(SRC).convert("RGB")
a = np.asarray(im).astype(np.int16)
ref = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)
print("backdrop", ref)

bg_like = np.abs(a - ref).max(axis=2) < 46
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

# The flood fill stops at the glow the gold throws, leaving a dark halo. Fade the
# near-black pixels out on a luminance ramp — but only within a few pixels of the
# background, or the cart's own dark ironwork goes translucent too.
lum = a.mean(axis=2)
rim = ndimage.binary_dilation(bg, iterations=30) & ~bg
ramp = np.clip((lum - 14) / 34, 0, 1)
alpha = np.where(rim, alpha * ramp, alpha).astype(np.uint8)

img = Image.fromarray(np.dstack([a.astype(np.uint8), alpha]))
img.putalpha(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.6)))
ys, xs = np.where(alpha > 20)
img = img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
img = img.resize((OUT_W, max(1, round(img.height * OUT_W / img.width))), Image.LANCZOS)
# RGBA, never a palette image: quantising collapses alpha to one index.
img.save("src/assets/orecart.png", optimize=True)
print("orecart.png", img.size)

prev = Image.new("RGBA", (img.width * 3 + 40, img.height + 40), (79, 125, 58, 255))
for i in range(3):
    prev.alpha_composite(img, (20 + i * img.width, 20))
prev.save("test/cart-check.png")
