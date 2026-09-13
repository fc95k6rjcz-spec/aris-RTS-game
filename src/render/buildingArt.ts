/**
 * Procedural 3/4-view building art (Warcraft II style: top-down-ish with a visible
 * front wall). Each drawer paints into a square of side `w` pixels at (x, y).
 * All coordinates are fractions of `w` so buildings look right at any zoom.
 *
 * Structure shared by every building:
 *   - drop shadow to the lower-right
 *   - front wall (bottom ~35%) with material texture, door, windows
 *   - roof (top ~65%) with a light→dark gradient and ridge highlights
 *   - player-colour trim (banner, flag, awning) so ownership reads at a glance
 */

import { BUILDING_STYLE } from "../data/styleChoice";
import { STYLED_BUILDINGS, STYLES, STYLE_BY_ID } from "./buildingStyles";

export interface ArtCtx {
  ctx: CanvasRenderingContext2D;
  faction: string;
  def: string;
  x: number;
  y: number;
  w: number;
  color: string;
  /** 0..1 construction progress; 1 = complete. */
  progress: number;
  /** Game tick, for subtle animation (smoke, water). */
  tick: number;
}

type Drawer = (a: ArtCtx) => void;

// ───────────────────────────── helpers ─────────────────────────────

function shade(hex: string, amt: number): string {
  // amt: -1..1 darken/lighten
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  r = Math.round(r + (t - r) * p);
  g = Math.round(g + (t - g) * p);
  b = Math.round(b + (t - b) * p);
  return `rgb(${r},${g},${b})`;
}

function rect(a: ArtCtx, fx: number, fy: number, fw: number, fh: number, fill: string): void {
  a.ctx.fillStyle = fill;
  a.ctx.fillRect(a.x + fx * a.w, a.y + fy * a.w, fw * a.w, fh * a.w);
}

function line(a: ArtCtx, x0: number, y0: number, x1: number, y1: number, stroke: string, width = 1): void {
  a.ctx.strokeStyle = stroke;
  a.ctx.lineWidth = Math.max(0.75, width * a.w * 0.012);
  a.ctx.beginPath();
  a.ctx.moveTo(a.x + x0 * a.w, a.y + y0 * a.w);
  a.ctx.lineTo(a.x + x1 * a.w, a.y + y1 * a.w);
  a.ctx.stroke();
}

function poly(a: ArtCtx, pts: Array<[number, number]>, fill: string, stroke?: string): void {
  const c = a.ctx;
  c.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? c.moveTo(a.x + px * a.w, a.y + py * a.w) : c.lineTo(a.x + px * a.w, a.y + py * a.w)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = Math.max(0.75, a.w * 0.012);
    c.stroke();
  }
}

function gradRect(a: ArtCtx, fx: number, fy: number, fw: number, fh: number, top: string, bottom: string): void {
  const g = a.ctx.createLinearGradient(0, a.y + fy * a.w, 0, a.y + (fy + fh) * a.w);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  a.ctx.fillStyle = g;
  a.ctx.fillRect(a.x + fx * a.w, a.y + fy * a.w, fw * a.w, fh * a.w);
}

function shadow(a: ArtCtx, fx: number, fy: number, fw: number, fh: number): void {
  a.ctx.fillStyle = "rgba(0,0,0,0.28)";
  a.ctx.fillRect(a.x + (fx + 0.04) * a.w, a.y + (fy + 0.05) * a.w, fw * a.w, fh * a.w);
}

