/**
 * Five visual styles for the building set. Each style supplies materials
 * (wall, roof, ground, trim) and an ornament pass; the four building drawers
 * below compose those materials into each building's fixed silhouette, so a
 * Town Hall is always a keep with a central tower, a Lumber Mill always has a
 * log pile and saw, and so on — only the "architecture" changes with the style.
 *
 * Every coordinate is a fraction of the sprite width `w`, so it scales with zoom.
 */

import type { ArtCtx } from "./buildingArt";

export interface Style {
  id: string;
  name: string;
  /** Front wall material. */
  wall(a: ArtCtx, fx: number, fy: number, fw: number, fh: number): void;
  /** Roof over a rectangle; the roof may overhang the rect slightly. */
  roof(a: ArtCtx, fx: number, fy: number, fw: number, fh: number): void;
  /** Ground / yard fill under the building. */
  ground(a: ArtCtx, fx: number, fy: number, fw: number, fh: number): void;
  /** Small tower or pole cap used for keeps and cranes. */
  spire(a: ArtCtx, cx: number, baseY: number, r: number): void;
  door(a: ArtCtx, fx: number, fy: number, fw: number, fh: number): void;
  window(a: ArtCtx, fx: number, fy: number, fw: number, fh: number): void;
  /** Player-colour banner hung on a wall. */
  banner(a: ArtCtx, fx: number, fy: number, fw: number, fh: number): void;
  /** Style-specific yard clutter drawn last. */
  ornament(a: ArtCtx): void;
  palette: { trimDark: string; trimLight: string; metal: string };
}

// ───────────────────────────── primitives ─────────────────────────────

function shade(hex: string, amt: number): string {
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
const X = (a: ArtCtx, f: number) => a.x + f * a.w;
const Y = (a: ArtCtx, f: number) => a.y + f * a.w;
const LW = (a: ArtCtx, k = 1) => Math.max(0.6, a.w * 0.012 * k);

function rect(a: ArtCtx, fx: number, fy: number, fw: number, fh: number, fill: string): void {
  a.ctx.fillStyle = fill;
  a.ctx.fillRect(X(a, fx), Y(a, fy), fw * a.w, fh * a.w);
}
function grad(a: ArtCtx, fx: number, fy: number, fw: number, fh: number, top: string, bottom: string): void {
  const g = a.ctx.createLinearGradient(0, Y(a, fy), 0, Y(a, fy + fh));
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  a.ctx.fillStyle = g;
  a.ctx.fillRect(X(a, fx), Y(a, fy), fw * a.w, fh * a.w);
}
function line(a: ArtCtx, x0: number, y0: number, x1: number, y1: number, stroke: string, k = 1): void {
  a.ctx.strokeStyle = stroke;
  a.ctx.lineWidth = LW(a, k);
  a.ctx.beginPath();
  a.ctx.moveTo(X(a, x0), Y(a, y0));
  a.ctx.lineTo(X(a, x1), Y(a, y1));
  a.ctx.stroke();
}
function poly(a: ArtCtx, pts: Array<[number, number]>, fill: string, stroke?: string, k = 1): void {
  const c = a.ctx;
  c.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? c.moveTo(X(a, px), Y(a, py)) : c.lineTo(X(a, px), Y(a, py))));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = LW(a, k);
    c.stroke();
  }
}
function circle(a: ArtCtx, cx: number, cy: number, r: number, fill: string, stroke?: string, k = 1): void {
  const c = a.ctx;
  c.beginPath();
  c.arc(X(a, cx), Y(a, cy), r * a.w, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = LW(a, k);
    c.stroke();
  }
}
function shadow(a: ArtCtx, fx: number, fy: number, fw: number, fh: number): void {
  a.ctx.fillStyle = "rgba(0,0,0,0.28)";
  a.ctx.fillRect(X(a, fx + 0.04), Y(a, fy + 0.05), fw * a.w, fh * a.w);
}
function hlines(a: ArtCtx, fx: number, fy: number, fw: number, fh: number, n: number, stroke: string, k = 0.5): void {
  for (let i = 1; i < n; i++) line(a, fx, fy + (fh * i) / n, fx + fw, fy + (fh * i) / n, stroke, k);
}
function flag(a: ArtCtx, fx: number, fy: number, h: number, color: string): void {
  line(a, fx, fy, fx, fy + h, "#3a2a1a", 1.2);
  const wave = Math.sin(a.tick / 6) * 0.01;
  poly(a, [[fx, fy], [fx + h * 0.6, fy + h * 0.18 + wave], [fx, fy + h * 0.36]], color);
}
function smoke(a: ArtCtx, fx: number, fy: number): void {
  for (let i = 0; i < 3; i++) {
    const t = (a.tick / 20 + i * 0.33) % 1;
    a.ctx.fillStyle = `rgba(220,220,220,${0.35 * (1 - t)})`;
    a.ctx.beginPath();
    a.ctx.arc(X(a, fx + Math.sin((t + i) * 6) * 0.015), Y(a, fy - t * 0.12), (0.015 + t * 0.03) * a.w, 0, Math.PI * 2);
    a.ctx.fill();
  }
}

