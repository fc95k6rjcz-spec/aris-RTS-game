import { BUILDINGS, BUILD_MENU } from "../data/buildings";
import type { ArtCtx } from "./buildingArt";
import { STYLED_BUILDINGS, STYLES } from "./buildingStyles";

/** Contact sheet: 5 styles (rows) × 4 buildings (columns) for picking a look per building. */
export function drawStyleSheet(canvas: HTMLCanvasElement, color = "#3b82f6", tick = 0): void {
  const cell = 200;
  const pad = 24;
  const labelW = 170;
  const headH = 56;
  canvas.width = labelW + BUILD_MENU.length * (cell + pad) + pad;
  canvas.height = headH + STYLES.length * (cell + pad) + pad;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#4f7d3a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Subtle grass checker.
  for (let y = 0; y < canvas.height; y += 32)
    for (let x = 0; x < canvas.width; x += 32)
      if (((x + y) / 32) % 2 === 0) {
        ctx.fillStyle = "rgba(0,0,0,0.05)";
        ctx.fillRect(x, y, 32, 32);
      }
  ctx.fillStyle = "rgba(10,12,16,0.9)";
  ctx.fillRect(0, 0, canvas.width, headH);
  ctx.fillRect(0, 0, labelW, canvas.height);
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e8eef2";
  ctx.font = "bold 18px system-ui, sans-serif";
  BUILD_MENU.forEach((id, i) => ctx.fillText(BUILDINGS[id]!.name, labelW + pad + i * (cell + pad) + 8, headH / 2));
  STYLES.forEach((st, r) => {
    const y = headH + pad + r * (cell + pad);
    ctx.fillStyle = "#e8eef2";
    ctx.font = "bold 26px Georgia, serif";
    ctx.fillText(st.id, 16, y + cell / 2 - 14);
    ctx.fillStyle = "#9fb0bb";
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText(st.name, 16, y + cell / 2 + 14);
    BUILD_MENU.forEach((id, cI) => {
      const x = labelW + pad + cI * (cell + pad);
      // Draw at the building's relative footprint so a Town Hall reads bigger than a mill.
      const size = BUILDINGS[id]!.size;
      const w = cell * (0.6 + size * 0.1);
      const ox = x + (cell - w) / 2;
      const oy = y + (cell - w) / 2 + 8;
      const a: ArtCtx = { ctx, faction: "human", def: id, x: ox, y: oy, w, color, progress: 1, tick };
      STYLED_BUILDINGS[id]!(a, st);
    });
  });
}
