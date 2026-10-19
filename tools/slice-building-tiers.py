"""Crop and encode ten alpha-preserving sprites from each generated 5 x 2 sheet.
Requires Pillow and NumPy. Run from the project with source sheets in docs/building-tiers.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'docs/building-tiers/generated-sheets.json').read_text())
out = root / 'src/assets/blue-banner-tiers'
for name, source in manifest.items():
    image = Image.open(root / source).convert('RGBA')
    folder = out / name
    folder.mkdir(parents=True, exist_ok=True)
    for tier in range(10):
        x, y = tier % 5, tier // 5
        split = round(image.height * (.475 if name == "tower" else .5))
        bounds = (round(x*image.width/5), 0 if y == 0 else split,
                  round((x+1)*image.width/5), split if y == 0 else image.height)
        cell = image.crop(bounds)
        mask = cell.getchannel('A').point(lambda a: 255 if a > 12 else 0).filter(ImageFilter.MaxFilter(5))
        values = np.asarray(mask)
        row = int(np.argmax((values > 0).sum(axis=1)))
        xs = np.flatnonzero(values[row] > 0)
        if not len(xs):
            raise ValueError(f'{name} tier {tier+1} is empty')
        # Find the main connected sprite rather than stray fragments from adjacent cells.
        splits = np.split(xs, np.where(np.diff(xs) > 1)[0] + 1)
        run = max(splits, key=len)
        ImageDraw.floodfill(mask, (int(run[len(run)//2]), row), 128)
        main = np.asarray(mask) == 128
        yy, xx = np.where(main)
        bbox = (int(xx.min()), int(yy.min()), int(xx.max())+1, int(yy.max())+1) if len(xx) else None
        if bbox is None:
            raise ValueError(f'{name} tier {tier+1} has no sprite')
        # Trim empty padding only; keep the generated art and its transparency.
        cell = cell.crop(bbox)
        cell.thumbnail((384, 384), Image.Resampling.LANCZOS)
        cell.save(folder / f'level-{tier+1}.webp', quality=88, method=2)
    print(f'{name}: 10 tiers extracted')

