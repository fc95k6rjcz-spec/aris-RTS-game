/**
 * The front screen.
 *
 * What was here was a dark rectangle with three grey boxes on it, drawn over a
 * dimmed copy of the game behind. This is the first thing anybody sees, and it
 * was saying "unfinished tech demo" before a single unit moved.
 *
 * The rebuild is built around one idea: give the painting the whole screen, and
 * put the words in a column down the left where a painted sky usually has
 * nothing in it. Everything else follows from that -- a scrim that fades from
 * solid at the left edge to nothing by the middle, so the type always has
 * something to sit on whatever the picture turns out to be; a rule under the
 * title; one obvious primary action; and the settings as quiet pills beneath it
 * rather than five more boxes competing with the button.
 *
 * It works with no painting at all: without one it draws a dusk gradient and a
 * horizon, which is plain but composed. Drop `src/assets/menu.jpg` in and the
 * layout does not change -- the picture simply arrives behind it.
 */

import type { Difficulty } from "../ai/skirmish";
import { menuArt } from "../render/sprites";

export interface FrontButton {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  blurb: string;
}

export interface FrontChoice {
  x: number;
  y: number;
  w: number;
  h: number;
  value: Difficulty;
  label: string;
}

export interface FrontScreen {
  start: FrontButton[];
  choices: FrontChoice[];
}

const OPTS: Array<[Difficulty, string]> = [
  ["easy", "Easy"],
  ["normal", "Normal"],
  ["hard", "Hard"],
  ["peaceful", "Peaceful"],
  ["none", "Sandbox"],
];

const BLURB: Record<Difficulty, string> = {
  easy: "A neighbour who dithers. Room to learn the board.",
  normal: "An opponent who develops, masses, and comes for you.",
  hard: "Impatient and aggressive. It will not wait for you.",
  peaceful: "It builds its own country and never marches on yours.",
  none: "Nobody else at all. The map, and time to use it.",
};