// ───────────────────────────── shared material builders ─────────────────────────────

function stoneWall(a: ArtCtx, fx: number, fy: number, fw: number, fh: number, base: string): void {
  grad(a, fx, fy, fw, fh, shade(base, 0.08), shade(base, -0.25));
  const rows = Math.max(2, Math.round(fh / 0.06));
  const rh = fh / rows;
  for (let r = 0; r <= rows; r++) {
    line(a, fx, fy + r * rh, fx + fw, fy + r * rh, "rgba(0,0,0,0.25)", 0.5);
    if (r < rows) {
      const cols = 5;
      const cw = fw / cols;
      const off = r % 2 === 0 ? 0 : cw / 2;
      for (let c = 0; c <= cols; c++) {
        const xx = fx + off + c * cw;
        if (xx <= fx || xx >= fx + fw) continue;
        line(a, xx, fy + r * rh, xx, fy + (r + 1) * rh, "rgba(0,0,0,0.25)", 0.5);
      }
    }
  }
}
function logWall(a: ArtCtx, fx: number, fy: number, fw: number, fh: number): void {
  const n = Math.max(3, Math.round(fh / 0.055));
  const lh = fh / n;
  for (let i = 0; i < n; i++) {
    grad(a, fx, fy + i * lh, fw, lh, "#a5743f", "#6e4a26");
    line(a, fx, fy + (i + 1) * lh, fx + fw, fy + (i + 1) * lh, "rgba(0,0,0,0.4)", 0.6);
    // Log ends poking out on the right.
    circle(a, fx + fw, fy + (i + 0.5) * lh, lh * 0.45, "#c69a63", "#5a3a1c", 0.6);
  }
}
function plasterWall(a: ArtCtx, fx: number, fy: number, fw: number, fh: number, trim: string): void {
  grad(a, fx, fy, fw, fh, "#f2e8d5", "#d9cbb0");
  // Painted band along the top and bottom edge.
  rect(a, fx, fy, fw, 0.025, trim);
  rect(a, fx, fy + fh - 0.03, fw, 0.03, shade(trim, -0.2));
}
function darkStoneWall(a: ArtCtx, fx: number, fy: number, fw: number, fh: number): void {
  stoneWall(a, fx, fy, fw, fh, "#4b4f57");
  // Iron strap.
  rect(a, fx, fy + fh * 0.45, fw, 0.02, "#22252a");
  for (let i = 0; i < 5; i++) rect(a, fx + fw * (0.1 + i * 0.2), fy + fh * 0.45 - 0.005, 0.012, 0.03, "#8a8f94");
}
function hideWall(a: ArtCtx, fx: number, fy: number, fw: number, fh: number): void {
  grad(a, fx, fy, fw, fh, "#a8865a", "#6f5232");
  // Stitching + bone pegs.
  line(a, fx, fy + fh * 0.5, fx + fw, fy + fh * 0.5, "rgba(0,0,0,0.35)", 0.6);
  for (let i = 0; i < 6; i++) {
    const xx = fx + fw * (0.08 + i * 0.17);
    line(a, xx, fy + fh * 0.5 - 0.02, xx + 0.02, fy + fh * 0.5 + 0.02, "#2b1d12", 0.6);
    rect(a, xx - 0.008, fy + 0.01, 0.016, 0.03, "#efe6d2");
  }
}

