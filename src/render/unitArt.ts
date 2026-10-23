import { shipSprite } from "./sprites";

/**
 * Procedural 3/4-view unit art. Each drawer paints a unit centred at (x, y) with
 * a nominal height `h` (pixels). Facing is 0..7 (0 = left, 2 = up, 4 = right, 6 = down);
 * sprites are drawn facing right and mirrored for leftward facings.
 *
 * `phase` is a 0..1 walk-cycle position (0 when standing still).
 */

export interface UnitArtCtx {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  h: number;
  color: string;
  facing: number;
  phase: number;
  moving: boolean;
  carrying: "gold" | "lumber" | null;
  /** Deterministic per-unit variation seed. */
  seed: number;
  /** Seconds of game time, for idle motion such as a hovering wingbeat. */
  time?: number;
  /** Skip the ground shadow (a body falling out of the sky casts its own). */
  noShadow?: boolean;
}

type UnitDrawer = (a: UnitArtCtx) => void;

// ───────────────────────────── helpers ─────────────────────────────

function withSprite(a: UnitArtCtx, draw: (c: CanvasRenderingContext2D, u: number) => void): void {
  const c = a.ctx;
  const u = a.h; // one "unit" = sprite height
  const left = a.facing === 7 || a.facing === 0 || a.facing === 1;
  c.save();
  c.translate(a.x, a.y);
  if (left) c.scale(-1, 1);
  // Walk bob.
  if (a.moving) c.translate(0, -Math.abs(Math.sin(a.phase * Math.PI * 2)) * u * 0.05);
  c.lineJoin = "round";
  c.lineCap = "round";
  draw(c, u);
  c.restore();
}

function shadow(a: UnitArtCtx): void {
  a.ctx.fillStyle = "rgba(0,0,0,0.32)";
  a.ctx.beginPath();
  a.ctx.ellipse(a.x, a.y + a.h * 0.42, a.h * 0.32, a.h * 0.13, 0, 0, Math.PI * 2);
  a.ctx.fill();
}

function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string, lw = 1): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}

function poly(c: CanvasRenderingContext2D, pts: Array<[number, number]>, fill: string): void {
  c.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

function legs(c: CanvasRenderingContext2D, u: number, phase: number, moving: boolean, color: string, width: number, hipY: number, footY: number): void {
  const swing = moving ? Math.sin(phase * Math.PI * 2) * u * 0.12 : 0;
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(-u * 0.08, hipY);
  c.lineTo(-u * 0.08 + swing, footY);
  c.moveTo(u * 0.08, hipY);
  c.lineTo(u * 0.08 - swing, footY);
  c.stroke();
}

function carried(c: CanvasRenderingContext2D, u: number, carrying: "gold" | "lumber" | null, x: number, y: number): void {
  if (!carrying) return;
  if (carrying === "gold") {
    // Sack of gold with a tie.
    ellipse(c, x, y, u * 0.12, u * 0.14, "#c9a469", "#6b4f2a", Math.max(0.75, u * 0.02));
    c.fillStyle = "#e8c547";
    c.fillRect(x - u * 0.04, y - u * 0.16, u * 0.08, u * 0.05);
  } else {
    // Bundle of logs over the shoulder.
    c.strokeStyle = "#7a5230";
    c.lineWidth = Math.max(2, u * 0.07);
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(x - u * 0.2, y + i * u * 0.05);
      c.lineTo(x + u * 0.2, y + i * u * 0.05 - u * 0.04);
      c.stroke();
    }
  }
}

// ───────────────────────────── Humans: Peasant ─────────────────────────────

const peasant: UnitDrawer = (a) => {
  shadow(a);
  withSprite(a, (c, u) => {
    const skin = "#e8b892";
    const lw = Math.max(0.75, u * 0.025);
    // Legs in brown hose, boots.
    legs(c, u, a.phase, a.moving, "#5a3d24", Math.max(2, u * 0.08), u * 0.14, u * 0.4);
    // Tunic (beige) with a player-colour belt sash.
    c.fillStyle = "#d9c59a";
    c.beginPath();
    c.moveTo(-u * 0.15, -u * 0.18);
    c.lineTo(u * 0.15, -u * 0.18);
    c.lineTo(u * 0.19, u * 0.16);
    c.lineTo(-u * 0.19, u * 0.16);
    c.closePath();
    c.fill();
    c.strokeStyle = "#8a6f45";
    c.lineWidth = lw;
    c.stroke();
    c.fillStyle = a.color;
    c.fillRect(-u * 0.18, u * 0.02, u * 0.36, u * 0.06);
    // Arms.
    c.strokeStyle = "#d9c59a";
    c.lineWidth = Math.max(2, u * 0.075);
    c.beginPath();
    c.moveTo(u * 0.12, -u * 0.1);
    c.lineTo(u * 0.24, u * 0.06);
    c.stroke();
    c.fillStyle = skin;
    c.fillRect(u * 0.21, u * 0.04, u * 0.06, u * 0.06);
    // Tool: hoe over the shoulder, or the load.
    if (!a.carrying) {
      c.strokeStyle = "#7a5230";
      c.lineWidth = Math.max(1.5, u * 0.04);
      c.beginPath();
      c.moveTo(-u * 0.04, -u * 0.08);
      c.lineTo(-u * 0.26, -u * 0.44);
      c.stroke();
      c.fillStyle = "#8a8f94";
      c.fillRect(-u * 0.34, -u * 0.48, u * 0.14, u * 0.05);
    } else {
      carried(c, u, a.carrying, -u * 0.14, -u * 0.3);
    }
    // Head with a player-colour cap.
    ellipse(c, u * 0.06, -u * 0.28, u * 0.12, u * 0.12, skin, "#a8795a", lw);
    c.fillStyle = a.color;
    c.beginPath();
    c.ellipse(u * 0.06, -u * 0.34, u * 0.13, u * 0.07, 0, Math.PI, 0);
    c.fill();
    c.fillRect(-u * 0.07, -u * 0.35, u * 0.26, u * 0.03);
    // Eyes + a hint of beard.
    c.fillStyle = "#2b2118";
    c.fillRect(u * 0.09, -u * 0.29, u * 0.03, u * 0.03);
    c.fillRect(u * 0.15, -u * 0.29, u * 0.03, u * 0.03);
    c.fillStyle = "#8a6f45";
    c.fillRect(u * 0.06, -u * 0.21, u * 0.12, u * 0.035);
  });
};

