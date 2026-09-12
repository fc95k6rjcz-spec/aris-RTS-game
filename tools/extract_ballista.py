"""Cut the ballista engine out of the supplied concept scene.

The source is a full painted scene: the siege engine on grass, three crewmen in
blue tabards, ammunition crates, barrels, trees, and a blue banner carrying a
rampant-lion crest at the top left. We want the machine alone, and none of the
rest -- the crest above all, since it is not ours to ship.

Grass first, by hue: the sunlit turf is a warm yellow-green (hue 50-80) while
every timber in the machine sits at hue 20-32, so a hue band separates them
where a plain green-channel test does not. The crewmen can't be keyed the same
way -- their skin and their lit helmets read almost exactly like sunlit steel --
so they come out by region instead, along with the banner. What is left is the
machine plus loose scenery, and keeping only the blob that holds the carriage
drops the rest.
"""

import colorsys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SRC = "/root/.claude/uploads/c924b6f0-4b5e-51e7-8fe9-f91c13054c13/56798ab3-image.png"
OUT = "/root/openrts/src/assets/ballista.png"
CROP = (110, 100, 1402, 940)

# Regions that are not the machine, in crop coordinates. The banner is first for
# a reason: it carries a faction crest that must not survive into the sprite.
CUTS = [
    (0, 0, 130, 215),        # banner and crest
    (0, 140, 178, 450),      # crewman winding the left torsion bundle
    (598, 0, 752, 190),      # crewman behind the arm
    (975, 445, 1210, 770),   # crewman carrying a bolt, right
    (120, 0, 360, 135),      # palisade stakes behind the machine
    (0, 690, 220, 840),      # bolt crate, bottom left
]

im = Image.open(SRC).convert("RGB").crop(CROP)
a = np.asarray(im).astype(np.float32) / 255.0
mx = a.max(axis=2)
mn = a.min(axis=2)
v = mx
s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
r, g, b = a[..., 0], a[..., 1], a[..., 2]

# Hue, only where it means anything.
hue = np.zeros_like(mx)
d = np.maximum(mx - mn, 1e-6)
hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60

# Sunlit turf by hue, plus the shaded turf underneath, which loses its
# saturation and needs a green-over-red test instead.
grass = (s > 0.20) & (hue > 40) & (hue < 200)
grass |= (g > r * 0.94) & (b < g) & (v < 0.42)
sky = (b > r) & (b > g) & (v > 0.45) & (s < 0.35)   # the pale water at top right
keep = ~(grass | sky)

for x0, y0, x1, y1 in CUTS:
    keep[y0:y1, x0:x1] = False

keep = ndimage.binary_closing(keep, np.ones((5, 5)))

# Fill pinholes in the woodwork but NOT the big triangles of open ground framed
# by the arm and the carriage -- filling those glues a lawn into the middle of
# the sprite. Only holes small enough to be paint artefacts get closed.
holes = ndimage.binary_fill_holes(keep) & ~keep
hl, hn = ndimage.label(holes)
if hn:
    small = np.array([False] + [sz < 400 for sz in ndimage.sum(holes, hl, range(1, hn + 1))], dtype=bool)
    keep = keep | small[hl]
lab, n = ndimage.label(keep)
seed = lab[600, 560]  # y, x -- a lower frame beam, solidly inside the carriage
assert seed != 0, "seed landed on background"
keep = lab == seed

# Shave the last hairline of turf that clings to the silhouette.
keep = ndimage.binary_erosion(keep, np.ones((3, 3)))
keep = ndimage.binary_opening(keep, np.ones((5, 5)))
lab, n = ndimage.label(keep)
sizes = ndimage.sum(keep, lab, range(1, n + 1))
keep = lab == (1 + int(np.argmax(sizes)))

alpha = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))
out = im.convert("RGBA")
out.putalpha(alpha)

out = out.crop(out.getbbox())
w, h = out.size
out = out.resize((150, max(1, round(h * 150 / w))), Image.LANCZOS)
out.save(OUT)
print("ballista", out.size)