/** Cover-fit a picture to the screen, cropping rather than squashing it. */
function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, iw: number, ih: number, W: number, H: number): void {
  const scale = Math.max(W / iw, H / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

export function drawFrontScreen(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  mouse: { x: number; y: number },
  difficulty: Difficulty,
): FrontScreen {
  ctx.save();

  // ── the picture, or a composed substitute for it ──
  const art = menuArt();
  if (art) {
    drawCover(ctx, art, art.naturalWidth, art.naturalHeight, W, H);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#141d2b");
    sky.addColorStop(0.55, "#26313c");
    sky.addColorStop(0.56, "#1d2a22");
    sky.addColorStop(1, "#0e150f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // A low sun, so the empty version still has somewhere for the eye to go.
    const glow = ctx.createRadialGradient(W * 0.72, H * 0.5, 0, W * 0.72, H * 0.5, H * 0.55);
    glow.addColorStop(0, "rgba(255,196,120,0.35)");
    glow.addColorStop(1, "rgba(255,196,120,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  // ── scrim: solid at the left, gone by the middle ──
  const scrim = ctx.createLinearGradient(0, 0, W * 0.62, 0);
  scrim.addColorStop(0, "rgba(8,10,14,0.92)");
  scrim.addColorStop(0.55, "rgba(8,10,14,0.72)");
  scrim.addColorStop(1, "rgba(8,10,14,0)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);
  // And a touch of dark at the very bottom, to seat the footer line.
  const foot = ctx.createLinearGradient(0, H - 90, 0, H);
  foot.addColorStop(0, "rgba(6,8,11,0)");
  foot.addColorStop(1, "rgba(6,8,11,0.85)");
  ctx.fillStyle = foot;
  ctx.fillRect(0, H - 90, W, 90);

  // ── the column of words ──
  const x = Math.max(48, Math.min(96, W * 0.07));
  const colW = Math.min(420, W * 0.44);
  let y = Math.max(70, H * 0.17);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f2e7cf";
  const titleSize = Math.round(Math.min(64, Math.max(38, H * 0.085)));
  ctx.font = `bold ${titleSize}px Georgia, 'Times New Roman', serif`;
  ctx.fillText("OpenRTS", x, y);
  y += 14;
  ctx.fillStyle = "rgba(210,176,106,0.85)";
  ctx.fillRect(x, y, 96, 2);
  y += 30;
  ctx.fillStyle = "#c2cbd2";
  ctx.font = "16px Georgia, serif";
  ctx.fillText("One man, one weapon in the dark,", x, y);
  y += 23;
  ctx.fillText("and whatever he can hold.", x, y);

  // ── the one thing to press ──
  y += 46;
  const bw = Math.min(300, colW);
  const bh = 62;
  const start: FrontButton = { x, y, w: bw, h: bh, label: "Begin", blurb: "" };
  const hot = mouse.x >= x && mouse.x < x + bw && mouse.y >= y && mouse.y < y + bh;
  const face = ctx.createLinearGradient(x, y, x, y + bh);
  face.addColorStop(0, hot ? "rgba(74,60,30,0.96)" : "rgba(34,40,48,0.92)");
  face.addColorStop(1, hot ? "rgba(52,40,18,0.96)" : "rgba(22,27,33,0.92)");
  ctx.fillStyle = face;
  ctx.fillRect(x, y, bw, bh);
  ctx.strokeStyle = hot ? "#e6c165" : "rgba(210,176,106,0.55)";
  ctx.lineWidth = hot ? 2 : 1;
  ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
  ctx.fillStyle = hot ? "#ffe9b0" : "#e8dcc4";
  ctx.font = "600 24px Georgia, serif";
  ctx.textBaseline = "middle";
  ctx.fillText("Begin", x + 22, y + bh / 2);
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillStyle = hot ? "rgba(255,233,176,0.75)" : "#8e9aa5";
  ctx.textAlign = "right";
  ctx.fillText("Enter", x + bw - 20, y + bh / 2 + 1);
  ctx.textAlign = "left";

  // ── the opponent, as pills ──
  y += bh + 34;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#8e9aa5";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText("OPPONENT", x, y);
  y += 12;

  const pillH = 30;
  const gap = 8;
  const choices: FrontChoice[] = [];
  let cx = x;
  let cy = y;
  ctx.font = "600 13px system-ui, sans-serif";
  for (const [value, label] of OPTS) {
    const pw = Math.round(ctx.measureText(label).width) + 26;
    if (cx + pw > x + colW + 40) {
      cx = x;
      cy += pillH + gap;
    }
    choices.push({ x: cx, y: cy, w: pw, h: pillH, value, label });
    cx += pw + gap;
  }
  for (const c of choices) {
    const on = c.value === difficulty;
    const over = mouse.x >= c.x && mouse.x < c.x + c.w && mouse.y >= c.y && mouse.y < c.y + c.h;
    ctx.fillStyle = on ? "rgba(210,176,106,0.9)" : over ? "rgba(60,70,82,0.9)" : "rgba(26,32,39,0.85)";
    ctx.beginPath();
    ctx.roundRect(c.x, c.y, c.w, c.h, pillH / 2);
    ctx.fill();
    ctx.strokeStyle = on ? "#f0d79a" : "rgba(140,155,170,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = on ? "#241c08" : "#c6d0d8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(c.label, c.x + c.w / 2, c.y + pillH / 2 + 0.5);
  }

  // One line about whichever is chosen, rather than a paragraph about all five.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#9fb0bb";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(BLURB[difficulty], x, cy + pillH + 26);

  // ── footer ──
  ctx.fillStyle = "rgba(190,205,215,0.55)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("Right-click to order · A then click to attack-move · Space to pause · gear, top right, for settings", x, H - 26);

  ctx.restore();
  return { start: [start], choices };
}