/** Stone wall: base colour with staggered brick lines. */
function stoneWall(a: ArtCtx, fx: number, fy: number, fw: number, fh: number, base = "#8c8579"): void {
  gradRect(a, fx, fy, fw, fh, shade(base, 0.08), shade(base, -0.25));
  const rows = Math.max(2, Math.round(fh * a.w / Math.max(4, a.w * 0.06)));
  const rh = fh / rows;
  a.ctx.strokeStyle = "rgba(0,0,0,0.25)";
  a.ctx.lineWidth = Math.max(0.5, a.w * 0.006);
  for (let r = 0; r <= rows; r++) {
    const yy = a.y + (fy + r * rh) * a.w;
    a.ctx.beginPath();
    a.ctx.moveTo(a.x + fx * a.w, yy);
    a.ctx.lineTo(a.x + (fx + fw) * a.w, yy);
    a.ctx.stroke();
    if (r < rows) {
      const cols = 5;
      const cw = fw / cols;
      const off = r % 2 === 0 ? 0 : cw / 2;
      for (let c = 0; c <= cols; c++) {
        const xx = a.x + (fx + off + c * cw) * a.w;
        if (xx <= a.x + fx * a.w || xx >= a.x + (fx + fw) * a.w) continue;
        a.ctx.beginPath();
        a.ctx.moveTo(xx, yy);
        a.ctx.lineTo(xx, yy + rh * a.w);
        a.ctx.stroke();
      }
    }
  }
}

/** Timber-frame wall: plaster with dark beams. */
function timberWall(a: ArtCtx, fx: number, fy: number, fw: number, fh: number): void {
  gradRect(a, fx, fy, fw, fh, "#d8c9a6", "#b9a683");
  const beam = "#4a3320";
  line(a, fx, fy, fx + fw, fy, beam, 1.4);
  line(a, fx, fy + fh, fx + fw, fy + fh, beam, 1.4);
  const n = Math.max(2, Math.round(fw / 0.22));
  for (let i = 0; i <= n; i++) line(a, fx + (fw * i) / n, fy, fx + (fw * i) / n, fy + fh, beam, 1.2);
  for (let i = 0; i < n; i++) line(a, fx + (fw * i) / n, fy + fh, fx + (fw * (i + 1)) / n, fy, beam, 0.9);
}

/** Pitched roof seen from above-front: two slopes with a ridge. */
function roof(a: ArtCtx, fx: number, fy: number, fw: number, fh: number, color: string, tiles = true): void {
  const ridgeY = fy + fh * 0.5;
  // Back slope (lighter, faces the sky).
  poly(a, [[fx, fy], [fx + fw, fy], [fx + fw, ridgeY], [fx, ridgeY]], shade(color, 0.12));
  // Front slope (darker).
  poly(a, [[fx, ridgeY], [fx + fw, ridgeY], [fx + fw, fy + fh], [fx, fy + fh]], shade(color, -0.22));
  if (tiles) {
    a.ctx.strokeStyle = "rgba(0,0,0,0.18)";
    a.ctx.lineWidth = Math.max(0.5, a.w * 0.005);
    const rows = 6;
    for (let r = 1; r < rows; r++) {
      const yy = a.y + (fy + (fh * r) / rows) * a.w;
      a.ctx.beginPath();
      a.ctx.moveTo(a.x + fx * a.w, yy);
      a.ctx.lineTo(a.x + (fx + fw) * a.w, yy);
      a.ctx.stroke();
    }
  }
  // Ridge highlight + eaves shadow.
  line(a, fx, ridgeY, fx + fw, ridgeY, "rgba(255,255,255,0.35)", 1.2);
  line(a, fx, fy + fh, fx + fw, fy + fh, "rgba(0,0,0,0.45)", 1.4);
}

function door(a: ArtCtx, fx: number, fy: number, fw: number, fh: number): void {
  rect(a, fx, fy, fw, fh, "#3a2617");
  // Arch.
  a.ctx.fillStyle = "#3a2617";
  a.ctx.beginPath();
  a.ctx.ellipse(a.x + (fx + fw / 2) * a.w, a.y + fy * a.w, (fw / 2) * a.w, fh * 0.35 * a.w, 0, Math.PI, 0);
  a.ctx.fill();
  // Planks.
  line(a, fx + fw / 2, fy - fh * 0.2, fx + fw / 2, fy + fh, "rgba(0,0,0,0.4)", 0.8);
}

