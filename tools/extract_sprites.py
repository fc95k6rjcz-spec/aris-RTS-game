"""Cut the peasant concept sheet into transparent sprites (front + back per type)."""
from PIL import Image, ImageFilter
import numpy as np
from collections import deque
import sys

src = Image.open(sys.argv[1]).convert("RGB")
W, H = src.size
cols, rows = 3, 2
pw, ph = W // cols, H // rows
names = ["classic", "villager", "farmhand", "woodcutter", "builder", "cartpusher"]

def key_bg(panel):
    """Flood-fill the background from the panel border; returns alpha mask."""
    a = np.asarray(panel).astype(np.int16)
    h, w, _ = a.shape
    # background is a flat dark grey; sample from corners
    ref = np.median(np.concatenate([a[5:40, 5:40].reshape(-1,3), a[-40:-5, -40:-5].reshape(-1,3)]), axis=0)
    diff = np.abs(a - ref).sum(axis=2)
    bg_like = (np.abs(a - ref).max(axis=2) < 12)
    mask = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h-1):
            if bg_like[y, x] and not mask[y, x]: mask[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w-1):
            if bg_like[y, x] and not mask[y, x]: mask[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y+1,x),(y-1,x),(y,x+1),(y,x-1)):
            if 0 <= ny < h and 0 <= nx < w and bg_like[ny, nx] and not mask[ny, nx]:
                mask[ny, nx] = True; q.append((ny, nx))
    alpha = (~mask).astype(np.uint8) * 255
    return alpha

def components(alpha):
    """Connected components of opaque pixels -> list of bboxes sorted by area desc."""
    h, w = alpha.shape
    seen = np.zeros_like(alpha, bool)
    out = []
    for y in range(h):
        for x in range(w):
            if alpha[y, x] and not seen[y, x]:
                q = deque([(y, x)]); seen[y, x] = True
                minx=maxx=x; miny=maxy=y; n=0
                while q:
                    cy, cx = q.popleft(); n += 1
                    minx=min(minx,cx); maxx=max(maxx,cx); miny=min(miny,cy); maxy=max(maxy,cy)
                    for ny, nx in ((cy+1,cx),(cy-1,cx),(cy,cx+1),(cy,cx-1),(cy+1,cx+1),(cy-1,cx-1),(cy+1,cx-1),(cy-1,cx+1)):
                        if 0 <= ny < h and 0 <= nx < w and alpha[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; q.append((ny, nx))
                out.append((n, minx, miny, maxx, maxy))
    out.sort(reverse=True)
    return out

for i, name in enumerate(names):
    px, py = (i % cols) * pw, (i // cols) * ph
    panel = src.crop((px, py + 80, px + pw, py + ph))  # skip the caption strip
    alpha = key_bg(panel)
    # blur the alpha edge slightly to avoid jaggies
    rgba = panel.convert("RGBA"); rgba.putalpha(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.6)))
    comps = components(alpha)
    # largest = front figure (with tool); next large component to its right, upper = back view
    n, x0, y0, x1, y1 = comps[0]
    front = rgba.crop((x0-2, y0-2, x1+3, y1+3))
    back = None
    for c in comps[1:]:
        cn, bx0, by0, bx1, by1 = c
        if bx0 > x1 - 20 and by1 < panel.height * 0.7 and cn > 3000:
            back = rgba.crop((bx0-2, by0-2, bx1+3, by1+3)); break
    for tag, im in (("front", front), ("back", back)):
        if im is None: print("no back view for", name); continue
        # normalise to 256px tall
        s = 256 / im.height
        im = im.resize((max(1, round(im.width * s)), 256), Image.LANCZOS)
        im.save(f"src/assets/peasant_{name}_{tag}.png", optimize=True)
        print(name, tag, im.size)
