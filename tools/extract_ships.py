"""Cut the four ships out of their seascapes.

Every art sheet before this one was a set of flat orthographic views on a plain
ground, which keys out in a line of code. These are not that: they are single
hero renders, each sitting in a photographic ocean with spray, reflection and
weather. So the key has to be built per picture from what is actually behind the
subject, and then cleaned up by geometry rather than by colour.

The shared method:

  1. Key the background. Open water is strongly blue-dominant; sky is blue and
     bright; pack ice is bright and colourless. Each ship is keyed by the rule
     that fits its own backdrop (see SHIPS below), which is more reliable than
     any one clever universal rule.
  2. Keep the largest connected blob. Spray, whitecaps and distant mountains all
     survive step 1 in places; none of them touch the hull, so taking the single
     biggest component throws the lot away.
  3. Fill enclosed holes. A dark porthole or a shadowed gap in the rigging is
     inside the ship even though it fails the colour test.
  4. Feather the edge by one pixel, so the sprite does not read as a cut-out
     against the game's water.

The ships are then scaled so their lengths are in proportion to each other --
a longboat beside a battleship should look like a rowing boat beside a
battleship -- and saved with the pivot at the centre of the hull.
"""

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SRC = "/mnt/user-data/uploads/Ari's fun game"
OUT = "/root/openrts/src/assets"

# name, file, keying rule, width in game pixels at 64 px/tile.
#
# The widths are the design: a longboat is one tile of hull, a battleship most of
# three. That ratio is the whole reason the battleship feels like an event when
# it arrives.
# Some pictures need a corner told to go away. The tanker sails into a sunset
# and sunlit water is warm rather than blue, so a patch of sea passes the key and
# touches the bow; the battleship's sky is the same problem with clouds. Rather
# than tightening a colour rule until it starts eating the ship -- which is
# exactly how the battleship lost half its foredeck -- the offending region is
# named outright, in fractions of the picture, as a piece of art direction.
SHIPS = [
    ("longboat", "human long boat .png", "water", 96),
    ("submarine", "human sub .png", "water", 124),
    ("battleship", "human battle ship.png", "sky", 190, 3, [(0.58, 0.0, 0.90, 0.45), (0.80, 0.0, 1.0, 0.33), (0.0, 0.0, 0.09, 0.48), (0.44, 0.0, 0.58, 0.30)]),
    ("icebreaker", "ice braeker human .png", "ice", 150),
    ("tanker", "human oil tanker.png", "sky", 205, 3, [(0.0, 0.0, 1.0, 0.15), (0.72, 0.0, 1.0, 0.30), (0.0, 0.78, 0.40, 1.0)]),
]


def key_water(rgb):
    """Open water: blue clearly ahead of red, and not a pale whitecap."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    blue = (b.astype(int) - r.astype(int)) > 28
    return ~blue


def key_seascape(rgb):
    """Sea below, sky above: both blue-dominant, the ship grey and warm-ish."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    blue = (b.astype(int) - r.astype(int)) > 22
    # Cloud is bright and nearly colourless; the ship's grey is darker than that.
    # The first threshold here was too strict and left a band of cloud pasted
    # across the sprite between the mast and the bow, where the ship's own
    # outline encloses the sky.
    mx = rgb.max(axis=2).astype(int)
    mn = rgb.min(axis=2).astype(int)
    cloud = (mx > 188) & ((mx - mn) < 55)
    return ~(blue | cloud)


def key_ice(rgb):
    """Pack ice and polar sky: everything pale, or blue. The ship is neither."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(axis=2).astype(int)
    mn = rgb.min(axis=2).astype(int)
    pale = mx > 190
    # Only *bright* blue is sky or meltwater. The icebreaker's hull is dark navy,
    # and a plain blue test keyed the whole bow out of the picture.
    blue = ((b.astype(int) - r.astype(int)) > 18) & (mx > 90)
    return ~(pale | blue)


def key_sky(rgb):
    """Blue only.

    No cloud rule: a warship's deck is the same grey as an overcast, and the
    rule that removed the cloud removed the foredeck with it. The sky is cut out
    by the erase boxes instead, which cannot possibly take the hull with it.

    The threshold is high on purpose. A warship's hull is not grey, it is a very
    dark blue -- measured at rgb(17, 29, 42), which is blue-ahead-of-red by 25 --
    and a threshold of 20 quietly deleted the middle of the ship. Open sea is
    blue by 59. Anything between the two is hull.
    """
    r, b = rgb[..., 0].astype(int), rgb[..., 2].astype(int)
    return ~((b - r) > 42)


KEYS = {"water": key_water, "seascape": key_seascape, "ice": key_ice, "sky": key_sky}


def fill_small_holes(mask, limit=4000):
    """Fill enclosed gaps, but only small ones.

    Filling every hole is wrong here: on the battleship the sky between the hull
    and the superstructure is enclosed by the ship's own outline, and filling it
    pasted a strip of cloud and a mountain range into the sprite. A porthole is a
    few hundred pixels; a sky is tens of thousands.
    """
    holes = ndimage.binary_fill_holes(mask) & ~mask
    lab, n = ndimage.label(holes)
    if n == 0:
        return mask
    sizes = ndimage.sum(holes, lab, range(1, n + 1))
    keep = np.zeros(n + 1, dtype=bool)
    keep[1:] = sizes <= limit
    return mask | keep[lab]


def biggest_blob(mask):
    lab, n = ndimage.label(mask)
    if n == 0:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    return lab == (int(np.argmax(sizes)) + 1)


def extract(name, filename, key, width, sever=3, erase=()):
    """`sever` is how hard to prise the subject off whatever the key left behind.

    The tanker sails into a sunset, and sunlit water is warm rather than blue, so
    a patch of sea survives the key and touches the bow. A wider opening breaks
    that thin bridge and the largest-blob step then discards it.
    """
    im = Image.open(f"{SRC}/{filename}").convert("RGB")
    rgb = np.asarray(im)
    mask = KEYS[key](rgb)
    h0, w0 = mask.shape
    for x0f, y0f, x1f, y1f in erase:
        mask[round(y0f * h0) : round(y1f * h0), round(x0f * w0) : round(x1f * w0)] = False

    # Close small gaps first, so rigging and railings join the hull rather than
    # being discarded as separate specks. Gently: a wide closing on the
    # battleship reached across the horizon and swallowed the sky and a range of
    # mountains along with it.
    mask = ndimage.binary_closing(mask, structure=np.ones((4, 4)))
    mask = biggest_blob(mask)
    mask = fill_small_holes(mask)
    mask = ndimage.binary_opening(mask, structure=np.ones((sever, sever)))
    mask = biggest_blob(mask)

    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        raise SystemExit(f"{name}: keyed out to nothing")
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1

    out = np.zeros((rgb.shape[0], rgb.shape[1], 4), dtype=np.uint8)
    out[..., :3] = rgb
    out[..., 3] = mask.astype(np.uint8) * 255
    sprite = Image.fromarray(out[y0:y1, x0:x1])

    # Feather: blur the alpha alone, so the edge softens without haloing the
    # colour into the sea.
    a = sprite.getchannel("A").filter(ImageFilter.GaussianBlur(0.8))
    sprite.putalpha(a)

    h = max(1, round(sprite.height * width / sprite.width))
    sprite = sprite.resize((width, h), Image.LANCZOS)
    sprite.save(f"{OUT}/ship_{name}.png")
    frac = mask.sum() / mask.size
    print(f"{name:11s} {sprite.width}x{sprite.height}  kept {frac * 100:.1f}% of the picture")


for s in SHIPS:
    extract(*s)