// ───────────────────────────── shared placeholders ─────────────────────────────

const footman: UnitDrawer = (a) => {
  shadow(a);
  withSprite(a, (c, u) => {
    legs(c, u, a.phase, a.moving, "#4a4a52", Math.max(2, u * 0.09), u * 0.14, u * 0.4);
    ellipse(c, 0, -u * 0.04, u * 0.18, u * 0.2, "#9aa0a6", "#4a4a52", Math.max(0.75, u * 0.025));
    c.fillStyle = a.color;
    c.fillRect(-u * 0.1, -u * 0.12, u * 0.2, u * 0.16);
    ellipse(c, u * 0.04, -u * 0.3, u * 0.11, u * 0.11, "#c4c9cd", "#4a4a52", Math.max(0.75, u * 0.025));
    // Shield + sword.
    ellipse(c, -u * 0.2, u * 0.0, u * 0.1, u * 0.14, a.color, "#4a4a52", Math.max(0.75, u * 0.025));
    c.strokeStyle = "#e6e9eb";
    c.lineWidth = Math.max(1.5, u * 0.04);
    c.beginPath();
    c.moveTo(u * 0.18, u * 0.02);
    c.lineTo(u * 0.3, -u * 0.34);
    c.stroke();
  });
};

const archer: UnitDrawer = (a) => {
  shadow(a);
  withSprite(a, (c, u) => {
    legs(c, u, a.phase, a.moving, "#4a5a34", Math.max(2, u * 0.08), u * 0.14, u * 0.4);
    ellipse(c, 0, -u * 0.04, u * 0.15, u * 0.19, "#6f8a48", "#3a4a26", Math.max(0.75, u * 0.025));
    c.fillStyle = a.color;
    c.fillRect(-u * 0.14, u * 0.02, u * 0.28, u * 0.05);
    ellipse(c, u * 0.04, -u * 0.3, u * 0.1, u * 0.1, "#e8b892", "#a8795a", Math.max(0.75, u * 0.025));
    c.fillStyle = a.color;
    c.beginPath();
    c.moveTo(-u * 0.08, -u * 0.34);
    c.lineTo(u * 0.16, -u * 0.34);
    c.lineTo(u * 0.06, -u * 0.5);
    c.closePath();
    c.fill();
    // Bow.
    c.strokeStyle = "#7a5230";
    c.lineWidth = Math.max(1.5, u * 0.04);
    c.beginPath();
    c.arc(u * 0.22, -u * 0.06, u * 0.22, -Math.PI / 2.2, Math.PI / 2.2);
    c.stroke();
    c.strokeStyle = "#e8dcc4";
    c.lineWidth = Math.max(0.75, u * 0.015);
    c.beginPath();
    c.moveTo(u * 0.22 + Math.cos(-Math.PI / 2.2) * u * 0.22, -u * 0.06 + Math.sin(-Math.PI / 2.2) * u * 0.22);
    c.lineTo(u * 0.22 + Math.cos(Math.PI / 2.2) * u * 0.22, -u * 0.06 + Math.sin(Math.PI / 2.2) * u * 0.22);
    c.stroke();
  });
};

/**
 * Any ship with a painting: draw the painting.
 *
 * The hull sits low with a wake behind it and rocks a degree or two on the
 * swell, which is what sells a boat as floating rather than sliding. The
 * drawer falls back to the hand-drawn longboat below while the image loads.
 */
function paintedShip(def: string): UnitDrawer {
  return (a) => {
    const img = shipSprite(def);
    if (!img) {
      longboatDrawn(a);
      return;
    }
    const c = a.ctx;
    const u = a.h;
    const w = u * 2.1;
    const h = (img.naturalHeight / img.naturalWidth) * w;
    const left = a.facing === 7 || a.facing === 0 || a.facing === 1;
    c.save();
    c.translate(a.x, a.y);
    // Wake first, in world space, so mirroring the hull does not mirror it onto
    // the bow.
    c.strokeStyle = "rgba(255,255,255,0.3)";
    c.lineWidth = Math.max(1, u * 0.035);
    c.beginPath();
    const back = left ? 1 : -1;
    c.moveTo(back * w * 0.28, u * 0.1);
    c.lineTo(back * w * 0.6, u * 0.22);
    c.moveTo(back * w * 0.28, u * 0.18);
    c.lineTo(back * w * 0.55, u * 0.34);
    c.stroke();
    if (left) c.scale(-1, 1);
    // Swell: a slow roll and a little heave, out of phase so it does not tick.
    c.rotate(Math.sin(a.phase * Math.PI * 2 + a.seed) * 0.03);
    c.translate(0, Math.sin(a.phase * Math.PI * 2 * 0.7 + a.seed) * u * 0.04);
    c.drawImage(img, -w / 2, -h * 0.78, w, h);
    c.restore();
  };
}

