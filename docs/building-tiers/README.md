# Approved royal building artwork

The 19 approved building sheets are installed as 190 transparent in-game sprites. The Town Hall uses the revised broad civic hall, and the Watch Tower uses the approved reference progression.

- Source sheets: `sheets/<building>.png`.
- Game artwork: `../../src/assets/blue-banner-tiers/<building>/level-1.webp` through `level-10.webp`.
- Renderer: `../../src/render/blueBanner.ts` and `redesign.ts`.
- Gallery: `/building-upgrades.html` on the deployed game.
- Extraction: `python tools/slice-building-tiers.py` (Pillow and NumPy).
- Validation: `node test/buildingUpgradeTiers.mjs` and `node test/royalBuildingTiersBrowser.mjs` after `npm run build:web`.

The artwork was generated with built-in ImageGen, using the approved blue-roofed Watch Tower sheet as a style reference. The prompt set requested ten isolated architectural tiers in a five-column, two-row transparent atlas for each building, with a consistent isometric camera, warm timber, pale masonry, royal-blue roofs and banners, iron fittings and gold accents. Each building retains its function-specific equipment and shape; the revised Town Hall explicitly uses a broad enclosed meeting hall and palace rather than a tower or workshop.

Ordinary buildings retain timed upgrades. Walls and gates retain their shared fortification research and connected rendering; their approved masonry is mapped onto the connected wall faces instead of repeating standalone wall portraits. Team colours affect blue roofs and banners while preserving stone, wood and gold.