function pitchedRoof(a: ArtCtx, fx: number, fy: number, fw: number, fh: number, color: string): void {
  const ridge = fy + fh * 0.5;
  poly(a, [[fx, fy], [fx + fw, fy], [fx + fw, ridge], [fx, ridge]], shade(color, 0.12));
  poly(a, [[fx, ridge], [fx + fw, ridge], [fx + fw, fy + fh], [fx, fy + fh]], shade(color, -0.22));
  hlines(a, fx, fy, fw, fh, 6, "rgba(0,0,0,0.18)", 0.4);
  line(a, fx, ridge, fx + fw, ridge, "rgba(255,255,255,0.35)", 1.2);
  line(a, fx, fy + fh, fx + fw, fy + fh, "rgba(0,0,0,0.45)", 1.4);
}
function thatchRoof(a: ArtCtx, fx: number, fy: number, fw: number, fh: number): void {
  // Rounded golden thatch with a combed texture and a rope ridge.
  const c = a.ctx;
  const g = c.createLinearGradient(0, Y(a, fy), 0, Y(a, fy + fh));
  g.addColorStop(0, "#d9b25f");
  g.addColorStop(1, "#8f6f2e");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(X(a, fx - 0.02), Y(a, fy + fh));
  c.quadraticCurveTo(X(a, fx + fw / 2), Y(a, fy - fh * 0.35), X(a, fx + fw + 0.02), Y(a, fy + fh));
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(90,60,20,0.35)";
  c.lineWidth = LW(a, 0.5);
  for (let i = 1; i < 12; i++) {
    const xx = fx + (fw * i) / 12;
    c.beginPath();
    c.moveTo(X(a, xx), Y(a, fy + fh));
    c.lineTo(X(a, fx + fw / 2 + (xx - fx - fw / 2) * 0.35), Y(a, fy + fh * 0.1));
    c.stroke();
  }
  line(a, fx + fw * 0.2, fy + fh * 0.05, fx + fw * 0.8, fy + fh * 0.05, "#6b4a2b", 1.4);
  line(a, fx - 0.02, fy + fh, fx + fw + 0.02, fy + fh, "rgba(0,0,0,0.45)", 1.4);
}
function terracottaRoof(a: ArtCtx, fx: number, fy: number, fw: number, fh: number): void {
  const ridge = fy + fh * 0.45;
  poly(a, [[fx - 0.02, fy], [fx + fw + 0.02, fy], [fx + fw + 0.02, ridge], [fx - 0.02, ridge]], "#d9835a");
  poly(a, [[fx - 0.02, ridge], [fx + fw + 0.02, ridge], [fx + fw + 0.02, fy + fh], [fx - 0.02, fy + fh]], "#b35a3b");
  // Rounded tile rows.
  const c = a.ctx;
  c.strokeStyle = "rgba(60,20,10,0.35)";
  c.lineWidth = LW(a, 0.5);
  const rows = 5;
  for (let r = 0; r <= rows; r++) {
    const yy = fy + (fh * r) / rows;
    c.beginPath();
    for (let i = 0; i <= 14; i++) {
      const xx = fx - 0.02 + ((fw + 0.04) * i) / 14;
      const bump = i % 2 === 0 ? 0 : 0.012;
      i === 0 ? c.moveTo(X(a, xx), Y(a, yy + bump)) : c.lineTo(X(a, xx), Y(a, yy + bump));
    }
    c.stroke();
  }
  line(a, fx - 0.02, fy + fh, fx + fw + 0.02, fy + fh, "rgba(0,0,0,0.45)", 1.4);
}
function slateRoof(a: ArtCtx, fx: number, fy: number, fw: number, fh: number): void {
  // Steep gable: a tall triangle seen from the front-top, with iron spikes.
  const apexY = fy - fh * 0.25;
  poly(a, [[fx, fy + fh], [fx + fw / 2, apexY], [fx + fw, fy + fh]], "#2f343c", "#14171b", 0.8);
  poly(a, [[fx + fw * 0.08, fy + fh], [fx + fw / 2, apexY + fh * 0.18], [fx + fw * 0.5, fy + fh]], "#3b414a");
  hlines(a, fx, apexY, fw, fh + fh * 0.25, 7, "rgba(0,0,0,0.3)", 0.4);
  for (const t of [0.15, 0.5, 0.85]) {
    const yy = apexY + (fy + fh - apexY) * (1 - t) * 0.9;
    line(a, fx + fw * t, yy, fx + fw * t, yy - 0.06, "#8a8f94", 1.2);
  }
}
function tentRoof(a: ArtCtx, fx: number, fy: number, fw: number, fh: number): void {
  // Hide tent: peaked, with support poles poking through and a tusk on top.
  const c = a.ctx;
  const g = c.createLinearGradient(0, Y(a, fy - fh * 0.3), 0, Y(a, fy + fh));
  g.addColorStop(0, "#b08a5c");
  g.addColorStop(1, "#6b4a2b");
  poly(a, [[fx - 0.03, fy + fh], [fx + fw * 0.5, fy - fh * 0.3], [fx + fw + 0.03, fy + fh]], "#8a6a44", "#3a2a1a", 0.8);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(X(a, fx - 0.03), Y(a, fy + fh));
  c.lineTo(X(a, fx + fw * 0.5), Y(a, fy - fh * 0.3));
  c.lineTo(X(a, fx + fw + 0.03), Y(a, fy + fh));
  c.closePath();
  c.fill();
  // Seams.
  for (const t of [0.25, 0.75]) line(a, fx + fw * t, fy + fh, fx + fw * 0.5, fy - fh * 0.3, "rgba(0,0,0,0.3)", 0.6);
  // Poles through the peak.
  line(a, fx + fw * 0.44, fy - fh * 0.2, fx + fw * 0.56, fy - fh * 0.45, "#3a2a1a", 1.2);
  line(a, fx + fw * 0.56, fy - fh * 0.2, fx + fw * 0.44, fy - fh * 0.45, "#3a2a1a", 1.2);
  // Red war-paint stripe.
  line(a, fx + fw * 0.2, fy + fh * 0.7, fx + fw * 0.8, fy + fh * 0.7, "rgba(160,30,30,0.7)", 1.6);
}