function win(a: ArtCtx, fx: number, fy: number, fw: number, fh: number, lit = false): void {
  rect(a, fx, fy, fw, fh, lit ? "#f3c96b" : "#1d2229");
  line(a, fx + fw / 2, fy, fx + fw / 2, fy + fh, "#2b2118", 0.8);
  line(a, fx, fy + fh / 2, fx + fw, fy + fh / 2, "#2b2118", 0.8);
}

function flag(a: ArtCtx, fx: number, fy: number, h: number, color: string): void {
  line(a, fx, fy, fx, fy + h, "#3a2a1a", 1.2);
  const wave = Math.sin(a.tick / 6) * 0.01;
  poly(a, [[fx, fy], [fx + h * 0.6, fy + h * 0.18 + wave], [fx, fy + h * 0.36]], color);
}

function smoke(a: ArtCtx, fx: number, fy: number): void {
  for (let i = 0; i < 3; i++) {
    const t = ((a.tick / 20 + i * 0.33) % 1);
    a.ctx.fillStyle = `rgba(220,220,220,${0.35 * (1 - t)})`;
    a.ctx.beginPath();
    a.ctx.arc(a.x + (fx + Math.sin((t + i) * 6) * 0.015) * a.w, a.y + (fy - t * 0.12) * a.w, (0.015 + t * 0.03) * a.w, 0, Math.PI * 2);
    a.ctx.fill();
  }
}

// ───────────────────────────── buildings ─────────────────────────────

const townhall: Drawer = (a) => {
  shadow(a, 0.06, 0.1, 0.88, 0.86);
  // Courtyard base.
  gradRect(a, 0.04, 0.12, 0.92, 0.84, "#6f6357", "#4f463d");
  // Outer curtain wall (front face).
  stoneWall(a, 0.04, 0.72, 0.92, 0.24, "#8a8378");
  // Crenellations on the outer wall.
  for (let i = 0; i < 9; i++) rect(a, 0.04 + i * 0.105, 0.68, 0.055, 0.05, "#9c9588");
  // Corner towers.
  for (const [tx, ty] of [[0.02, 0.1], [0.82, 0.1], [0.02, 0.62], [0.82, 0.62]] as const) {
    stoneWall(a, tx, ty + 0.08, 0.16, 0.22, "#9a9286");
    // conical roof
    poly(a, [[tx - 0.01, ty + 0.1], [tx + 0.17, ty + 0.1], [tx + 0.08, ty - 0.06]], shade(a.color, -0.15), "rgba(0,0,0,0.4)");
    rect(a, tx + 0.055, ty + 0.16, 0.05, 0.07, "#1d2229");
  }
  // Central keep.
  stoneWall(a, 0.28, 0.4, 0.44, 0.34, "#a29a8d");
  roof(a, 0.24, 0.18, 0.52, 0.24, "#6b5240");
  // Keep tower + flag.
  stoneWall(a, 0.44, 0.08, 0.12, 0.14, "#b0a89b");
  poly(a, [[0.42, 0.09], [0.58, 0.09], [0.5, -0.03]], shade(a.color, -0.1), "rgba(0,0,0,0.4)");
  flag(a, 0.5, -0.12, 0.12, a.color);
  // Windows on keep.
  win(a, 0.33, 0.5, 0.06, 0.09, true);
  win(a, 0.61, 0.5, 0.06, 0.09, true);
  // Gate in the outer wall.
  door(a, 0.43, 0.78, 0.14, 0.18);
  // Player banner over the gate.
  poly(a, [[0.4, 0.62], [0.6, 0.62], [0.6, 0.74], [0.5, 0.79], [0.4, 0.74]], a.color, "rgba(0,0,0,0.35)");
  // Chimney smoke.
  smoke(a, 0.68, 0.2);
};

