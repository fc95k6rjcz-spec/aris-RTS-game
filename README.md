# OpenRTS

A Warcraft-style real-time strategy game in TypeScript + Canvas. Single-player first; the
simulation is deterministic and command-driven so lockstep multiplayer can be added later
without rewriting gameplay.

## Run

```
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/index.html — a single self-contained file, host it anywhere
node test/playtest.mjs   # headless end-to-end playtest (needs the build)
```

## Controls

| Action | Input |
| --- | --- |
| Select | Left click / drag box (Shift adds) |
| Order | Right click: move · gather (on trees/gold) · repair (own building) |
| Build | Select a Worker → command card or hotkey: Town Hall **H**, Lumber Mill **L**, Barracks **B**, Shipyard **S** (shoreline only), Church **C**, Watch Tower **T**, Farm **Z**, Gold Depot **G**, Foundry **F**, Stables **E**, Mage Tower **M**, Oil Rig **O**, Refinery **R**, Aeroplane Factory **P**. Shift-click to keep placing. |
| Train | Select a building → command card / hotkey. Right-click the map to set a rally point. |
| Upgrade | Select any building → **U** (ten tiers each) |
| Attack | Right-click an enemy, or **A** then click for attack-move |
| Research | Select the host building → its upgrade buttons. Barding (Knights) at the Lumber Mill; Sharpened Blades and Fletching at the Barracks. |
| Cancel | Esc (build mode, or an unfinished building for a 75% refund); click a queued item |
| Camera | Arrow keys / WASD / edge scroll · wheel zoom · click minimap (bottom right) |

## Architecture

```
src/
  sim/        Deterministic simulation. No DOM, no Math.random, integer positions.
    world.ts    World state + step(commands): the only mutation entry point
    commands.ts Serialisable command union (what will go over the wire later)
    map.ts      Tile grid, occupancy, resource amounts, procedural generation
    pathfinding.ts  A* with land/sea domains
    entities.ts Unit / Building records and task state machines
  data/       Content tables — buildings, units, tier tables and unit upgrades.
              All tuning lives here, including which building researches what.
  render/     Canvas 2D renderer + camera. terrain.ts bakes the ground; painted
              sprites for buildings, trees, mines and workers, procedural art
              for the rest.
  ui/         HUD layout and drawing (command card, selection panel, minimap)
  ai/         Skirmish AI. Issues Commands only — it never touches sim state.
  game/       Client orchestration: input → commands → fixed 20 Hz tick → render
tools/        Sprite extraction from the painted progression sheets
test/         Playwright headless playtest and screenshot gallery
```

Key rule: **nothing outside `sim/` mutates sim state except by issuing a `Command`**.
The client queues commands and applies them on the next tick, exactly as a lockstep
session would. `World.step()` given the same seed and command stream must produce
identical state on every machine.

## Milestones

0. **Art** — painted sprites live in `src/assets`, cut from concept sheets by the
   scripts in `tools/`. All fourteen buildings have ten painted tiers; peasants have six task variants.
   Blue cloth is re-hued at runtime to the owning player's colour (`render/sprites.ts`).

1. **Buildings (this)** — placement + validation, construction with builders, costs and
   refunds, training queues, rally points, supply. Town Hall, Lumber Mill, Barracks,
   Shipyard, Church, Watch Tower, Foundry, Stables, Oil Rig, Refinery, Aeroplane
   Factory, Mage Tower; Worker, Footman, Archer, Knight, Mage, Longboat, Scout
   Plane, Bomber. Gold, lumber and oil economy — oil is pumped by shoreline rigs, multiplied by a
   refinery, and spent on aircraft. Land, sea, air and amphibious pathing — Peasants swim (slowly, and pathfinding
   prices water so they only swim when going round is worse), aircraft ignore
   terrain entirely. One rich gold seam is buried somewhere far from both bases
   and stays invisible until a unit walks near it.
   All fourteen buildings upgrade through ten tiers (`data/levels.ts`): hall tiers raise
   HP and supply, mill tiers raise the lumber delivered per trip, Barracks and
   Shipyard tiers train faster, Church tiers heal harder and further, and Watch
   Tower tiers see further, and Aeroplane Factory tiers assemble aircraft faster.
   Foundry tiers armour the whole army, Oil Rig tiers pump more crude, Refinery
   tiers multiply that output, Stables tiers turn out cavalry faster, Mage Tower tiers raise spell power, and Farm tiers raise the supply ceiling. Every
   tier is its own painted sprite.
2. ~~Combat~~ **done** — damage, armour, death, projectiles, auto-acquire,
   attack-move, unit separation, and a victory condition. Still to come: towers
   that actually shoot, and fog of war.
3. ~~Skirmish AI~~ **first pass done** (`src/ai/skirmish.ts`) — gathers, follows a
   build order, keeps supply ahead, trains an army and attacks in waves, all
   through the same command queue a human uses. Still to come: reacting to what it
   scouts, expanding to a second mine, retreating when losing.
4. Content — Clans faction art & roster (Humans are done), more buildings, upgrades, tech tree.
5. Multiplayer — lobby (Supabase), lockstep over WebRTC, replay/desync detection built on
   the existing command stream. Requires a state-hash test first (see review notes).