// ───────────────────────────── the five styles ─────────────────────────────

const stonework: Style = {
  id: "A",
  name: "Stonework",
  palette: { trimDark: "#4a3320", trimLight: "#c9a469", metal: "#8a8f94" },
  wall: (a, x, y, w, h) => stoneWall(a, x, y, w, h, "#8c8579"),
  roof: (a, x, y, w, h) => pitchedRoof(a, x, y, w, h, "#6b5240"),
  ground: (a, x, y, w, h) => grad(a, x, y, w, h, "#6f6357", "#4f463d"),
  spire: (a, cx, baseY, r) => poly(a, [[cx - r, baseY], [cx + r, baseY], [cx, baseY - r * 1.6]], shade(a.color, -0.15), "rgba(0,0,0,0.4)"),
  door: (a, x, y, w, h) => {
    rect(a, x, y, w, h, "#3a2617");
    a.ctx.fillStyle = "#3a2617";
    a.ctx.beginPath();
    a.ctx.ellipse(X(a, x + w / 2), Y(a, y), (w / 2) * a.w, h * 0.35 * a.w, 0, Math.PI, 0);
    a.ctx.fill();
  },
  window: (a, x, y, w, h) => {
    rect(a, x, y, w, h, "#f3c96b");
    line(a, x + w / 2, y, x + w / 2, y + h, "#2b2118", 0.8);
  },
  banner: (a, x, y, w, h) => poly(a, [[x, y], [x + w, y], [x + w, y + h * 0.8], [x + w / 2, y + h], [x, y + h * 0.8]], a.color, "rgba(0,0,0,0.35)"),
  ornament: (a) => smoke(a, 0.68, 0.2),
};

const thatch: Style = {
  id: "B",
  name: "Timber & Thatch",
  palette: { trimDark: "#4a2f18", trimLight: "#d9b25f", metal: "#7d7a74" },
  wall: (a, x, y, w, h) => logWall(a, x, y, w, h),
  roof: (a, x, y, w, h) => thatchRoof(a, x, y, w, h),
  ground: (a, x, y, w, h) => grad(a, x, y, w, h, "#7a6a45", "#5a4a2e"),
  spire: (a, cx, baseY, r) => {
    // Thatched cone.
    a.ctx.fillStyle = "#c9a04f";
    a.ctx.beginPath();
    a.ctx.moveTo(X(a, cx - r), Y(a, baseY));
    a.ctx.quadraticCurveTo(X(a, cx), Y(a, baseY - r * 2.4), X(a, cx + r), Y(a, baseY));
    a.ctx.fill();
    line(a, cx - r * 0.4, baseY - r * 0.6, cx + r * 0.4, baseY - r * 0.6, "#6b4a2b", 1);
  },
  door: (a, x, y, w, h) => {
    rect(a, x, y, w, h, "#3a2617");
    line(a, x + w * 0.5, y, x + w * 0.5, y + h, "rgba(0,0,0,0.4)", 0.8);
    line(a, x, y + h * 0.3, x + w, y + h * 0.3, "#8a6f45", 0.8);
  },
  window: (a, x, y, w, h) => rect(a, x, y, w, h, "#1d2229"),
  banner: (a, x, y, w, h) => {
    // Cloth on a pole.
    line(a, x, y - 0.02, x, y + h, "#3a2a1a", 1.2);
    poly(a, [[x, y], [x + w, y + h * 0.15], [x, y + h * 0.5]], a.color);
  },
  ornament: (a) => {
    // Palisade stakes along the bottom edge.
    for (let i = 0; i < 8; i++) {
      const xx = 0.05 + i * 0.13;
      poly(a, [[xx, 0.98], [xx + 0.04, 0.98], [xx + 0.02, 0.9]], "#8a6a44", "#3a2a1a", 0.6);
    }
  },
};