const lumbermill: Drawer = (a) => {
  shadow(a, 0.06, 0.16, 0.86, 0.8);
  // Log pile on the left.
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3 - i; j++) {
      const cx = 0.09 + j * 0.09 + i * 0.045;
      const cy = 0.9 - i * 0.075;
      a.ctx.fillStyle = "#7a5230";
      a.ctx.beginPath();
      a.ctx.arc(a.x + cx * a.w, a.y + cy * a.w, 0.042 * a.w, 0, Math.PI * 2);
      a.ctx.fill();
      a.ctx.fillStyle = "#c69a63";
      a.ctx.beginPath();
      a.ctx.arc(a.x + cx * a.w, a.y + cy * a.w, 0.028 * a.w, 0, Math.PI * 2);
      a.ctx.fill();
    }
  // Main shed: timber wall + shingle roof.
  timberWall(a, 0.3, 0.6, 0.62, 0.32);
  roof(a, 0.26, 0.22, 0.7, 0.4, "#8a5a32");
  door(a, 0.56, 0.72, 0.12, 0.2);
  win(a, 0.36, 0.68, 0.08, 0.08);
  win(a, 0.78, 0.68, 0.08, 0.08);
  // Saw blade mounted on the side, with a bench.
  rect(a, 0.04, 0.5, 0.26, 0.05, "#5a3d24");
  a.ctx.save();
  a.ctx.translate(a.x + 0.17 * a.w, a.y + 0.44 * a.w);
  a.ctx.rotate(a.tick / 10);
  a.ctx.fillStyle = "#cfd3d6";
  a.ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 0.11 : 0.085;
    const ang = (i / 16) * Math.PI * 2;
    a.ctx.lineTo(Math.cos(ang) * r * a.w, Math.sin(ang) * r * a.w);
  }
  a.ctx.closePath();
  a.ctx.fill();
  a.ctx.fillStyle = "#6b6f73";
  a.ctx.beginPath();
  a.ctx.arc(0, 0, 0.025 * a.w, 0, Math.PI * 2);
  a.ctx.fill();
  a.ctx.restore();
  // Player-colour awning over the door.
  poly(a, [[0.52, 0.6], [0.72, 0.6], [0.7, 0.66], [0.54, 0.66]], a.color, "rgba(0,0,0,0.35)");
  // Stump.
  a.ctx.fillStyle = "#8b6a44";
  a.ctx.beginPath();
  a.ctx.ellipse(a.x + 0.86 * a.w, a.y + 0.14 * a.w, 0.06 * a.w, 0.045 * a.w, 0, 0, Math.PI * 2);
  a.ctx.fill();
};

const barracks: Drawer = (a) => {
  shadow(a, 0.06, 0.14, 0.86, 0.82);
  // Stone hall with slate roof.
  stoneWall(a, 0.08, 0.58, 0.84, 0.36, "#7d7a74");
  roof(a, 0.04, 0.16, 0.92, 0.44, "#3f4650");
  // Battlement strip under the eaves.
  for (let i = 0; i < 10; i++) rect(a, 0.08 + i * 0.086, 0.56, 0.045, 0.04, "#8f8c86");
  // Big double door + iron bands.
  door(a, 0.4, 0.7, 0.2, 0.24);
  line(a, 0.4, 0.78, 0.6, 0.78, "#8a8f94", 1);
  line(a, 0.4, 0.86, 0.6, 0.86, "#8a8f94", 1);
  // Arrow-slit windows.
  rect(a, 0.2, 0.66, 0.03, 0.12, "#14181c");
  rect(a, 0.77, 0.66, 0.03, 0.12, "#14181c");
  // Hanging banner in player colour.
  poly(a, [[0.26, 0.6], [0.36, 0.6], [0.36, 0.86], [0.31, 0.92], [0.26, 0.86]], a.color, "rgba(0,0,0,0.4)");
  poly(a, [[0.64, 0.6], [0.74, 0.6], [0.74, 0.86], [0.69, 0.92], [0.64, 0.86]], a.color, "rgba(0,0,0,0.4)");
  // Crossed spears on the roof gable + flag.
  line(a, 0.44, 0.1, 0.56, 0.32, "#c9a469", 1.2);
  line(a, 0.56, 0.1, 0.44, 0.32, "#c9a469", 1.2);
  flag(a, 0.5, 0.02, 0.12, a.color);
  // Training dummy in the yard.
  line(a, 0.9, 0.92, 0.9, 0.78, "#5a3d24", 1.5);
  rect(a, 0.865, 0.74, 0.07, 0.06, "#c9a469");
};

