"""
Cut the three orthographic views off the Footman character sheet.

Two jobs beyond the usual keying:

  * The backdrop is a grey gradient, not a flat colour, so it is keyed by distance
    from the local backdrop tone rather than a fixed value, and small holes are
    closed so dark armour inside the figure is not punched out.
  * The shield carries a lion crest. That is a recognisable brand emblem, so the
    gold inside the shield's blue field is replaced with the field's own blue,
    leaving a plain shield the renderer can tint to the player's colour. The gold
    rim survives because it borders the background, not the blue.
"""
from PIL import Image, ImageFilter
from scipy import ndimage
import numpy as np

SRC = "/root/.claude/uploads/c924b6f0-4b5e-51e7-8fe9-f91c13054c13/912b884e-image.png"
VIEWS = {"front": (470, 86, 665, 445), "side": (715, 86, 885, 445), "back": (910, 86, 1065, 445)}
OUT_H = 180

im = Image.open(SRC).convert("RGB")
whole = np.asarray(im).astype(np.int16)
ref = np.median(whole[80:440, 460:1100].reshape(-1, 3), axis=0)


# Where the shield sits in each finished sprite, as a fraction of its width and
# height. Only the front view shows the shield face; the side view shows its edge
# and the back view hides it behind the figure.
CREST_REGION = {"front": (0.68, 0.28, 1.00, 0.76)}


def strip_crest(img, name):
    """
    Blank the crest on the shield face.

    Rather than trying to recognise the emblem's colour — it is painted in shadow
    and reads darker than the shield's own gold rim, so no colour test separates
    them — this works geometrically: inside the shield region, anything that is
    not the blue field, and is not close to the field's edge, is the emblem. The
    rim survives because it borders the outside.
    """
    region = CREST_REGION.get(name)
    if region is None:
        return img
    a = np.array(img).astype(int)
    h, w = a.shape[:2]
    x0, y0, x1, y1 = (int(region[0] * w), int(region[1] * h), int(region[2] * w), int(region[3] * h))
    patch = a[y0:y1, x0:x1]
    if patch.size == 0:
        return img
    r, g, b = patch[..., 0], patch[..., 1], patch[..., 2]
    blue = (b > r + 25) & (b > 55) & (patch[..., 3] > 60)
    if blue.sum() < 40:
        return img
    solid = ndimage.binary_fill_holes(blue)
    interior = ndimage.binary_erosion(solid, iterations=4)
    target = interior & ~blue
    if not target.any():
        return img
    patch[..., :3][target] = np.median(patch[..., :3][blue], axis=0)
    a[y0:y1, x0:x1] = patch
    out = Image.fromarray(a.astype(np.uint8))
    # Soften the repaint so it reads as cloth rather than a flat sticker.
    blurred = out.filter(ImageFilter.GaussianBlur(1.1))
    mask = np.zeros((h, w), np.uint8)
    mask[y0:y1, x0:x1][target] = 255
    out.paste(blurred, (0, 0), Image.fromarray(mask))
    return out


for name, box in VIEWS.items():
    cell = im.crop(box)
    a = np.asarray(cell).astype(np.int16)

    fg = np.abs(a - ref).max(axis=2) > 26
    # Close pinholes where dark armour matches the backdrop, then drop specks.
    fg = ndimage.binary_closing(fg, np.ones((5, 5)))
    fg = ndimage.binary_fill_holes(fg)
    lab, n = ndimage.label(fg, np.ones((3, 3)))
    if n:
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        fg = lab == int(np.argmax(sizes)) + 1

    alpha = (fg.astype(np.uint8)) * 255
    img = Image.fromarray(np.dstack([a.astype(np.uint8), alpha]))
    img.putalpha(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.6)))
    ys, xs = np.where(alpha > 20)
    img = img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    img = img.resize((max(1, round(img.width * OUT_H / img.height)), OUT_H), Image.LANCZOS)
    img = strip_crest(img, name)
    img.save(f"src/assets/footman_{name}.png", optimize=True)   # RGBA, not palette
    print(f"footman_{name}", img.size)

sp = [Image.open(f"src/assets/footman_{n}.png").convert("RGBA") for n in VIEWS]
prev = Image.new("RGBA", (sum(s.width for s in sp) + 60, OUT_H + 20), (79, 125, 58, 255))
x = 15
for s in sp:
    prev.alpha_composite(s, (x, 10))
    x += s.width + 15
prev.save("test/footman-check.png")