const plaster: Style = {
  id: "C",
  name: "Painted Plaster",
  palette: { trimDark: "#2e5f8a", trimLight: "#f2e8d5", metal: "#8a8f94" },
  wall: (a, x, y, w, h) => plasterWall(a, x, y, w, h, a.color),
  roof: (a, x, y, w, h) => terracottaRoof(a, x, y, w, h),
  ground: (a, x, y, w, h) => {
    grad(a, x, y, w, h, "#d8c9a6", "#b9a683");
    // Flagstones.
    for (let i = 1; i < 5; i++) line(a, x, y + (h * i) / 5, x + w, y + (h * i) / 5, "rgba(0,0,0,0.12)", 0.4);
    for (let i = 1; i < 5; i++) line(a, x + (w * i) / 5, y, x + (w * i) / 5, y + h, "rgba(0,0,0,0.12)", 0.4);
  },
  spire: (a, cx, baseY, r) => {
    // Small terracotta dome.
    a.ctx.fillStyle = "#c46a45";
    a.ctx.beginPath();
    a.ctx.ellipse(X(a, cx), Y(a, baseY), r * a.w, r * 1.2 * a.w, 0, Math.PI, 0);
    a.ctx.fill();
    circle(a, cx, baseY - r * 1.2, r * 0.25, a.color);
  },
  door: (a, x, y, w, h) => {
    // Arched doorway with a painted surround.
    rect(a, x - 0.015, y - 0.01, w + 0.03, h + 0.01, a.color);
    rect(a, x, y, w, h, "#4a2f18");
    a.ctx.fillStyle = "#4a2f18";
    a.ctx.beginPath();
    a.ctx.ellipse(X(a, x + w / 2), Y(a, y), (w / 2) * a.w, h * 0.4 * a.w, 0, Math.PI, 0);
    a.ctx.fill();
  },
  window: (a, x, y, w, h) => {
    rect(a, x - 0.01, y - 0.01, w + 0.02, h + 0.02, a.color);
    rect(a, x, y, w, h, "#7fb0d6");
    // Shutter.
    rect(a, x + w, y, w * 0.4, h, "#2e5f8a");
  },
  banner: (a, x, y, w, h) => {
    // Striped awning.
    for (let i = 0; i < 4; i++) rect(a, x + (w * i) / 4, y, w / 4, h * 0.5, i % 2 === 0 ? a.color : "#f2e8d5");
    line(a, x, y + h * 0.5, x + w, y + h * 0.5, "rgba(0,0,0,0.4)", 0.8);
  },
  ornament: (a) => {
    // Potted trees by the door.
    for (const px of [0.1, 0.9]) {
      rect(a, px - 0.03, 0.9, 0.06, 0.06, "#b35a3b");
      circle(a, px, 0.87, 0.04, "#4f8a32");
    }
  },
};