const shipyard: Drawer = (a) => {
  // Warehouse at the back with a timber wall and dark roof.
  shadow(a, 0.06, 0.12, 0.6, 0.5);
  timberWall(a, 0.06, 0.38, 0.58, 0.22);
  roof(a, 0.02, 0.1, 0.66, 0.3, "#5b4634");
  door(a, 0.28, 0.44, 0.12, 0.16);
  win(a, 0.12, 0.44, 0.07, 0.07, true);
  // Dock decking across the bottom and right (over the water).
  gradRect(a, 0.0, 0.62, 1.0, 0.38, "#9b7a52", "#6e5436");
  gradRect(a, 0.68, 0.06, 0.32, 0.6, "#9b7a52", "#6e5436");
  a.ctx.strokeStyle = "rgba(0,0,0,0.35)";
  a.ctx.lineWidth = Math.max(0.5, a.w * 0.006);
  for (let i = 1; i < 7; i++) {
    const yy = a.y + (0.62 + i * 0.054) * a.w;
    a.ctx.beginPath();
    a.ctx.moveTo(a.x, yy);
    a.ctx.lineTo(a.x + a.w, yy);
    a.ctx.stroke();
  }
  for (let i = 1; i < 6; i++) {
    const xx = a.x + (0.68 + i * 0.054) * a.w;
    a.ctx.beginPath();
    a.ctx.moveTo(xx, a.y + 0.06 * a.w);
    a.ctx.lineTo(xx, a.y + 0.62 * a.w);
    a.ctx.stroke();
  }
  // Pilings along the outer edge.
  for (let i = 0; i < 6; i++) rect(a, 0.03 + i * 0.19, 0.95, 0.05, 0.07, "#4a3320");
  // Slipway with a hull under construction (keel + ribs).
  gradRect(a, 0.12, 0.68, 0.5, 0.26, "#5f4a34", "#3f3020");
  line(a, 0.16, 0.86, 0.58, 0.86, "#d9c09a", 2);
  for (let i = 0; i < 6; i++) {
    const rx = 0.2 + i * 0.07;
    a.ctx.strokeStyle = "#d9c09a";
    a.ctx.lineWidth = Math.max(0.75, a.w * 0.014);
    a.ctx.beginPath();
    a.ctx.arc(a.x + rx * a.w, a.y + 0.86 * a.w, 0.09 * a.w, Math.PI, 0);
    a.ctx.stroke();
  }
  // Crane: post, jib, rope, hook.
  line(a, 0.8, 0.6, 0.8, 0.18, "#3a2a1a", 2.2);
  line(a, 0.8, 0.2, 0.5, 0.36, "#3a2a1a", 1.8);
  line(a, 0.8, 0.6, 0.62, 0.3, "#3a2a1a", 1);
  const sway = Math.sin(a.tick / 15) * 0.01;
  line(a, 0.52 + sway, 0.35, 0.52 + sway, 0.62, "#e8dcc4", 0.8);
  rect(a, 0.49 + sway, 0.62, 0.06, 0.03, "#8a8f94");
  // Barrels + coiled rope.
  for (const [bx, by] of [[0.72, 0.7], [0.8, 0.7], [0.76, 0.78]] as const) {
    a.ctx.fillStyle = "#8b5a2b";
    a.ctx.beginPath();
    a.ctx.arc(a.x + bx * a.w, a.y + by * a.w, 0.038 * a.w, 0, Math.PI * 2);
    a.ctx.fill();
    a.ctx.strokeStyle = "#3a2a1a";
    a.ctx.lineWidth = Math.max(0.5, a.w * 0.008);
    a.ctx.stroke();
  }
  // Player-colour pennant on the crane.
  flag(a, 0.8, 0.12, 0.1, a.color);
};