const longboatDrawn: UnitDrawer = (a) => {
  const c = a.ctx;
  const u = a.h;
  c.save();
  c.translate(a.x, a.y);
  const left = a.facing === 7 || a.facing === 0 || a.facing === 1;
  if (left) c.scale(-1, 1);
  // Bob on the water.
  c.translate(0, Math.sin(a.phase * Math.PI * 2 + a.seed) * u * 0.03);
  // Wake.
  c.strokeStyle = "rgba(255,255,255,0.35)";
  c.lineWidth = Math.max(1, u * 0.03);
  c.beginPath();
  c.moveTo(-u * 0.5, u * 0.12);
  c.lineTo(-u * 0.9, u * 0.22);
  c.moveTo(-u * 0.5, u * 0.2);
  c.lineTo(-u * 0.85, u * 0.34);
  c.stroke();
  // Hull.
  c.fillStyle = "#5a3d28";
  c.beginPath();
  c.moveTo(-u * 0.55, 0);
  c.quadraticCurveTo(0, u * 0.36, u * 0.55, 0);
  c.quadraticCurveTo(u * 0.7, -u * 0.12, u * 0.62, -u * 0.22);
  c.lineTo(-u * 0.45, u * 0.02);
  c.closePath();
  c.fill();
  c.strokeStyle = "#3a2617";
  c.lineWidth = Math.max(0.75, u * 0.025);
  c.stroke();
  // Shields along the gunwale.
  for (let i = -2; i <= 2; i++) ellipse(c, i * u * 0.18, u * 0.04, u * 0.07, u * 0.07, i % 2 === 0 ? a.color : "#c9a469", "#3a2617", Math.max(0.5, u * 0.015));
  // Mast + sail.
  c.strokeStyle = "#3a2617";
  c.lineWidth = Math.max(1.5, u * 0.05);
  c.beginPath();
  c.moveTo(0, u * 0.02);
  c.lineTo(0, -u * 0.7);
  c.stroke();
  c.fillStyle = "#efe6d2";
  c.beginPath();
  c.moveTo(u * 0.02, -u * 0.66);
  c.quadraticCurveTo(u * 0.5, -u * 0.4, u * 0.02, -u * 0.1);
  c.closePath();
  c.fill();
  c.fillStyle = a.color;
  c.beginPath();
  c.moveTo(u * 0.02, -u * 0.5);
  c.quadraticCurveTo(u * 0.32, -u * 0.4, u * 0.02, -u * 0.26);
  c.closePath();
  c.fill();
  c.restore();
};