const ironSlate: Style = {
  id: "D",
  name: "Iron & Slate",
  palette: { trimDark: "#14171b", trimLight: "#8a8f94", metal: "#a8adb3" },
  wall: (a, x, y, w, h) => darkStoneWall(a, x, y, w, h),
  roof: (a, x, y, w, h) => slateRoof(a, x, y, w, h),
  ground: (a, x, y, w, h) => grad(a, x, y, w, h, "#3d4147", "#25282d"),
  spire: (a, cx, baseY, r) => {
    poly(a, [[cx - r, baseY], [cx + r, baseY], [cx, baseY - r * 2.6]], "#2f343c", "#14171b", 0.8);
    line(a, cx, baseY - r * 2.6, cx, baseY - r * 3.2, "#8a8f94", 1.2);
  },
  door: (a, x, y, w, h) => {
    rect(a, x, y, w, h, "#1a1d21");
    // Portcullis bars.
    for (let i = 1; i < 4; i++) line(a, x + (w * i) / 4, y, x + (w * i) / 4, y + h, "#6b7075", 0.8);
    line(a, x, y + h * 0.4, x + w, y + h * 0.4, "#6b7075", 0.8);
  },
  window: (a, x, y, w, h) => {
    // Forge glow.
    rect(a, x, y, w, h, "#ff8c3a");
    rect(a, x + w * 0.25, y + h * 0.3, w * 0.5, h * 0.7, "#ffd27a");
  },
  banner: (a, x, y, w, h) => {
    poly(a, [[x, y], [x + w, y], [x + w, y + h * 0.85], [x + w / 2, y + h], [x, y + h * 0.85]], a.color, "#14171b");
    // Iron rod.
    rect(a, x - 0.01, y - 0.015, w + 0.02, 0.015, "#8a8f94");
  },
  ornament: (a) => {
    // Spiked iron fence along the front.
    line(a, 0.02, 0.96, 0.98, 0.96, "#22252a", 1.2);
    for (let i = 0; i < 9; i++) line(a, 0.06 + i * 0.11, 0.99, 0.06 + i * 0.11, 0.9, "#8a8f94", 1);
    smoke(a, 0.3, 0.18);
  },
};

const warCamp: Style = {
  id: "E",
  name: "War Camp",
  palette: { trimDark: "#2b1d12", trimLight: "#efe6d2", metal: "#5a5a5a" },
  wall: (a, x, y, w, h) => hideWall(a, x, y, w, h),
  roof: (a, x, y, w, h) => tentRoof(a, x, y, w, h),
  ground: (a, x, y, w, h) => grad(a, x, y, w, h, "#7a4a2b", "#4a2c18"),
  spire: (a, cx, baseY, r) => {
    // Totem pole with a skull.
    rect(a, cx - r * 0.35, baseY - r * 2.2, r * 0.7, r * 2.2, "#5a3a1c");
    circle(a, cx, baseY - r * 2.3, r * 0.5, "#efe6d2", "#2b1d12", 0.6);
    rect(a, cx - r * 0.25, baseY - r * 2.4, r * 0.15, r * 0.15, "#2b1d12");
    rect(a, cx + r * 0.1, baseY - r * 2.4, r * 0.15, r * 0.15, "#2b1d12");
  },
  door: (a, x, y, w, h) => {
    // Hide flap tied open.
    poly(a, [[x, y], [x + w, y], [x + w * 0.9, y + h], [x + w * 0.1, y + h]], "#2b1d12");
    poly(a, [[x, y], [x + w * 0.45, y], [x + w * 0.2, y + h * 0.8]], "#8a6a44", "#3a2a1a", 0.6);
  },
  window: (a, x, y, w, h) => {
    // Skull nailed to the wall.
    circle(a, x + w / 2, y + h / 2, w * 0.5, "#efe6d2", "#2b1d12", 0.6);
    rect(a, x + w * 0.2, y + h * 0.35, w * 0.2, h * 0.25, "#2b1d12");
    rect(a, x + w * 0.6, y + h * 0.35, w * 0.2, h * 0.25, "#2b1d12");
  },
  banner: (a, x, y, w, h) => {
    // Ragged war banner on crossed spears.
    line(a, x - 0.02, y + h, x + w * 0.5, y - 0.03, "#3a2a1a", 1);
    line(a, x + w + 0.02, y + h, x + w * 0.5, y - 0.03, "#3a2a1a", 1);
    poly(a, [[x, y], [x + w, y], [x + w * 0.9, y + h * 0.5], [x + w, y + h * 0.7], [x + w * 0.6, y + h], [x + w * 0.3, y + h * 0.8], [x, y + h * 0.95]], a.color, "#2b1d12", 0.6);
  },
  ornament: (a) => {
    // Spiked palisade with a tusk gate ornament + fire pit.
    for (let i = 0; i < 8; i++) {
      const xx = 0.04 + i * 0.13;
      poly(a, [[xx, 0.99], [xx + 0.05, 0.99], [xx + 0.025, 0.86]], "#5a3a1c", "#2b1d12", 0.6);
    }
    for (const [tx, dir] of [[0.42, -1], [0.58, 1]] as const) {
      a.ctx.strokeStyle = "#efe6d2";
      a.ctx.lineWidth = LW(a, 1.6);
      a.ctx.beginPath();
      a.ctx.moveTo(X(a, tx), Y(a, 0.98));
      a.ctx.quadraticCurveTo(X(a, tx + dir * 0.02), Y(a, 0.9), X(a, tx + dir * 0.08), Y(a, 0.86));
      a.ctx.stroke();
    }
    // Flickering fire pit.
    const f = 0.02 + Math.abs(Math.sin(a.tick / 3)) * 0.015;
    circle(a, 0.88, 0.14, 0.05, "#3a2a1a");
    circle(a, 0.88, 0.13, 0.03 + f, "#ff7a1f");
    circle(a, 0.88, 0.12, 0.015 + f * 0.5, "#ffd27a");
  },
};

