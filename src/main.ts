import { Game } from "./game/game";
import { drawStyleSheet } from "./render/sheet";
import { GameMap } from "./sim/map";
import { findPath } from "./sim/pathfinding";
import { UNITS } from "./data/units";
import { BUILDINGS } from "./data/buildings";
import { Tile } from "./sim/types";

const canvas = document.getElementById("game") as HTMLCanvasElement;

if (location.search.includes("sheet")) {
  // Art review mode: ?sheet renders the building style contact sheet instead of the game.
  document.body.style.overflow = "auto";
  canvas.style.width = "auto";
  canvas.style.height = "auto";
  canvas.style.cursor = "default";
  let t = 0;
  const loop = () => {
    drawStyleSheet(canvas, "#3b82f6", t++);
    requestAnimationFrame(loop);
  };
  loop();
} else {
  const game = new Game(canvas);
  // Exposed for debugging and headless tests.
  (window as unknown as { game: Game }).game = game;
}
(window as unknown as { drawStyleSheet: typeof drawStyleSheet }).drawStyleSheet = drawStyleSheet;

// Sim internals, for the headless tools and tests. Nothing in the game reads
// these; they exist so a script can generate and grade a map without booting a
// whole match around it.
// Tile is a const enum, so it cannot be handed over as a value -- spell out the
// few members a tool needs instead.
(window as unknown as { rts: unknown }).rts = {
  GameMap,
  findPath,
  Tile: { Grass: Tile.Grass, Dirt: Tile.Dirt, Water: Tile.Water, Tree: Tile.Tree, Gold: Tile.Gold, Rock: Tile.Rock, Ice: Tile.Ice },
  UNITS,
  BUILDINGS,
};