/** Legacy single-style drawers, kept for reference. */
// ───────────────────────────── the Blackrock ─────────────────────────────

/**
 * Orc structures: hide over bone over sharpened timber.
 *
 * Human buildings in this game are rectangles with pitched roofs and neat
 * gables, so orc ones are deliberately none of those things -- round, sagging,
 * asymmetric, and bristling. Nothing here is a straight line if it can help it,
 * because the whole job is that a player who has scouted into a camp knows in
 * one glance that nobody friendly built this.
 */
const ORC_HIDE_LIT = "#8a7355";
const ORC_HIDE_DIM = "#5e4c37";
const ORC_TIMBER = "#4a3928";
const ORC_BONE = "#d8cdb2";

/** A ring of sharpened stakes leaning outward, drawn behind whatever it rings. */
function stakes(a: ArtCtx, cx: number, cy: number, r: number, n: number): void {
  const c = a.ctx;
  c.strokeStyle = ORC_TIMBER;
  c.lineWidth = Math.max(1, a.w * 0.022);
  c.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + 0.3;
    const bx = a.x + (cx + Math.cos(ang) * r) * a.w;
    const by = a.y + (cy + Math.sin(ang) * r * 0.58) * a.w;
    c.beginPath();
    c.moveTo(bx, by);
    c.lineTo(bx + Math.cos(ang) * a.w * 0.06, by + Math.sin(ang) * a.w * 0.035 - a.w * 0.11);
    c.stroke();
  }
}