export const STYLES: Style[] = [stonework, thatch, plaster, ironSlate, warCamp];
export const STYLE_BY_ID: Record<string, Style> = Object.fromEntries(STYLES.map((s) => [s.id, s]));

// ───────────────────────────── buildings, composed from a style ─────────────────────────────

export function drawTownHall(a: ArtCtx, st: Style): void {
  shadow(a, 0.06, 0.1, 0.88, 0.86);
  st.ground(a, 0.04, 0.12, 0.92, 0.84);
  // Outer front wall with a gate.
  st.wall(a, 0.04, 0.72, 0.92, 0.24);
  // Corner towers.
  for (const [tx, ty] of [[0.02, 0.1], [0.82, 0.1], [0.02, 0.62], [0.82, 0.62]] as const) {
    st.wall(a, tx, ty + 0.1, 0.16, 0.2);
    st.spire(a, tx + 0.08, ty + 0.1, 0.09);
  }
  // Central keep with its own roof.
  st.wall(a, 0.28, 0.42, 0.44, 0.32);
  st.roof(a, 0.24, 0.2, 0.52, 0.22);
  // Keep tower + flag.
  st.wall(a, 0.44, 0.1, 0.12, 0.12);
  st.spire(a, 0.5, 0.1, 0.08);
  flag(a, 0.5, -0.12, 0.12, a.color);
  st.window(a, 0.33, 0.5, 0.06, 0.09);
  st.window(a, 0.61, 0.5, 0.06, 0.09);
  st.door(a, 0.43, 0.78, 0.14, 0.18);
  st.banner(a, 0.4, 0.62, 0.2, 0.16);
  st.ornament(a);
}

export function drawLumberMill(a: ArtCtx, st: Style): void {
  shadow(a, 0.06, 0.16, 0.86, 0.8);
  // Log pile (every style — it's what the mill *is*).
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3 - i; j++) {
      const cx = 0.09 + j * 0.09 + i * 0.045;
      const cy = 0.9 - i * 0.075;
      circle(a, cx, cy, 0.042, "#7a5230");
      circle(a, cx, cy, 0.028, "#c69a63");
    }
  st.wall(a, 0.3, 0.6, 0.62, 0.32);
  st.roof(a, 0.26, 0.24, 0.7, 0.36);
  st.door(a, 0.56, 0.72, 0.12, 0.2);
  st.window(a, 0.36, 0.68, 0.08, 0.08);
  st.window(a, 0.8, 0.68, 0.08, 0.08);
  // Saw blade on a bench.
  rect(a, 0.04, 0.5, 0.26, 0.05, st.palette.trimDark);
  const c = a.ctx;
  c.save();
  c.translate(X(a, 0.17), Y(a, 0.44));
  c.rotate(a.tick / 10);
  c.fillStyle = st.palette.metal;
  c.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 0.11 : 0.085;
    const ang = (i / 16) * Math.PI * 2;
    c.lineTo(Math.cos(ang) * r * a.w, Math.sin(ang) * r * a.w);
  }
  c.closePath();
  c.fill();
  c.fillStyle = st.palette.trimDark;
  c.beginPath();
  c.arc(0, 0, 0.025 * a.w, 0, Math.PI * 2);
  c.fill();
  c.restore();
  st.banner(a, 0.52, 0.58, 0.2, 0.08);
  circle(a, 0.86, 0.14, 0.055, "#8b6a44", "#5a3a1c", 0.6);
  st.ornament(a);
}

