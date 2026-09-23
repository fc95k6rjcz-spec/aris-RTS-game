# Orc building sheets

The originals live in `Desktop\Ari's fun game` (too big to keep in git).
Each was cut into `src/assets/orc_<building>_<1..10>.png` with
`tools/extract_dark_progression.py SHEET OUT_PREFIX TOP1 CUT1 TOP2 CUT2`:

| Sheet | Game building | Command |
| --- | --- | --- |
| orc_shadow_hut.png | townhall (Shadow Hut) | `orc_townhall 55 391 514 855` |
| orc_barracks.png | barracks (War Camp) | `orc_barracks 55 402 530 845` |
| orc_blacksmith.png | foundry (Blacksmith) | `orc_foundry 55 406 530 846` |
| orc_lumber_mill.png | lumbermill (Lumber Camp) | `orc_lumbermill 122 400 526 855` |
| orc_stables.png | stables (Beast Pen) | `orc_stables 102 405 526 845` |
| orc_flight.png | gryphonaviary (Wind Rider Roost) | `orc_gryphonaviary 102 400 526 858` |
| orc_workshop.png | airfactory (Orc Workshop) | `orc_airfactory 102 395 526 835` |
| orc_farm.png | farm (Pig Farm) | `tools/extract_orc_farm.py orc_farm.png` |
| orc_shadow_sphere.png | magetower (Spirit Spire) | `orc_magetower 102 400 526 855` |

Not used yet: orc_great_hall, orc_stronghold, orc_farm_upgrades
(a second farm sheet), orc_victory_sign, orc_defeat_sign.
