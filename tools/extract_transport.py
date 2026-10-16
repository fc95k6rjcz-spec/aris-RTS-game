"""
Cut the Transport (a landing ship with trucks on deck) out of its seascape.

    python tools/extract_transport.py 180 src/assets/ship_transport.png path/to/human_transport.png

Its hull is blue-grey, close to the sea, so the colour keys in extract_ships.py
take most of it away. GrabCut instead, seeded with where the ship sits (a
polygon in fractions of the picture) and the parts that are surely ship. The
white wake below the hull is dropped by brightness.
"""
import numpy as np, cv2, sys
from PIL import Image, ImageFilter
from scipy import ndimage
SRC = sys.argv[3] if len(sys.argv) > 3 else "human_transport.png"  # Desktop folder "Ari's fun game"
im = cv2.imread(SRC); h, w = im.shape[:2]
mask = np.full((h, w), cv2.GC_BGD, np.uint8)
# Probable ship: the polygon the hull and superstructure occupy (fractions of the picture).
poly = np.array([[0.02,0.36],[0.06,0.20],[0.12,0.18],[0.17,0.02],[0.22,0.02],[0.31,0.32],[0.84,0.40],[0.88,0.14],[0.89,0.40],[0.98,0.47],[0.96,0.56],[0.80,0.88],[0.70,0.85],[0.30,0.70],[0.02,0.42]])
cv2.fillPoly(mask, [(poly * [w, h]).astype(np.int32)], cv2.GC_PR_FGD)
# Sure ship: the hull's flank, the deck and the superstructure core.
for x0,y0,x1,y1 in [(0.06,0.42,0.75,0.58),(0.40,0.40,0.70,0.43),(0.14,0.24,0.28,0.32),(0.78,0.50,0.92,0.70),(0.30,0.36,0.75,0.40)]:
    mask[int(y0*h):int(y1*h), int(x0*w):int(x1*w)] = cv2.GC_FGD
bgd = np.zeros((1,65)); fgd = np.zeros((1,65))
cv2.grabCut(im, mask, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
fg = np.isin(mask, (cv2.GC_FGD, cv2.GC_PR_FGD))
# Wake: bright white foam below the hull goes.
hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
foam = (hsv[...,2] > 200) & (hsv[...,1] < 40) & (np.arange(h)[:,None] > 0.62*h)
fg &= ~foam
lab, n = ndimage.label(fg); sizes = ndimage.sum(fg, lab, range(1, n+1)); fg = lab == int(np.argmax(sizes))+1
holes = ndimage.binary_fill_holes(fg) & ~fg; hl, hn = ndimage.label(holes)
for i, a in enumerate(ndimage.sum(holes, hl, range(1, hn+1)) if hn else []):
    if a < 3000: fg |= hl == i+1
ys, xs = np.nonzero(fg)
rgba = np.dstack([im[..., ::-1], (fg*255).astype(np.uint8)])
spr = Image.fromarray(rgba[ys.min():ys.max()+1, xs.min():xs.max()+1], "RGBA")
spr.putalpha(spr.getchannel("A").filter(ImageFilter.GaussianBlur(0.8)))
W = int(sys.argv[1]) if len(sys.argv) > 1 else 180
spr = spr.resize((W, round(spr.height * W / spr.width)), Image.LANCZOS)
spr.save(sys.argv[2] if len(sys.argv) > 2 else "src/assets/ship_transport.png")
print(spr.size)