/** Aircraft: drawn from above, banked into the direction of travel. */
function aircraft(a: UnitArtCtx, wingspan: number, twin: boolean): void {
  const c = a.ctx;
  const u = a.h;
  // Shadow cast on the ground below and behind — sells the altitude.
  c.fillStyle = "rgba(0,0,0,0.28)";
  c.beginPath();
  c.ellipse(a.x + u * 0.18, a.y + u * 0.55, u * wingspan * 0.42, u * 0.14, 0, 0, Math.PI * 2);
  c.fill();

  c.save();
  c.translate(a.x, a.y - u * 0.25 + Math.sin(a.phase * Math.PI * 2 + a.seed) * u * 0.03);
  // 0 = left … 4 = right; rotate the plan view to match the facing.
  c.rotate((a.facing / 8) * Math.PI * 2 + Math.PI);
  const L = u * 0.55;
  const W = u * wingspan;
  // Wings.
  c.fillStyle = "#cfd4d8";
  c.beginPath();
  c.moveTo(-L * 0.1, -W / 2);
  c.lineTo(L * 0.18, -W / 2);
  c.lineTo(L * 0.1, W / 2);
  c.lineTo(-L * 0.18, W / 2);
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(0,0,0,0.4)";
  c.lineWidth = Math.max(0.6, u * 0.015);
  c.stroke();
  // Player-colour roundels.
  c.fillStyle = a.color;
  for (const wy of [-W * 0.3, W * 0.3]) {
    c.beginPath();
    c.arc(0, wy, u * 0.06, 0, Math.PI * 2);
    c.fill();
  }
  // Fuselage.
  c.fillStyle = "#8d949a";
  c.beginPath();
  c.ellipse(0, 0, L * 0.55, u * 0.09, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "rgba(0,0,0,0.45)";
  c.stroke();
  // Tailplane.
  c.fillStyle = "#cfd4d8";
  c.beginPath();
  c.moveTo(-L * 0.45, -W * 0.16);
  c.lineTo(-L * 0.3, -W * 0.16);
  c.lineTo(-L * 0.3, W * 0.16);
  c.lineTo(-L * 0.45, W * 0.16);
  c.closePath();
  c.fill();
  // Cockpit.
  c.fillStyle = "#2d3b47";
  c.beginPath();
  c.ellipse(L * 0.16, 0, L * 0.13, u * 0.055, 0, 0, Math.PI * 2);
  c.fill();
  // Spinning propellers — blurred discs.
  const spin = 0.35 + 0.25 * Math.abs(Math.sin(a.phase * Math.PI * 8));
  c.fillStyle = `rgba(230,235,240,${spin})`;
  const props: Array<[number, number]> = twin ? [[L * 0.1, -W * 0.28], [L * 0.1, W * 0.28]] : [[L * 0.55, 0]];
  for (const [px, py] of props) {
    c.beginPath();
    c.ellipse(px, py, u * 0.03, u * 0.16, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** Cavalry: a horse in profile with a rider, drawn a little larger than infantry. */
const knight: UnitDrawer = (a) => {
  shadow(a);
  withSprite(a, (c, u) => {
    const lw = Math.max(0.75, u * 0.025);
    const gait = a.moving ? Math.sin(a.phase * Math.PI * 2) : 0;
    // Legs, front pair and back pair swinging in opposition.
    c.strokeStyle = "#4a3320";
    c.lineWidth = Math.max(2, u * 0.06);
    for (const [lx, dir] of [[-0.22, 1], [-0.14, -1], [0.14, -1], [0.22, 1]] as const) {
      c.beginPath();
      c.moveTo(lx * u, u * 0.12);
      c.lineTo((lx + dir * gait * 0.1) * u, u * 0.4);
      c.stroke();
    }
    // Barrel and neck.
    ellipse(c, 0, 0, u * 0.32, u * 0.16, "#6b4a2b", "#3a2a1a", lw);
    c.strokeStyle = "#6b4a2b";
    c.lineWidth = Math.max(2, u * 0.11);
    c.beginPath();
    c.moveTo(u * 0.2, -u * 0.04);
    c.lineTo(u * 0.38, -u * 0.26);
    c.stroke();
    // Head.
    ellipse(c, u * 0.42, -u * 0.3, u * 0.11, u * 0.07, "#6b4a2b", "#3a2a1a", lw);
    // Tail and mane.
    c.strokeStyle = "#3a2a1a";
    c.lineWidth = Math.max(1.5, u * 0.04);
    c.beginPath();
    c.moveTo(-u * 0.3, -u * 0.04);
    c.lineTo(-u * 0.44, u * 0.14);
    c.moveTo(u * 0.3, -u * 0.2);
    c.lineTo(u * 0.2, -u * 0.06);
    c.stroke();
    // Caparison in the player colour.
    c.fillStyle = a.color;
    c.beginPath();
    c.moveTo(-u * 0.2, -u * 0.1);
    c.lineTo(u * 0.06, -u * 0.1);
    c.lineTo(u * 0.02, u * 0.18);
    c.lineTo(-u * 0.2, u * 0.16);
    c.closePath();
    c.fill();
    // Rider.
    ellipse(c, -u * 0.04, -u * 0.24, u * 0.11, u * 0.14, "#9aa0a6", "#4a4a52", lw);
    ellipse(c, -u * 0.02, -u * 0.42, u * 0.08, u * 0.08, "#c4c9cd", "#4a4a52", lw);
    c.fillStyle = a.color;
    c.fillRect(-u * 0.09, -u * 0.5, u * 0.14, u * 0.05);
    // Lance couched forward.
    c.strokeStyle = "#c9a469";
    c.lineWidth = Math.max(1.5, u * 0.035);
    c.beginPath();
    c.moveTo(-u * 0.2, -u * 0.18);
    c.lineTo(u * 0.52, -u * 0.34);
    c.stroke();
  });
};

/** Caster: robed, hooded, with a staff whose crystal pulses. */
const mage: UnitDrawer = (a) => {
  shadow(a);
  withSprite(a, (c, u) => {
    const lw = Math.max(0.75, u * 0.025);
    // Robe: a bell shape rather than legs, so it reads as gliding.
    c.fillStyle = a.color;
    c.beginPath();
    c.moveTo(-u * 0.1, -u * 0.2);
    c.lineTo(u * 0.1, -u * 0.2);
    c.quadraticCurveTo(u * 0.24, u * 0.24, u * 0.2, u * 0.4);
    c.lineTo(-u * 0.2, u * 0.4);
    c.quadraticCurveTo(-u * 0.24, u * 0.24, -u * 0.1, -u * 0.2);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(0,0,0,0.45)";
    c.lineWidth = lw;
    c.stroke();
    // Hem trim, brighter than the robe.
    c.fillStyle = "#efe6d2";
    c.fillRect(-u * 0.2, u * 0.34, u * 0.4, u * 0.05);
    // Hood and shadowed face.
    c.fillStyle = a.color;
    c.beginPath();
    c.moveTo(-u * 0.13, -u * 0.18);
    c.quadraticCurveTo(0, -u * 0.52, u * 0.13, -u * 0.18);
    c.closePath();
    c.fill();
    ellipse(c, u * 0.01, -u * 0.24, u * 0.075, u * 0.08, "#3a2f28");
    c.fillStyle = "#8fd0ff";
    c.fillRect(u * 0.02, -u * 0.27, u * 0.035, u * 0.02);
    // Staff with a crystal that pulses in time with the walk phase.
    c.strokeStyle = "#6b4a2b";
    c.lineWidth = Math.max(1.5, u * 0.035);
    c.beginPath();
    c.moveTo(u * 0.22, u * 0.34);
    c.lineTo(u * 0.3, -u * 0.42);
    c.stroke();
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(a.phase * Math.PI * 2 + a.seed));
    c.fillStyle = `rgba(120,190,255,${pulse})`;
    c.beginPath();
    c.moveTo(u * 0.3, -u * 0.56);
    c.lineTo(u * 0.37, -u * 0.45);
    c.lineTo(u * 0.3, -u * 0.36);
    c.lineTo(u * 0.23, -u * 0.45);
    c.closePath();
    c.fill();
    c.fillStyle = `rgba(220,240,255,${pulse * 0.9})`;
    c.beginPath();
    c.arc(u * 0.3, -u * 0.46, u * 0.025, 0, Math.PI * 2);
    c.fill();
  });
};

/** Human support caster: white-and-blue robes, gold stole and a healing staff. */
const priest: UnitDrawer = (a) => {
  shadow(a);
  withSprite(a, (c, u) => {
    const lw = Math.max(0.75, u * 0.025);
    const sway = a.moving ? Math.sin(a.phase * Math.PI * 2) * u * 0.03 : 0;
    // Robes and boots.
    legs(c, u, a.phase, a.moving, "#4a4034", Math.max(2, u * 0.065), u * 0.14, u * 0.4);
    c.fillStyle = "#e9e3d4";
    c.beginPath();
    c.moveTo(-u * 0.13, -u * 0.2);
    c.lineTo(u * 0.13, -u * 0.2);
    c.lineTo(u * 0.23, u * 0.38);
    c.lineTo(-u * 0.23, u * 0.38);
    c.closePath();
    c.fill();
    c.strokeStyle = "#897d6b";
    c.lineWidth = lw;
    c.stroke();
    // Player-colour shoulder cape and gold stole.
    c.fillStyle = a.color;
    c.beginPath();
    c.moveTo(-u * 0.16, -u * 0.18);
    c.lineTo(u * 0.16, -u * 0.18);
    c.lineTo(u * 0.12, -u * 0.02);
    c.lineTo(-u * 0.12, -u * 0.02);
    c.closePath();
    c.fill();
    c.fillStyle = "#d9b84c";
    c.fillRect(-u * 0.035, -u * 0.1, u * 0.07, u * 0.37);
    // Head and hood.
    ellipse(c, 0, -u * 0.32, u * 0.1, u * 0.1, "#e8b892", "#a8795a", lw);
    c.strokeStyle = a.color;
    c.lineWidth = Math.max(2, u * 0.055);
    c.beginPath();
    c.arc(0, -u * 0.34, u * 0.12, Math.PI, Math.PI * 2);
    c.stroke();
    // Staff and holy crystal.
    c.strokeStyle = "#76552f";
    c.lineWidth = Math.max(1.5, u * 0.035);
    c.beginPath();
    c.moveTo(u * 0.2, u * 0.34);
    c.lineTo(u * 0.25 + sway, -u * 0.48);
    c.stroke();
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(a.phase * Math.PI * 2 + a.seed));
    c.fillStyle = `rgba(145,245,175,${pulse})`;
    c.beginPath();
    c.arc(u * 0.25 + sway, -u * 0.5, u * 0.07, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#f4df73";
    c.lineWidth = Math.max(1, u * 0.018);
    c.stroke();
  });
};

/**
 * Gryphon Rider, seen side-on in flight: a tawny lion body with a white eagle
 * head, two layered feathered wings that beat steadily (faster when on the
 * move), a tufted tail, and an armoured rider in his kingdom's colour raising a
 * storm hammer. Always airborne -- the shadow sits well below and shrinks as he
 * rises on each wingbeat.
 */
const gryphon: UnitDrawer = (a) => {
  const c = a.ctx;
  const u = a.h * 1.35;
  const t = a.time ?? 0;
  const beat = (t * (a.moving ? 2.3 : 1.3) + a.seed * 0.17) % 1;
  const flap = Math.sin(beat * Math.PI * 2); // +1 wings up, -1 wings down
  const lift = -flap * u * 0.035 - u * 0.2;
  const lw = Math.max(0.75, u * 0.016);
  const left = a.facing === 7 || a.facing === 0 || a.facing === 1;

  // Ground shadow, well below: he is flying.
  if (!a.noShadow) {
  c.save();
  c.fillStyle = "rgba(0,0,0,0.26)";
  c.beginPath();
  const sw = u * (0.42 + flap * 0.03);
  c.ellipse(a.x, a.y + a.h * 0.45, sw, sw * 0.32, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  }

  c.save();
  c.translate(a.x, a.y + lift);
  if (left) c.scale(-1, 1);
  c.lineJoin = "round";
  c.lineCap = "round";

  const feather = (x0: number, y0: number, x1: number, y1: number, wdt: number, fill: string, edge: string) => {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * wdt, ny = dx / len * wdt;
    c.beginPath();
    c.moveTo(x0, y0);
    c.quadraticCurveTo(x0 + dx * 0.5 + nx, y0 + dy * 0.5 + ny, x1, y1);
    c.quadraticCurveTo(x0 + dx * 0.5 - nx * 0.6, y0 + dy * 0.5 - ny * 0.6, x0, y0);
    c.fillStyle = fill;
    c.fill();
    c.strokeStyle = edge;
    c.lineWidth = lw * 0.8;
    c.stroke();
  };

  // One wing, rooted at the shoulder, swept back. `far` is the wing on the other
  // side of the body: darker and a touch smaller.
  const wing = (far: boolean) => {
    c.save();
    c.translate(u * 0.02, -u * 0.12);
    const ang = 0.3 + flap * (far ? 0.75 : 0.85);
    c.rotate(ang);
    c.scale(far ? 0.88 : 1, 0.7 + 0.3 * Math.abs(flap));
    const k = far ? 0.72 : 1;
    const shade = (r: number, g: number, b: number) => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
    const edge = shade(70, 46, 24);
    // Primaries: long dark flight feathers fanning from the wrist.
    const wx = -u * 0.42, wy = -u * 0.06;
    for (let i = 0; i < 6; i++) {
      const f = i / 5;
      const a0 = -2.75 + f * 0.95;
      const len = u * (0.42 - f * 0.12);
      feather(wx + f * u * 0.12, wy + f * u * 0.03, wx + f * u * 0.12 + Math.cos(a0) * len, wy + f * u * 0.03 + Math.sin(a0) * len * -1 + u * 0.02,
        u * 0.05, i % 2 ? shade(92, 62, 34) : shade(80, 53, 29), edge);
    }
    // Secondaries along the arm.
    for (let i = 0; i < 6; i++) {
      const f = i / 5;
      const rx = -u * 0.06 - f * u * 0.34, ry = -u * 0.01 - f * u * 0.04;
      feather(rx, ry, rx - u * 0.1, ry + u * (0.24 - f * 0.04), u * 0.045, shade(140, 98, 52), edge);
    }
    // Coverts: the soft golden top of the wing.
    c.beginPath();
    c.moveTo(u * 0.04, -u * 0.02);
    c.quadraticCurveTo(-u * 0.2, -u * 0.14, -u * 0.5, -u * 0.08);
    c.quadraticCurveTo(-u * 0.3, u * 0.1, u * 0.02, u * 0.08);
    c.closePath();
    const g = c.createLinearGradient(0, -u * 0.12, 0, u * 0.1);
    g.addColorStop(0, shade(226, 182, 104));
    g.addColorStop(1, shade(170, 118, 60));
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = edge;
    c.lineWidth = lw;
    c.stroke();
    // Scalloped covert rows.
    c.strokeStyle = shade(120, 82, 42);
    c.lineWidth = lw * 0.8;
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 5; i++) {
        const cx = -u * (0.06 + i * 0.09 + r * 0.04), cy = u * (0.0 + r * 0.05);
        c.beginPath();
        c.arc(cx, cy, u * 0.035, 0.2, Math.PI - 0.2);
        c.stroke();
      }
    c.restore();
  };

  wing(true);

  // Tail: a lion's, curling up with a dark tuft.
  c.strokeStyle = "#a8743a";
  c.lineWidth = Math.max(2, u * 0.035);
  c.beginPath();
  c.moveTo(-u * 0.26, u * 0.02);
  c.bezierCurveTo(-u * 0.44, u * 0.04, -u * 0.48, -u * 0.12 + flap * u * 0.03, -u * 0.58, -u * 0.08 + flap * u * 0.04);
  c.stroke();
  ellipse(c, -u * 0.6, -u * 0.08 + flap * u * 0.04, u * 0.045, u * 0.03, "#5a3a1c", "#3a2410", lw);

  // Hind legs, trailing back in flight.
  c.strokeStyle = "#9a6a34";
  c.lineWidth = Math.max(2, u * 0.06);
  c.beginPath();
  c.moveTo(-u * 0.16, u * 0.06);
  c.quadraticCurveTo(-u * 0.24, u * 0.18, -u * 0.36, u * 0.17);
  c.stroke();
  ellipse(c, -u * 0.37, u * 0.17, u * 0.035, u * 0.025, "#7a5228");

  // Lion body.
  const bg = c.createLinearGradient(0, -u * 0.14, 0, u * 0.14);
  bg.addColorStop(0, "#d9a45a");
  bg.addColorStop(1, "#9a6630");
  c.beginPath();
  c.ellipse(-u * 0.03, u * 0.0, u * 0.25, u * 0.13, -0.08, 0, Math.PI * 2);
  c.fillStyle = bg;
  c.fill();
  c.strokeStyle = "#5f3f1e";
  c.lineWidth = lw;
  c.stroke();

  // Eagle forelegs, talons tucked.
  c.strokeStyle = "#d9b23a";
  c.lineWidth = Math.max(1.5, u * 0.035);
  c.beginPath();
  c.moveTo(u * 0.14, u * 0.07);
  c.lineTo(u * 0.2, u * 0.19);
  c.lineTo(u * 0.27, u * 0.2);
  c.stroke();
  c.strokeStyle = "#2a2014";
  c.lineWidth = Math.max(1, u * 0.015);
  for (const d of [0, 0.03]) {
    c.beginPath();
    c.moveTo(u * (0.27 + d), u * 0.2);
    c.lineTo(u * (0.3 + d), u * 0.235);
    c.stroke();
  }

  // Saddle cloth in the kingdom's colour, gold-trimmed.
  c.beginPath();
  c.moveTo(-u * 0.13, -u * 0.08);
  c.lineTo(u * 0.08, -u * 0.1);
  c.lineTo(u * 0.06, u * 0.08);
  c.lineTo(-u * 0.11, u * 0.09);
  c.closePath();
  c.fillStyle = a.color;
  c.fill();
  c.strokeStyle = "#e7c35a";
  c.lineWidth = Math.max(1, u * 0.02);
  c.stroke();

  // White feathered neck ruff and eagle head.
  c.beginPath();
  c.moveTo(u * 0.1, -u * 0.08);
  c.quadraticCurveTo(u * 0.2, -u * 0.28, u * 0.32, -u * 0.26);
  c.quadraticCurveTo(u * 0.34, -u * 0.1, u * 0.2, u * 0.07);
  c.closePath();
  c.fillStyle = "#f1ebda";
  c.fill();
  c.strokeStyle = "#857a62";
  c.lineWidth = lw;
  c.stroke();
  // ruff scallops
  c.strokeStyle = "#c9bfa6";
  c.lineWidth = lw * 0.8;
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.arc(u * (0.17 + i * 0.03), -u * (0.02 + i * 0.07), u * 0.04, 0.3, Math.PI - 0.3);
    c.stroke();
  }
  ellipse(c, u * 0.31, -u * 0.29, u * 0.085, u * 0.075, "#f6f1e4", "#857a62", lw);
  // ear tufts
  poly(c, [[u * 0.25, -u * 0.33], [u * 0.2, -u * 0.42], [u * 0.29, -u * 0.35]], "#e6dcc4");
  // hooked golden beak
  c.beginPath();
  c.moveTo(u * 0.37, -u * 0.32);
  c.quadraticCurveTo(u * 0.5, -u * 0.32, u * 0.5, -u * 0.24);
  c.quadraticCurveTo(u * 0.45, -u * 0.27, u * 0.38, -u * 0.25);
  c.closePath();
  c.fillStyle = "#e9b52a";
  c.fill();
  c.strokeStyle = "#7a5410";
  c.lineWidth = lw;
  c.stroke();
  // fierce eye and brow
  ellipse(c, u * 0.335, -u * 0.305, u * 0.016, u * 0.016, "#1a140c");
  c.strokeStyle = "#5a4a32";
  c.lineWidth = Math.max(1, u * 0.02);
  c.beginPath();
  c.moveTo(u * 0.3, -u * 0.335);
  c.lineTo(u * 0.36, -u * 0.32);
  c.stroke();

  // The near wing goes under the rider, so he is never lost behind a wingbeat.
  wing(false);

  // The rider: armoured, in his colour, hammer raised.
  const swing = a.moving ? 0 : Math.sin(t * 1.3 + a.seed) * 0.08;
  // body
  c.beginPath();
  c.moveTo(-u * 0.07, -u * 0.08);
  c.lineTo(u * 0.05, -u * 0.08);
  c.lineTo(u * 0.04, -u * 0.25);
  c.lineTo(-u * 0.05, -u * 0.25);
  c.closePath();
  const ag = c.createLinearGradient(-u * 0.07, 0, u * 0.05, 0);
  ag.addColorStop(0, "#7c848c");
  ag.addColorStop(0.5, "#dfe4e8");
  ag.addColorStop(1, "#8a9299");
  c.fillStyle = ag;
  c.fill();
  c.strokeStyle = "#3d4247";
  c.lineWidth = lw;
  c.stroke();
  // tabard
  c.fillStyle = a.color;
  c.fillRect(-u * 0.035, -u * 0.22, u * 0.06, u * 0.13);
  // shield on the far side
  ellipse(c, -u * 0.08, -u * 0.15, u * 0.05, u * 0.065, a.color, "#e7c35a", Math.max(1, u * 0.015));
  // helmet with plume
  ellipse(c, -u * 0.005, -u * 0.29, u * 0.05, u * 0.05, "#c7cdd2", "#3d4247", lw);
  c.fillStyle = "#2b2f33";
  c.fillRect(u * 0.0, -u * 0.3, u * 0.045, u * 0.012);
  c.strokeStyle = a.color;
  c.lineWidth = Math.max(1.5, u * 0.03);
  c.beginPath();
  c.moveTo(-u * 0.01, -u * 0.335);
  c.quadraticCurveTo(-u * 0.08, -u * 0.39, -u * 0.13, -u * 0.33 + flap * u * 0.01);
  c.stroke();
  // hammer arm
  c.save();
  c.translate(u * 0.04, -u * 0.22);
  c.rotate(-0.5 + swing);
  c.strokeStyle = "#aeb5bb";
  c.lineWidth = Math.max(1.5, u * 0.03);
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(u * 0.05, -u * 0.07);
  c.stroke();
  c.strokeStyle = "#6b4a2a";
  c.lineWidth = Math.max(1.2, u * 0.018);
  c.beginPath();
  c.moveTo(u * 0.04, -u * 0.03);
  c.lineTo(u * 0.08, -u * 0.17);
  c.stroke();
  // hammer head, with a faint storm glow
  c.shadowColor = "rgba(150,210,255,0.9)";
  c.shadowBlur = u * 0.06;
  c.fillStyle = "#c9d2da";
  c.fillRect(u * 0.035, -u * 0.215, u * 0.09, u * 0.055);
  c.shadowBlur = 0;
  c.strokeStyle = "#454c52";
  c.lineWidth = lw;
  c.strokeRect(u * 0.035, -u * 0.215, u * 0.09, u * 0.055);
  c.restore();
  c.restore();
};

/** Siege engine: a heavy bow on a wheeled carriage, seen three-quarters on. */
const ballista: UnitDrawer = (a) => {
  shadow(a);
  withSprite(a, (c, u) => {
    const lw = Math.max(0.75, u * 0.025);
    // Wheels, turning as it rolls.
    for (const wx of [-u * 0.22, u * 0.22]) {
      ellipse(c, wx, u * 0.24, u * 0.16, u * 0.16, "#4a3320", "#2b1d12", lw);
      c.strokeStyle = "#7a5230";
      c.lineWidth = Math.max(1, u * 0.022);
      for (let i = 0; i < 4; i++) {
        const ang = a.phase * Math.PI * 2 + (i / 4) * Math.PI;
        c.beginPath();
        c.moveTo(wx - Math.cos(ang) * u * 0.13, u * 0.24 - Math.sin(ang) * u * 0.13);
        c.lineTo(wx + Math.cos(ang) * u * 0.13, u * 0.24 + Math.sin(ang) * u * 0.13);
        c.stroke();
      }
    }
    // Carriage bed and the trail dragging behind.
    c.fillStyle = "#6b4a2b";
    c.fillRect(-u * 0.32, u * 0.06, u * 0.64, u * 0.14);
    c.strokeStyle = "#3a2a1a";
    c.lineWidth = lw;
    c.strokeRect(-u * 0.32, u * 0.06, u * 0.64, u * 0.14);
    c.strokeStyle = "#5a3d24";
    c.lineWidth = Math.max(2, u * 0.05);
    c.beginPath();
    c.moveTo(-u * 0.3, u * 0.12);
    c.lineTo(-u * 0.52, u * 0.3);
    c.stroke();
    // Stock running forward, and the bolt sitting in its groove.
    c.fillStyle = "#7a5230";
    c.fillRect(-u * 0.18, -u * 0.1, u * 0.62, u * 0.1);
    c.fillStyle = "#c9b18a";
    c.fillRect(u * 0.06, -u * 0.07, u * 0.5, u * 0.035);
    c.fillStyle = "#8a8f94";
    c.beginPath();
    c.moveTo(u * 0.56, -u * 0.085);
    c.lineTo(u * 0.68, -u * 0.052);
    c.lineTo(u * 0.56, -u * 0.02);
    c.closePath();
    c.fill();
    // Bow arms and string, drawn back.
    c.strokeStyle = "#4a3320";
    c.lineWidth = Math.max(2, u * 0.055);
    c.beginPath();
    c.moveTo(u * 0.1, -u * 0.36);
    c.quadraticCurveTo(u * 0.28, -u * 0.16, u * 0.12, -u * 0.05);
    c.moveTo(u * 0.1, u * 0.2);
    c.quadraticCurveTo(u * 0.28, u * 0.02, u * 0.12, -u * 0.05);
    c.stroke();
    c.strokeStyle = "#e8dcc4";
    c.lineWidth = Math.max(0.75, u * 0.018);
    c.beginPath();
    c.moveTo(u * 0.1, -u * 0.36);
    c.lineTo(u * 0.02, -u * 0.06);
    c.lineTo(u * 0.1, u * 0.2);
    c.stroke();
    // Crew banner in the player colour.
    c.fillStyle = a.color;
    c.fillRect(-u * 0.36, -u * 0.34, u * 0.05, u * 0.26);
    poly(c, [[-u * 0.31, -u * 0.34], [-u * 0.12, -u * 0.28], [-u * 0.31, -u * 0.2]], a.color);
  });
};

const scout: UnitDrawer = (a) => aircraft(a, 0.75, false);
const bomber: UnitDrawer = (a) => aircraft(a, 1.05, true);

/**
 * A bear, drawn rather than painted: heavy at the shoulder, low head, short
 * legs, and no colour that belongs to any player -- nothing out here is on
 * anybody's side. Enough silhouette to be unmistakable at a glance, which is
 * what matters when one is coming at your only peasant.
 */
const bear: UnitDrawer = (a) => {
  withSprite(a, (c, u) => {
    const brown = "#4a3524";
    // Shadow.
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath();
    c.ellipse(0, 0, u * 0.42, u * 0.14, 0, 0, Math.PI * 2);
    c.fill();
    // Legs, swinging with the gait.
    const sw = a.moving ? Math.sin(a.phase * Math.PI * 2) * u * 0.1 : 0;
    c.strokeStyle = "#33241a";
    c.lineWidth = u * 0.13;
    for (const [lx, ph] of [
      [-0.26, 1],
      [0.22, -1],
    ] as const) {
      c.beginPath();
      c.moveTo(u * lx, -u * 0.3);
      c.lineTo(u * lx + sw * ph, -u * 0.02);
      c.stroke();
    }
    // Body: a long heavy barrel with the hump over the shoulders.
    c.fillStyle = brown;
    c.beginPath();
    c.moveTo(-u * 0.42, -u * 0.28);
    c.quadraticCurveTo(-u * 0.3, -u * 0.72, u * 0.04, -u * 0.66);
    c.quadraticCurveTo(u * 0.36, -u * 0.62, u * 0.42, -u * 0.34);
    c.quadraticCurveTo(u * 0.2, -u * 0.16, -u * 0.42, -u * 0.28);
    c.closePath();
    c.fill();
    // Head, low and forward.
    c.beginPath();
    c.ellipse(u * 0.46, -u * 0.42, u * 0.17, u * 0.14, -0.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2b1e15";
    c.beginPath();
    c.ellipse(u * 0.6, -u * 0.4, u * 0.07, u * 0.05, -0.2, 0, Math.PI * 2);
    c.fill();
    // Ear.
    c.fillStyle = brown;
    c.beginPath();
    c.arc(u * 0.38, -u * 0.56, u * 0.06, 0, Math.PI * 2);
    c.fill();
    // Eye: a single spot of light, so it reads as alive rather than as a rock.
    c.fillStyle = "#e8d9b0";
    c.beginPath();
    c.arc(u * 0.5, -u * 0.46, u * 0.022, 0, Math.PI * 2);
    c.fill();
  });
};

const HUMAN_UNITS: Record<string, UnitDrawer> = {
  bear,
  barbarian: (a) => footman({ ...a, color: "#a05232" }),
  worker: peasant,
  footman,
  archer,
  longboat: paintedShip("longboat"),
  transport: paintedShip("transport"),
  submarine: paintedShip("submarine"),
  battleship: paintedShip("battleship"),
  icebreaker: paintedShip("icebreaker"),
  tanker: paintedShip("tanker"),
  scout,
  bomber,
  gryphon,
  knight,
  mage,
  priest,
  ballista,
};

export const FACTION_UNIT_ART: Record<string, Record<string, UnitDrawer>> = {
  human: HUMAN_UNITS,
};

export function unitArtFor(faction: string, def: string): UnitDrawer | undefined {
  return (FACTION_UNIT_ART[faction] ?? HUMAN_UNITS)[def];
}