export function drawBarracks(a: ArtCtx, st: Style): void {
  shadow(a, 0.06, 0.14, 0.86, 0.82);
  st.wall(a, 0.08, 0.58, 0.84, 0.36);
  st.roof(a, 0.04, 0.2, 0.92, 0.38);
  st.door(a, 0.4, 0.7, 0.2, 0.24);
  st.window(a, 0.18, 0.66, 0.05, 0.12);
  st.window(a, 0.77, 0.66, 0.05, 0.12);
  st.banner(a, 0.26, 0.6, 0.1, 0.3);
  st.banner(a, 0.64, 0.6, 0.1, 0.3);
  // Crossed weapons on the gable + flag.
  line(a, 0.44, 0.1, 0.56, 0.32, st.palette.trimLight, 1.2);
  line(a, 0.56, 0.1, 0.44, 0.32, st.palette.trimLight, 1.2);
  flag(a, 0.5, 0.02, 0.12, a.color);
  // Training dummy in the yard.
  line(a, 0.9, 0.92, 0.9, 0.78, st.palette.trimDark, 1.5);
  rect(a, 0.865, 0.74, 0.07, 0.06, st.palette.trimLight);
  st.ornament(a);
}

export function drawShipyard(a: ArtCtx, st: Style): void {
  // Warehouse at the back.
  shadow(a, 0.06, 0.12, 0.6, 0.5);
  st.wall(a, 0.06, 0.4, 0.58, 0.2);
  st.roof(a, 0.02, 0.14, 0.66, 0.26);
  st.door(a, 0.28, 0.44, 0.12, 0.16);
  st.window(a, 0.12, 0.44, 0.07, 0.07);
  // Dock decking across the bottom and right — same in every style.
  grad(a, 0.0, 0.62, 1.0, 0.38, "#9b7a52", "#6e5436");
  grad(a, 0.68, 0.06, 0.32, 0.6, "#9b7a52", "#6e5436");
  hlines(a, 0, 0.62, 1, 0.38, 7, "rgba(0,0,0,0.35)", 0.5);
  for (let i = 1; i < 6; i++) line(a, 0.68 + i * 0.054, 0.06, 0.68 + i * 0.054, 0.62, "rgba(0,0,0,0.35)", 0.5);
  for (let i = 0; i < 6; i++) rect(a, 0.03 + i * 0.19, 0.95, 0.05, 0.07, "#4a3320");
  // Slipway with hull ribs.
  grad(a, 0.12, 0.68, 0.5, 0.26, "#5f4a34", "#3f3020");
  line(a, 0.16, 0.86, 0.58, 0.86, "#d9c09a", 2);
  const c = a.ctx;
  for (let i = 0; i < 6; i++) {
    c.strokeStyle = "#d9c09a";
    c.lineWidth = LW(a, 1.2);
    c.beginPath();
    c.arc(X(a, 0.2 + i * 0.07), Y(a, 0.86), 0.09 * a.w, Math.PI, 0);
    c.stroke();
  }
  // Crane.
  line(a, 0.8, 0.6, 0.8, 0.18, st.palette.trimDark, 2.2);
  line(a, 0.8, 0.2, 0.5, 0.36, st.palette.trimDark, 1.8);
  line(a, 0.8, 0.6, 0.62, 0.3, st.palette.trimDark, 1);
  const sway = Math.sin(a.tick / 15) * 0.01;
  line(a, 0.52 + sway, 0.35, 0.52 + sway, 0.62, "#e8dcc4", 0.8);
  rect(a, 0.49 + sway, 0.62, 0.06, 0.03, st.palette.metal);
  for (const [bx, by] of [[0.72, 0.7], [0.8, 0.7], [0.76, 0.78]] as const) circle(a, bx, by, 0.038, "#8b5a2b", "#3a2a1a", 0.7);
  flag(a, 0.8, 0.12, 0.1, a.color);
  st.banner(a, 0.44, 0.38, 0.16, 0.06);
}

export const STYLED_BUILDINGS: Record<string, (a: ArtCtx, st: Style) => void> = {
  townhall: drawTownHall,
  lumbermill: drawLumberMill,
  barracks: drawBarracks,
  shipyard: drawShipyard,
};