/** A skull on a pole. There is always a skull on a pole. */
function totem(a: ArtCtx, fx: number, fy: number, h: number): void {
  const c = a.ctx;
  const px = a.x + fx * a.w;
  const py = a.y + fy * a.w;
  c.strokeStyle = ORC_TIMBER;
  c.lineWidth = Math.max(1, a.w * 0.018);
  c.beginPath();
  c.moveTo(px, py);
  c.lineTo(px, py - h * a.w);
  c.stroke();
  c.fillStyle = ORC_BONE;
  c.beginPath();
  c.ellipse(px, py - h * a.w - a.w * 0.02, a.w * 0.035, a.w * 0.028, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(30,24,18,0.8)";
  for (const dx of [-0.014, 0.014]) {
    c.beginPath();
    c.arc(px + dx * a.w, py - h * a.w - a.w * 0.026, a.w * 0.008, 0, Math.PI * 2);
    c.fill();
  }
}

const stronghold: Drawer = (a) => {
  const c = a.ctx;
  // Shadow.
  c.fillStyle = "rgba(0,0,0,0.28)";
  c.beginPath();
  c.ellipse(a.x + a.w * 0.52, a.y + a.w * 0.74, a.w * 0.42, a.w * 0.18, 0, 0, Math.PI * 2);
  c.fill();

  stakes(a, 0.5, 0.72, 0.46, 14);

  // A great sagging hide dome, wider than it is tall and off-centre.
  const g = a.ctx.createLinearGradient(0, a.y + a.w * 0.12, 0, a.y + a.w * 0.78);
  g.addColorStop(0, ORC_HIDE_LIT);
  g.addColorStop(1, ORC_HIDE_DIM);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(a.x + a.w * 0.1, a.y + a.w * 0.74);
  c.bezierCurveTo(a.x + a.w * 0.04, a.y + a.w * 0.3, a.x + a.w * 0.34, a.y + a.w * 0.1, a.x + a.w * 0.54, a.y + a.w * 0.14);
  c.bezierCurveTo(a.x + a.w * 0.82, a.y + a.w * 0.18, a.x + a.w * 0.94, a.y + a.w * 0.44, a.x + a.w * 0.9, a.y + a.w * 0.74);
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(24,18,12,0.55)";
  c.lineWidth = Math.max(1, a.w * 0.014);
  c.stroke();

  // Rib poles over the hide, which is what stops it being a boulder.
  c.strokeStyle = "rgba(38,28,18,0.5)";
  c.lineWidth = Math.max(0.8, a.w * 0.012);
  for (const k of [0.28, 0.44, 0.6, 0.76]) {
    c.beginPath();
    c.moveTo(a.x + a.w * k, a.y + a.w * 0.74);
    c.quadraticCurveTo(a.x + a.w * (k * 0.7 + 0.16), a.y + a.w * 0.26, a.x + a.w * 0.52, a.y + a.w * 0.15);
    c.stroke();
  }

  // A black hole of a doorway under a bone lintel.
  c.fillStyle = "#1d160f";
  c.beginPath();
  c.moveTo(a.x + a.w * 0.4, a.y + a.w * 0.74);
  c.lineTo(a.x + a.w * 0.4, a.y + a.w * 0.53);
  c.quadraticCurveTo(a.x + a.w * 0.5, a.y + a.w * 0.45, a.x + a.w * 0.6, a.y + a.w * 0.53);
  c.lineTo(a.x + a.w * 0.6, a.y + a.w * 0.74);
  c.closePath();
  c.fill();
  c.strokeStyle = ORC_BONE;
  c.lineWidth = Math.max(1, a.w * 0.02);
  c.beginPath();
  c.moveTo(a.x + a.w * 0.37, a.y + a.w * 0.52);
  c.quadraticCurveTo(a.x + a.w * 0.5, a.y + a.w * 0.42, a.x + a.w * 0.63, a.y + a.w * 0.52);
  c.stroke();

  totem(a, 0.18, 0.72, 0.42);
  totem(a, 0.84, 0.7, 0.34);

  // A banner in the owning clan's colour, so the camp reads as a side.
  c.fillStyle = a.color;
  c.beginPath();
  c.moveTo(a.x + a.w * 0.52, a.y + a.w * 0.14);
  c.lineTo(a.x + a.w * 0.52, a.y - a.w * 0.16);
  c.lineTo(a.x + a.w * 0.76, a.y - a.w * 0.06);
  c.lineTo(a.x + a.w * 0.52, a.y + a.w * 0.02);
  c.closePath();
  c.fill();
  c.strokeStyle = ORC_TIMBER;
  c.lineWidth = Math.max(1, a.w * 0.016);
  c.beginPath();
  c.moveTo(a.x + a.w * 0.52, a.y + a.w * 0.2);
  c.lineTo(a.x + a.w * 0.52, a.y - a.w * 0.18);
  c.stroke();

  // Smoke out of the top, on the same clock the human chimneys use.
  const puff = (a.tick * 0.01) % 1;
  c.fillStyle = `rgba(60,56,50,${0.3 * (1 - puff)})`;
  c.beginPath();
  c.arc(a.x + a.w * 0.44, a.y + a.w * (0.1 - puff * 0.3), a.w * (0.05 + puff * 0.09), 0, Math.PI * 2);
  c.fill();
};

const warhut: Drawer = (a) => {
  const c = a.ctx;
  c.fillStyle = "rgba(0,0,0,0.26)";
  c.beginPath();
  c.ellipse(a.x + a.w * 0.54, a.y + a.w * 0.78, a.w * 0.38, a.w * 0.15, 0, 0, Math.PI * 2);
  c.fill();

  stakes(a, 0.5, 0.76, 0.4, 9);

  const g = a.ctx.createLinearGradient(0, a.y + a.w * 0.2, 0, a.y + a.w * 0.8);
  g.addColorStop(0, ORC_HIDE_LIT);
  g.addColorStop(1, ORC_HIDE_DIM);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(a.x + a.w * 0.16, a.y + a.w * 0.78);
  c.bezierCurveTo(a.x + a.w * 0.12, a.y + a.w * 0.4, a.x + a.w * 0.4, a.y + a.w * 0.2, a.x + a.w * 0.56, a.y + a.w * 0.24);
  c.bezierCurveTo(a.x + a.w * 0.8, a.y + a.w * 0.3, a.x + a.w * 0.88, a.y + a.w * 0.52, a.x + a.w * 0.84, a.y + a.w * 0.78);
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(24,18,12,0.5)";
  c.lineWidth = Math.max(0.8, a.w * 0.016);
  c.stroke();

  c.fillStyle = "#1d160f";
  c.beginPath();
  c.ellipse(a.x + a.w * 0.5, a.y + a.w * 0.72, a.w * 0.11, a.w * 0.13, 0, Math.PI, 0);
  c.fill();

  totem(a, 0.86, 0.76, 0.3);
  c.fillStyle = a.color;
  c.fillRect(a.x + a.w * 0.22, a.y + a.w * 0.3, a.w * 0.1, a.w * 0.16);
};

const ORC_BUILDING_ART: Record<string, Drawer> = { stronghold, warhut };

export const CLASSIC_ART: Record<string, Drawer> = { townhall, lumbermill, barracks, shipyard };

/** Live art: each building uses the style chosen in data/styleChoice.ts. */
const styled =
  (def: string): Drawer =>
  (a) =>
    STYLED_BUILDINGS[def]!(a, STYLE_BY_ID[BUILDING_STYLE[def] ?? "A"] ?? STYLES[0]!);
const HUMAN_ART: Record<string, Drawer> = Object.fromEntries(Object.keys(CLASSIC_ART).map((d) => [d, styled(d)]));

/** Art sets per faction. A faction with no set of its own falls back to the Human one. */
export const FACTION_ART: Record<string, Record<string, Drawer>> = {
  human: HUMAN_ART,
  orc: ORC_BUILDING_ART,
};

/**
 * The drawer for one building of one faction.
 *
 * Falls back per DEFINITION, not per faction. `FACTION_ART[faction] ?? HUMAN_ART`
 * reads naturally and is a trap the moment a second faction exists: it picks the
 * orc table, finds no `farm` in it, and returns undefined -- so a building a
 * faction has no special art for is drawn as nothing at all rather than as the
 * default. A faction's table should only need to hold what is different.
 */
export function artFor(faction: string, def: string): Drawer | undefined {
  return FACTION_ART[faction]?.[def] ?? HUMAN_ART[def];
}

/**
 * Under construction: foundation → frame → the finished body rises out of the
 * scaffolding (clipped from the bottom by progress), with a progress bar above.
 */
export function drawConstruction(a: ArtCtx): void {
  const c = a.ctx;
  const p = a.progress;
  // Foundation: cleared earth + stakes.
  gradRect(a, 0.02, 0.06, 0.96, 0.92, "#6a5236", "#4d3a25");
  for (let i = 0; i < 4; i++) {
    rect(a, 0.04 + i * 0.3, 0.06, 0.03, 0.06, "#c9a469");
    rect(a, 0.04 + i * 0.3, 0.92, 0.03, 0.06, "#c9a469");
  }
  // Finished body clipped to the built fraction, rising from the ground.
  if (p > 0.15) {
    const built = (p - 0.15) / 0.85;
    c.save();
    c.beginPath();
    c.rect(a.x - 0.15 * a.w, a.y + (1 - built) * a.w - 0.02 * a.w, a.w * 1.3, built * a.w + 0.2 * a.w);
    c.clip();
    artFor(a.faction, a.def)?.({ ...a, progress: 1 });
    c.restore();
  }
  // Scaffold: poles and cross braces over everything not yet built.
  const pole = "#c9a469";
  for (const fx of [0.05, 0.5, 0.95]) line(a, fx, 0.04, fx, 0.98, pole, 1.4);
  for (const fy of [0.08, 0.5, 0.94]) line(a, 0.05, fy, 0.95, fy, pole, 1);
  line(a, 0.05, 0.08, 0.5, 0.5, pole, 0.8);
  line(a, 0.5, 0.08, 0.95, 0.5, pole, 0.8);
  line(a, 0.05, 0.5, 0.5, 0.94, pole, 0.8);
  line(a, 0.5, 0.5, 0.95, 0.94, pole, 0.8);
}
