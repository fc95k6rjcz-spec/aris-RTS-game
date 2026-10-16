"""
Cut the Archer's three views from the right-hand column of his character sheet
("human_archer.png" in the Desktop folder "Ari's fun game").

    python tools/extract_archer.py path/to/human_archer.png

The column's backdrop is mottled grey with red and black smears, and his
trousers and boots are nearly the same tone, so colour keying either fades his
legs out or keeps the smears. This uses GrabCut instead, seeded with what is
surely him (the blue tunic, its pale trim, brown leather within his columns)
and what is surely backdrop (the box margin, grey unsaturated tones, the dark
ground shadow at his feet). Red smears that survive are dropped by colour.
"""
import sys, numpy as np, cv2
from PIL import Image, ImageFilter
SRC = sys.argv[1] if len(sys.argv) > 1 else "human_archer.png"
OUT = sys.argv[2] if len(sys.argv) > 2 else "src/assets"
COL = (940, 1254)
PANELS = {"front": (0, 400), "back": (400, 802), "side": (802, 1254)}
OUT_H = 180
im = cv2.imread(SRC)
for name, (y0, y1) in PANELS.items():
    cell = im[y0:y1, COL[0]:COL[1]].copy()
    h, w = cell.shape[:2]
    mask = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    # Sure background: a margin round the box and the noisy right-hand strip.
    mask[:4, :] = cv2.GC_BGD; mask[-3:, :] = cv2.GC_BGD; mask[:, :4] = cv2.GC_BGD; mask[:, -40:] = cv2.GC_BGD
    # Probable figure: the middle band where the archer stands.
    mask[10:h-6, 30:w-70] = cv2.GC_PR_FGD
    # Sure figure: his tunic (saturated blue) and the core of his body.
    hsv = cv2.cvtColor(cell, cv2.COLOR_BGR2HSV)
    blue = (hsv[..., 0] > 100) & (hsv[..., 0] < 130) & (hsv[..., 1] > 110) & (hsv[..., 2] > 70)
    mask[blue] = cv2.GC_FGD
    H, S, V = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
    # Leather: boots, trousers, bracers, quiver. Warm brown, moderately saturated.
    leather = (H >= 5) & (H <= 22) & (S > 90) & (V > 45)
    # Only below the hood line and within the figure's columns, so warm
    # smears in the backdrop are not mistaken for him.
    cols = np.where(blue.any(axis=0))[0]
    if len(cols):
        cx0, cx1 = max(0, cols.min() - 12), min(w, cols.max() + 12)
        band = np.zeros_like(blue); band[:, cx0:cx1] = True
        mask[leather & band] = cv2.GC_FGD
    # The backdrop: grey, unsaturated, mid-tone. Sure background.
    grey = (S < 40) & (V > 45) & (V < 175)
    # ...except the pale trim sewn round his tunic, which sits right on the blue.
    from scipy import ndimage as _nd
    trim = _nd.binary_dilation(blue, iterations=4) & (S < 60) & (V > 110)
    mask[grey & ~trim & (mask != cv2.GC_FGD)] = cv2.GC_BGD
    mask[trim] = cv2.GC_FGD
    # The painted ground shadow round his feet: dark and colourless, low down.
    rows = np.arange(h)[:, None] > h * 0.78
    shadow = (V < 75) & (S < 80) & rows
    mask[shadow] = cv2.GC_BGD
    bgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(cell, mask, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
    fg = np.isin(mask, (cv2.GC_FGD, cv2.GC_PR_FGD))
    # Keep the figure and pieces touching it closely (the bow), drop red smears.
    from scipy import ndimage
    fg = ndimage.binary_opening(fg, np.ones((2, 2)))
    # Fill only pinholes: filling every hole closed the gap between bow and string.
    holes = ndimage.binary_fill_holes(fg) & ~fg
    hl, hn = ndimage.label(holes)
    if hn:
        hs = ndimage.sum(holes, hl, range(1, hn + 1))
        for i, a in enumerate(hs):
            if a < 40: fg |= hl == i + 1
    lab, n = ndimage.label(fg, np.ones((3, 3)))
    if n:
        sizes = ndimage.sum(fg, lab, range(1, n + 1)); main = int(np.argmax(sizes)) + 1
        near = ndimage.binary_dilation(lab == main, iterations=6); keep = lab == main
        rgb = cell[..., ::-1].astype(int)
        for i, a in enumerate(sizes):
            piece = lab == i + 1
            if i + 1 == main or a < 60 or not (near & piece).any(): continue
            m = rgb[piece].mean(axis=0)
            if m[0] - m[1] > 40 and m[0] - m[2] > 40: continue
            keep |= piece
        fg = keep
    alpha = (fg * 255).astype(np.uint8)
    rgba = np.dstack([cell[..., ::-1], alpha])
    img = Image.fromarray(rgba, "RGBA")
    img.putalpha(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.7)))
    ys, xs = np.where(alpha > 20)
    edge = dict(left=xs.min() <= 5, right=xs.max() >= w - 41, top=ys.min() <= 4, bottom=ys.max() >= h - 4)
    img = img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    img = img.resize((max(1, round(img.width * OUT_H / img.height)), OUT_H), Image.LANCZOS)
    img.save(f"{OUT}/archer_{name}.png", optimize=True)
    print(name, img.size, "touches box edge:", [k for k, v in edge.items() if v] or "none")

