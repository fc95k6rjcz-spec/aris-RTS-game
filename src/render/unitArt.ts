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

/**
 * The rest of the wildlife: one quadruped, four ways.
 *
 * Deer, cows, sheep and wolves were on the map for a long time with no art at
 * all, which meant the simulation faithfully modelled a herd of coloured
 * circles. They share a skeleton -- a barrel on four legs with a head at one
 * end -- and differ in the numbers that actually read at this size: how long
 * the body is, how high the head is carried, and the silhouette on top of it.
 * A deer is a horizontal line with antlers, a cow is a heavy box, a sheep is a
 * cloud on stilts, a wolf is a low wedge with its head down. You can tell them
 * apart at a glance from across the map, which is the whole specification.
 *
 * Three things do most of the work of stopping these looking like paper
 * cutouts, and all three were learned by getting them wrong first:
 *
 *   - the far pair of legs is drawn BEFORE the body and in the darker shade,
 *     the near pair after it and in the coat. Four legs at four x-positions
 *     with one colour between them is two thick stumps, because at this size
 *     the near and far legs of a pair are a few pixels apart and merge;
 *   - the body is filled with a vertical gradient and outlined. A flat fill is
 *     a shape, and a shape with a lit back and a shaded belly is an animal;
 *   - the head sits entirely OUTSIDE the barrel. Put its centre where the
 *     anatomy says and the body ellipse swallows it, and every species ends up
 *     as the same headless loaf.
 */
interface BeastLook {
  /** Body colour, and the darker shade used for legs, belly and the outline. */
  coat: string;
  dark: string;
  /** Overall scale against the standard sprite height. */
  size: number;
  /** Half-length of the barrel and its depth, as fractions of that height. */
  long: number;
  deep: number;
  /** How high the belly line sits above the feet. */
  stand: number;
  /** Leg thickness. */
  limb: number;
  /** Head radius. */
  head: number;
  /** Where the head is carried against the line of the back: + is above. */
  headUp: number;
  /** Rough, for a sheep's fleece; smooth for everything else. */
  fleece?: boolean;
  /** Drawn last, in the head's frame: antlers, horns, ears. */
  crest?: (c: CanvasRenderingContext2D, u: number, hx: number, hy: number) => void;
  /** A tail, drawn at the rump. */
  tail?: "flag" | "brush" | "switch";
}

/** Blend a hex colour towards another, for the lit back and the shaded belly. */
function mix(hex: string, towards: string, k: number): string {
  const p = (h: string): [number, number, number] => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const a = p(hex);
  const b = p(towards);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * k)).join(",")})`;
}

function quadruped(look: BeastLook): UnitDrawer {
  return (a) => {
    withSprite(a, (c, unit) => {
      const u = unit * look.size;
      /** Half the length of the barrel. Everything else is measured off it. */
      const L = u * look.long;
      /** Underside of the barrel, which is also where the legs start. */
      const belly = -u * look.stand;
      /** The line of the back. */
      const back = belly - u * look.deep;
      const mid = (belly + back) / 2;
      const lit = mix(look.coat, "#ffffff", 0.22);
      const shade = mix(look.coat, look.dark, 0.55);
      const sw = a.moving ? Math.sin(a.phase * Math.PI * 2) * u * 0.11 : 0;

      c.fillStyle = "rgba(0,0,0,0.3)";
      c.beginPath();
      c.ellipse(0, 0, L * 1.05, u * 0.09, 0, 0, Math.PI * 2);
      c.fill();

      const leg = (lx: number, dir: number, color: string, short: number): void => {
        c.strokeStyle = color;
        c.lineWidth = u * look.limb;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(lx, belly + u * 0.02);
        c.lineTo(lx + sw * dir, -short);
        c.stroke();
      };
      // The far side of the animal, in shadow and standing a little short, so
      // the ground it is on reads as further away.
      leg(-L * 0.5, -1, look.dark, u * 0.05);
      leg(L * 0.56, 1, look.dark, u * 0.05);

      // The barrel: back line, chest, belly, rump. Drawn as a path rather than
      // an ellipse because the difference between a cow and a deer is mostly in
      // where the withers are.
      const body = new Path2D();
      body.moveTo(-L, mid);
      body.bezierCurveTo(-L * 1.02, back + u * 0.02, -L * 0.45, back, L * 0.1, back);
      body.bezierCurveTo(L * 0.62, back, L * 1.0, back + u * 0.05, L, mid);
      body.bezierCurveTo(L * 1.0, belly - u * 0.02, L * 0.45, belly, 0, belly);
      body.bezierCurveTo(-L * 0.5, belly, -L * 1.02, belly - u * 0.03, -L, mid);
      body.closePath();
      const g = c.createLinearGradient(0, back, 0, belly);
      g.addColorStop(0, lit);
      g.addColorStop(0.55, look.coat);
      g.addColorStop(1, shade);
      c.fillStyle = g;
      c.fill(body);
      c.strokeStyle = look.dark;
      c.lineWidth = Math.max(0.6, u * 0.022);
      c.stroke(body);

      if (look.fleece) {
        // Wool is lumps, not a curve -- and crucially the lumps have to break
        // the OUTLINE. The first cut clipped them inside the barrel, where they
        // were a faint mottle on a smooth loaf; a sheep is recognised by its
        // bumpy edge before it is recognised by anything else.
        for (let i = -2; i <= 2; i++) {
          const t = i / 2;
          const cx = L * t * 0.78;
          const cy = back + u * look.deep * (0.3 + t * t * 0.3);
          const r = u * look.deep * (0.6 - Math.abs(t) * 0.1);
          c.fillStyle = i % 2 === 0 ? lit : look.coat;
          c.beginPath();
          c.arc(cx, cy, r, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = "rgba(60,48,38,0.45)";
          c.lineWidth = Math.max(0.6, u * 0.018);
          c.stroke();
        }
      }

      // Neck and head. The head's centre is a full head-radius clear of the
      // chest, which is the only way it survives being drawn over the barrel.
      const hx = L + u * look.head * 0.95;
      const hy = back - u * look.headUp;
      c.strokeStyle = look.coat;
      c.lineWidth = u * look.head * 1.15;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(L * 0.6, back + u * look.deep * 0.3);
      c.lineTo(hx - u * look.head * 0.3, hy + u * look.head * 0.2);
      c.stroke();

      const headG = c.createLinearGradient(0, hy - u * look.head, 0, hy + u * look.head);
      headG.addColorStop(0, lit);
      headG.addColorStop(1, shade);
      c.fillStyle = headG;
      c.beginPath();
      c.ellipse(hx, hy, u * look.head * 1.05, u * look.head * 0.7, look.headUp > 0.2 ? -0.5 : -0.12, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = look.dark;
      c.lineWidth = Math.max(0.6, u * 0.02);
      c.stroke();
      // Muzzle: the one mark that stops a head being a bean.
      c.fillStyle = look.dark;
      c.beginPath();
      c.ellipse(hx + u * look.head * 0.78, hy + u * look.head * 0.22, u * look.head * 0.34, u * look.head * 0.26, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#1b140d";
      c.beginPath();
      c.arc(hx + u * look.head * 0.2, hy - u * look.head * 0.18, Math.max(0.7, u * 0.022), 0, Math.PI * 2);
      c.fill();

      // The near side, over everything: this is the pair the eye reads. In the
      // mid shade rather than the coat -- a cream cow standing on cream legs
      // reads as a cream loaf on stilts, because nothing separates the two.
      leg(-L * 0.72, 1, shade, 0);
      leg(L * 0.4, -1, shade, 0);

      if (look.tail === "flag") {
        // A white scut. The only bright thing on a deer, and what you actually
        // see when one bolts.
        c.fillStyle = "#f2ebdc";
        c.beginPath();
        c.ellipse(-L * 1.04, mid - u * 0.02, u * 0.035, u * 0.055, 0.5, 0, Math.PI * 2);
        c.fill();
      } else if (look.tail === "brush") {
        c.strokeStyle = shade;
        c.lineWidth = u * 0.07;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(-L * 0.96, mid);
        c.quadraticCurveTo(-L * 1.5, mid + u * 0.02, -L * 1.6, belly - u * 0.02);
        c.stroke();
      } else if (look.tail === "switch") {
        c.strokeStyle = look.dark;
        c.lineWidth = Math.max(0.8, u * 0.022);
        c.beginPath();
        c.moveTo(-L * 0.98, back + u * 0.03);
        c.quadraticCurveTo(-L * 1.12, mid, -L * 1.04, belly - u * 0.03);
        c.stroke();
      }

      look.crest?.(c, u, hx, hy);
    });
  };
}

const deer = quadruped({
  coat: "#a4713f",
  dark: "#5c3d23",
  size: 0.92,
  long: 0.3,
  deep: 0.23,
  stand: 0.36,
  limb: 0.045,
  head: 0.095,
  headUp: 0.26,
  tail: "flag",
  crest: (c, u, hx, hy) => {
    // Antlers: a swept beam with one fork, twice, off-parallel so they read as
    // two rather than as a thick line. Every deer is a stag -- at this size a
    // hind is a small cow.
    c.strokeStyle = "#e0d0ab";
    c.lineWidth = Math.max(0.8, u * 0.024);
    c.lineCap = "round";
    for (const lean of [-0.05, 0.05]) {
      c.beginPath();
      c.moveTo(hx - u * 0.05, hy - u * 0.06);
      c.quadraticCurveTo(hx - u * (0.13 - lean), hy - u * 0.22, hx - u * (0.02 - lean * 2), hy - u * 0.3);
      c.stroke();
      c.beginPath();
      c.moveTo(hx - u * (0.1 - lean), hy - u * 0.17);
      c.lineTo(hx - u * (0.19 - lean), hy - u * 0.22);
      c.stroke();
    }
    // An ear behind them.
    c.fillStyle = "#5c3d23";
    c.beginPath();
    c.ellipse(hx - u * 0.09, hy - u * 0.02, u * 0.04, u * 0.025, -0.6, 0, Math.PI * 2);
    c.fill();
  },
});

const cow = quadruped({
  coat: "#e6ded0",
  dark: "#3b322a",
  size: 1.0,
  long: 0.35,
  deep: 0.29,
  stand: 0.29,
  limb: 0.062,
  head: 0.11,
  headUp: 0.02,
  tail: "switch",
  crest: (c, u, hx, hy) => {
    // Two short horns and an ear. A cow's silhouette is otherwise a box, and a
    // box is what a barn looks like too.
    c.strokeStyle = "#d9cdae";
    c.lineWidth = Math.max(0.8, u * 0.026);
    c.lineCap = "round";
    for (const dy of [-0.02, 0.012]) {
      c.beginPath();
      c.moveTo(hx - u * 0.02, hy - u * 0.055 + u * dy);
      c.quadraticCurveTo(hx - u * 0.07, hy - u * 0.105 + u * dy, hx - u * 0.1, hy - u * 0.075 + u * dy);
      c.stroke();
    }
    c.fillStyle = "#3b322a";
    c.beginPath();
    c.ellipse(hx - u * 0.12, hy - u * 0.005, u * 0.05, u * 0.03, -0.25, 0, Math.PI * 2);
    c.fill();
    // Patches: a plain cream cow is a sheep with long legs.
    c.fillStyle = "rgba(59,50,42,0.9)";
    for (const [px, py, rx, ry] of [
      [-0.14, -0.42, 0.09, 0.06],
      [0.1, -0.34, 0.06, 0.045],
    ] as const) {
      c.beginPath();
      c.ellipse(u * px, u * py, u * rx, u * ry, 0.3, 0, Math.PI * 2);
      c.fill();
    }
  },
});

const sheep = quadruped({
  coat: "#efe9dc",
  dark: "#4e4238",
  size: 0.76,
  long: 0.29,
  deep: 0.3,
  stand: 0.26,
  limb: 0.05,
  head: 0.1,
  headUp: 0.02,
  fleece: true,
  crest: (c, u, hx, hy) => {
    // A sheep's head is the dark bit sticking out of the wool, so it is painted
    // back over in the dark shade rather than left the colour of the fleece.
    c.fillStyle = "#4e4238";
    c.beginPath();
    c.ellipse(hx, hy, u * 0.1, u * 0.068, -0.12, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#1b140d";
    c.beginPath();
    c.arc(hx + u * 0.018, hy - u * 0.016, Math.max(0.7, u * 0.02), 0, Math.PI * 2);
    c.fill();
    // A floppy ear, and a curl of fleece over the brow.
    c.fillStyle = "#3d332b";
    c.beginPath();
    c.ellipse(hx - u * 0.07, hy + u * 0.005, u * 0.038, u * 0.022, 0.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#efe9dc";
    c.beginPath();
    c.arc(hx - u * 0.055, hy - u * 0.055, u * 0.045, 0, Math.PI * 2);
    c.fill();
  },
});

/**
 * A wolf: low, long and head-down, which is the pose that says predator before
 * any of the detail arrives. Grey rather than brown, so a pack in the trees is
 * never mistaken for a herd of deer at the distance you first see it.
 */
const wolf = quadruped({
  coat: "#75767c",
  dark: "#3c3d43",
  size: 0.88,
  long: 0.31,
  deep: 0.2,
  stand: 0.3,
  limb: 0.048,
  head: 0.095,
  // Carried BELOW the line of the back. The single most important number here.
  headUp: -0.05,
  tail: "brush",
  crest: (c, u, hx, hy) => {
    // Pricked ears, and a pale cheek and throat so the muzzle reads at a
    // distance -- a uniformly grey head is a stone.
    c.fillStyle = "#5f6066";
    for (const dx of [-0.055, -0.115]) {
      c.beginPath();
      c.moveTo(hx + u * dx, hy - u * 0.04);
      c.lineTo(hx + u * (dx + 0.012), hy - u * 0.14);
      c.lineTo(hx + u * (dx + 0.062), hy - u * 0.05);
      c.closePath();
      c.fill();
    }
    c.fillStyle = "#c2beb4";
    c.beginPath();
    c.ellipse(hx + u * 0.04, hy + u * 0.05, u * 0.055, u * 0.028, 0.05, 0, Math.PI * 2);
    c.fill();
  },
});

/**
 * The dragon: a plan view, like the aircraft, because that is what it is.
 *
 * Drawn from above and rotated to its heading rather than given eight painted
 * facings, for the same reason the aeroplanes are -- a thing that banks and
 * turns reads far better as one shape spun round than as a set of stills.
 *
 * The first version of this was a moth. Two smooth ellipses for wings, a stick
 * for a body, and at the zoom anybody plays at it read as a dragonfly sitting
 * on the town hall. What fixed it was not detail, it was structure: a dragon's
 * wing is a HAND, and the silhouette that says so is the scalloped trailing
 * edge between its fingers. Everything else here -- the barrel chest, the
 * wedge skull, the trailing hind legs -- is in service of that one read, and
 * the scallops are the part that must survive being shrunk.
 */
const dragon: UnitDrawer = (a) => {
  const c = a.ctx;
  const u = a.h * 2.2;
  const beat = Math.sin(a.phase * Math.PI * 2);

  // The shadow, well out and quite hard: it is not that high up.
  c.fillStyle = "rgba(0,0,0,0.32)";
  c.beginPath();
  c.ellipse(a.x + u * 0.15, a.y + u * 0.36, u * 0.3, u * 0.1, 0, 0, Math.PI * 2);
  c.fill();

  c.save();
  c.translate(a.x, a.y - u * 0.3 + beat * u * 0.025);
  c.rotate((a.facing / 8) * Math.PI * 2 + Math.PI);
  c.lineJoin = "round";
  c.lineCap = "round";

  const scale = "#7a2f26";
  const scaleDark = "#4a1a16";
  const belly = "#b87a44";
  const bone = "#c9ab86";

  // ── wings ──
  //
  // The stroke is a vertical squash on a plan view, which is what a wing beat
  // actually looks like from above. It never fully closes: a dragon at full
  // fold reads as a dead one.
  const span = u * 0.66 * (0.62 + Math.abs(beat) * 0.38);
  for (const side of [-1, 1]) {
    const y = (k: number): number => side * span * k;
    // Finger tips, from the wingtip back to the hip. The trailing edge is a
    // scallop between each pair.
    const fingers: Array<[number, number]> = [
      [u * 0.1, y(1.0)],
      [-u * 0.04, y(0.9)],
      [-u * 0.16, y(0.7)],
      [-u * 0.24, y(0.42)],
    ];
    c.beginPath();
    // Leading edge: shoulder, out over the wrist, to the tip.
    c.moveTo(u * 0.08, side * u * 0.05);
    c.quadraticCurveTo(u * 0.26, y(0.5), fingers[0]![0], fingers[0]![1]);
    // Trailing edge: bow each span back TOWARDS the shoulder to cut a scallop.
    for (let i = 0; i < fingers.length - 1; i++) {
      const [x0, y0] = fingers[i]!;
      const [x1, y1] = fingers[i + 1]!;
      c.quadraticCurveTo((x0 + x1) / 2 + u * 0.11, (y0 + y1) / 2 - side * span * 0.13, x1, y1);
    }
    // And home to the hip.
    c.quadraticCurveTo(-u * 0.16, side * u * 0.12, -u * 0.08, side * u * 0.05);
    c.closePath();
    const g = c.createLinearGradient(0, side * span, 0, 0);
    g.addColorStop(0, "#7d3b31");
    g.addColorStop(1, "#9c4c3c");
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = "rgba(34,12,10,0.6)";
    c.lineWidth = Math.max(0.7, u * 0.011);
    c.stroke();
    // The bones themselves, radiating from the shoulder to each fingertip.
    c.strokeStyle = "rgba(48,20,16,0.5)";
    c.lineWidth = Math.max(0.6, u * 0.009);
    for (const [fx, fy] of fingers) {
      c.beginPath();
      c.moveTo(u * 0.07, side * u * 0.05);
      c.quadraticCurveTo(u * 0.16, (fy + side * u * 0.05) / 2, fx, fy);
      c.stroke();
    }
    // A claw on the wrist, which is the other thing only a dragon has.
    c.strokeStyle = bone;
    c.lineWidth = Math.max(0.7, u * 0.012);
    c.beginPath();
    c.moveTo(u * 0.21, y(0.52));
    c.lineTo(u * 0.28, y(0.58));
    c.stroke();
  }

  // ── tail ──
  c.strokeStyle = scale;
  c.lineWidth = u * 0.085;
  c.beginPath();
  c.moveTo(-u * 0.12, 0);
  c.quadraticCurveTo(-u * 0.36, beat * u * 0.07, -u * 0.56, beat * u * 0.16);
  c.stroke();
  c.strokeStyle = scaleDark;
  c.lineWidth = u * 0.04;
  c.beginPath();
  c.moveTo(-u * 0.4, beat * u * 0.085);
  c.quadraticCurveTo(-u * 0.52, beat * u * 0.14, -u * 0.62, beat * u * 0.18);
  c.stroke();
  // A spade on the end.
  c.fillStyle = scaleDark;
  c.beginPath();
  c.moveTo(-u * 0.58, beat * u * 0.17);
  c.lineTo(-u * 0.72, beat * u * 0.22 - u * 0.055);
  c.lineTo(-u * 0.69, beat * u * 0.22 + u * 0.055);
  c.closePath();
  c.fill();

  // ── hind legs, trailing back under the wings ──
  for (const side of [-1, 1]) {
    c.strokeStyle = scaleDark;
    c.lineWidth = u * 0.035;
    c.beginPath();
    c.moveTo(-u * 0.08, side * u * 0.07);
    c.quadraticCurveTo(-u * 0.2, side * u * 0.16, -u * 0.3, side * u * 0.14);
    c.stroke();
    c.strokeStyle = bone;
    c.lineWidth = Math.max(0.6, u * 0.01);
    for (const k of [-0.03, 0, 0.03]) {
      c.beginPath();
      c.moveTo(-u * 0.3, side * u * 0.14);
      c.lineTo(-u * 0.37, side * u * 0.14 + u * k);
      c.stroke();
    }
  }

  // ── body ──
  c.fillStyle = scale;
  c.beginPath();
  c.moveTo(-u * 0.16, 0);
  c.quadraticCurveTo(-u * 0.14, -u * 0.11, u * 0.04, -u * 0.115);
  c.quadraticCurveTo(u * 0.2, -u * 0.1, u * 0.24, 0);
  c.quadraticCurveTo(u * 0.2, u * 0.1, u * 0.04, u * 0.115);
  c.quadraticCurveTo(-u * 0.14, u * 0.11, -u * 0.16, 0);
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(30,10,8,0.5)";
  c.lineWidth = Math.max(0.7, u * 0.011);
  c.stroke();
  // Plated belly down the middle.
  c.fillStyle = belly;
  c.beginPath();
  c.ellipse(u * 0.04, 0, u * 0.15, u * 0.055, 0, 0, Math.PI * 2);
  c.fill();
  // Spines down the spine.
  c.fillStyle = scaleDark;
  for (const sx of [-0.1, -0.02, 0.06, 0.14]) {
    c.beginPath();
    c.moveTo(u * sx, -u * 0.02);
    c.lineTo(u * (sx + 0.025), -u * 0.085);
    c.lineTo(u * (sx + 0.05), -u * 0.015);
    c.closePath();
    c.fill();
  }

  // ── neck and head ──
  c.strokeStyle = scale;
  c.lineWidth = u * 0.075;
  c.beginPath();
  c.moveTo(u * 0.2, 0);
  c.quadraticCurveTo(u * 0.3, 0, u * 0.36, 0);
  c.stroke();
  // A wedge skull, not a bean: wide at the jaw hinge, narrow at the snout.
  c.fillStyle = scale;
  c.beginPath();
  c.moveTo(u * 0.33, -u * 0.075);
  c.lineTo(u * 0.48, -u * 0.032);
  c.lineTo(u * 0.5, 0);
  c.lineTo(u * 0.48, u * 0.032);
  c.lineTo(u * 0.33, u * 0.075);
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(30,10,8,0.55)";
  c.lineWidth = Math.max(0.7, u * 0.011);
  c.stroke();
  // Jaw line, and teeth at the front of it.
  c.strokeStyle = "rgba(30,10,8,0.45)";
  c.beginPath();
  c.moveTo(u * 0.35, 0);
  c.lineTo(u * 0.49, 0);
  c.stroke();
  c.fillStyle = bone;
  for (const k of [0.4, 0.55, 0.7]) {
    const hx = u * (0.35 + k * 0.14);
    c.beginPath();
    c.moveTo(hx, -u * 0.004);
    c.lineTo(hx + u * 0.012, u * 0.022);
    c.lineTo(hx + u * 0.024, -u * 0.004);
    c.closePath();
    c.fill();
  }
  // Horns swept back off the skull.
  c.strokeStyle = bone;
  c.lineWidth = Math.max(0.8, u * 0.015);
  for (const side of [-1, 1]) {
    c.beginPath();
    c.moveTo(u * 0.35, side * u * 0.05);
    c.quadraticCurveTo(u * 0.28, side * u * 0.1, u * 0.24, side * u * 0.085);
    c.stroke();
  }
  // Two coals for eyes. At any zoom worth playing at this is the one detail
  // that reads, and it is the one worth having.
  c.fillStyle = "#ffd166";
  for (const side of [-1, 1]) {
    c.beginPath();
    c.ellipse(u * 0.4, side * u * 0.035, u * 0.018, u * 0.012, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
};

// ───────────────────────────── the Blackrock ─────────────────────────────

/**
 * Orcs, drawn rather than painted, and drawn to be told apart from men at the
 * distance you first see them.
 *
 * That last part is the whole brief. A player who has just walked a scout into
 * a camp needs to know in one frame that these are not somebody's footmen, and
 * at thirty pixels a tile you do not read a face. So the difference is carried
 * by silhouette and colour: green against every human palette, shoulders half
 * again as wide as a man's, a head carried forward of them instead of on top,
 * and a weapon held out where a footman holds his in.
 *
 * Built on the same skeleton as the footman above -- `legs` and `ellipse` with
 * the chest at the origin, the feet at +0.4u and the head at -0.3u. The first
 * version invented its own frame with the feet at zero, which put every orc
 * about a third of a body-height above the ground it was standing on: next to a
 * painted footman they hovered. When there is a working convention in the file,
 * use it.
 */
const ORC_SKIN = "#7d9e4e";
const ORC_SKIN_DARK = "#4a6430";
/**
 * The torso is HIDE, not skin, and that is a drawing decision rather than a
 * costume one: a green head on a green chest is one green blob at any zoom
 * anybody plays at, exactly as the footman would be one grey blob if his face
 * were painted the colour of his breastplate. The dark harness is what the head
 * is read against.
 */
const ORC_HARNESS = "#4a3d2c";
const ORC_HIDE = "#38301f";
const ORC_IRON = "#8b9198";
const ORC_EDGE = "#20290f";

/**
 * The shared body. Everything Blackrock is this with a different weapon.
 *
 * @param bulk 1 is a grunt; the ogre is half again as wide
 * @param arm  the weapon, drawn last, in the sprite's own frame
 */
function orcBody(
  a: UnitArtCtx,
  bulk: number,
  arm: (c: CanvasRenderingContext2D, u: number) => void,
  mount?: (c: CanvasRenderingContext2D, u: number) => void,
): void {
  shadow(a);
  withSprite(a, (c, base) => {
    // A head taller than a man. At the base height they came out smaller than
    // the painted footman they are supposed to frighten.
    const u = base * 1.18;
    const line = Math.max(0.8, u * 0.022);
    // Sitting on something: the whole body rides higher and the legs are gone.
    const lift = mount ? -u * 0.2 : 0;

    if (mount) mount(c, u);
    else legs(c, u, a.phase, a.moving, ORC_SKIN_DARK, Math.max(2, u * 0.105 * bulk), u * 0.15, u * 0.4);

    // A hide kilt over the hips, which is what stops the legs reading as two
    // sticks under a barrel.
    c.fillStyle = ORC_HIDE;
    c.beginPath();
    c.moveTo(-u * 0.18 * bulk, lift + u * 0.22);
    c.lineTo(u * 0.17 * bulk, lift + u * 0.22);
    c.lineTo(u * 0.14 * bulk, lift + u * 0.06);
    c.lineTo(-u * 0.14 * bulk, lift + u * 0.06);
    c.closePath();
    c.fill();
    c.strokeStyle = ORC_EDGE;
    c.lineWidth = line;
    c.stroke();

    // Chest: wide, and leaning forward off the hips.
    ellipse(c, u * 0.02, lift - u * 0.05, u * 0.21 * bulk, u * 0.21, ORC_HARNESS, ORC_EDGE, line);
    // A green shoulder and upper arm showing above the harness, so the arm that
    // holds the weapon belongs to the same creature as the head.
    ellipse(c, u * 0.13 * bulk, lift - u * 0.11, u * 0.1 * bulk, u * 0.09, ORC_SKIN, ORC_EDGE, line);
    // Player colour as a sash rather than a tabard. Blackrock green is the read;
    // a full surcoat in somebody's heraldry would fight it.
    c.fillStyle = a.color;
    c.fillRect(-u * 0.16 * bulk, lift - u * 0.1, u * 0.09 * bulk, u * 0.2);
    // The near pauldron: a slab of iron, and most of the silhouette.
    ellipse(c, u * 0.17 * bulk, lift - u * 0.14, u * 0.11 * bulk, u * 0.085, ORC_IRON, ORC_EDGE, line);

    // Head, forward of the shoulders rather than above them, with a jaw.
    const hx = u * 0.1 * bulk;
    const hy = lift - u * 0.34;
    // A thick neck bridging harness and skull. Without it the head is a ball
    // balanced on a barrel.
    c.strokeStyle = ORC_SKIN;
    c.lineWidth = u * 0.1 * bulk;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(u * 0.04 * bulk, lift - u * 0.16);
    c.lineTo(hx, hy + u * 0.04);
    c.stroke();
    ellipse(c, hx, hy, u * 0.115 * bulk, u * 0.105, ORC_SKIN, ORC_EDGE, line);
    // Heavy lower jaw, and the two tusks coming up out of it.
    ellipse(c, hx + u * 0.05 * bulk, hy + u * 0.05, u * 0.075 * bulk, u * 0.055, ORC_SKIN_DARK);
    c.fillStyle = "#efe6cd";
    for (const k of [0.015, 0.075]) {
      c.beginPath();
      c.moveTo(hx + u * k * bulk, hy + u * 0.085);
      c.lineTo(hx + u * (k + 0.014) * bulk, hy + u * 0.005);
      c.lineTo(hx + u * (k + 0.036) * bulk, hy + u * 0.085);
      c.closePath();
      c.fill();
    }
    // A swept-back ear, the other half of "not a man".
    c.fillStyle = ORC_SKIN;
    c.beginPath();
    c.moveTo(hx - u * 0.07 * bulk, hy - u * 0.02);
    c.lineTo(hx - u * 0.19 * bulk, hy - u * 0.11);
    c.lineTo(hx - u * 0.06 * bulk, hy - u * 0.07);
    c.closePath();
    c.fill();
    c.strokeStyle = ORC_EDGE;
    c.lineWidth = Math.max(0.6, u * 0.014);
    c.stroke();
    // One yellow eye. At this size it is the whole face.
    c.fillStyle = "#f0c04a";
    c.beginPath();
    c.arc(hx + u * 0.05 * bulk, hy - u * 0.03, Math.max(0.8, u * 0.022 * bulk), 0, Math.PI * 2);
    c.fill();

    c.save();
    c.translate(0, lift);
    arm(c, u * bulk);
    c.restore();
  });
}

/** A grunt: a broad-bladed cleaver held out at arm's length. */
const grunt: UnitDrawer = (a) =>
  orcBody(a, 1, (c, u) => {
    c.strokeStyle = ORC_SKIN;
    c.lineWidth = u * 0.08;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(u * 0.14, -u * 0.04);
    c.lineTo(u * 0.3, u * 0.02);
    c.stroke();
    // A heavy trapezoid, not a line: a thin blade reads as a stick.
    c.fillStyle = "#6f757c";
    c.beginPath();
    c.moveTo(u * 0.28, u * 0.06);
    c.lineTo(u * 0.32, -u * 0.24);
    c.lineTo(u * 0.5, -u * 0.18);
    c.lineTo(u * 0.42, u * 0.08);
    c.closePath();
    c.fill();
    c.strokeStyle = ORC_EDGE;
    c.lineWidth = Math.max(0.7, u * 0.016);
    c.stroke();
  });

/** An axe thrower: a hatchet cocked back over the shoulder, mid-throw. */
const axethrower: UnitDrawer = (a) =>
  orcBody(a, 0.9, (c, u) => {
    c.strokeStyle = ORC_SKIN;
    c.lineWidth = u * 0.07;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(u * 0.12, -u * 0.06);
    c.quadraticCurveTo(u * 0.3, -u * 0.16, u * 0.26, -u * 0.34);
    c.stroke();
    c.strokeStyle = "#6b4a2c";
    c.lineWidth = u * 0.035;
    c.beginPath();
    c.moveTo(u * 0.26, -u * 0.3);
    c.lineTo(u * 0.24, -u * 0.52);
    c.stroke();
    c.fillStyle = ORC_IRON;
    c.beginPath();
    c.moveTo(u * 0.24, -u * 0.46);
    c.lineTo(u * 0.42, -u * 0.54);
    c.lineTo(u * 0.27, -u * 0.62);
    c.closePath();
    c.fill();
    c.strokeStyle = ORC_EDGE;
    c.lineWidth = Math.max(0.7, u * 0.016);
    c.stroke();
  });

/**
 * A warg rider.
 *
 * The warg carries the read, not the rider: a long low grey wolf with its head
 * down, which is the same silhouette the wildlife wolf uses on purpose -- the
 * thing you are meant to recognise from across the map is "that is moving much
 * faster than infantry should".
 */
const wargrider: UnitDrawer = (a) =>
  orcBody(
    a,
    0.85,
    (c, u) => {
      c.strokeStyle = ORC_SKIN;
      c.lineWidth = u * 0.065;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(u * 0.12, -u * 0.06);
      c.lineTo(u * 0.28, -u * 0.14);
      c.stroke();
      // A spear, carried level and well forward.
      c.strokeStyle = "#6b4a2c";
      c.lineWidth = u * 0.032;
      c.beginPath();
      c.moveTo(u * 0.02, -u * 0.02);
      c.lineTo(u * 0.58, -u * 0.22);
      c.stroke();
      c.fillStyle = ORC_IRON;
      c.beginPath();
      c.moveTo(u * 0.54, -u * 0.16);
      c.lineTo(u * 0.72, -u * 0.28);
      c.lineTo(u * 0.53, -u * 0.28);
      c.closePath();
      c.fill();
    },
    (c, u) => {
      const coat = "#6d6e74";
      const dark = "#42434a";
      const sw = a.moving ? Math.sin(a.phase * Math.PI * 2) * u * 0.1 : 0;
      const belly = u * 0.16;
      const spine = u * 0.02;
      // Far legs, body, near legs: the same trick the wildlife uses.
      for (const [lx, dir, col] of [
        [-0.16, -1, dark],
        [0.2, 1, dark],
        [-0.26, 1, coat],
        [0.12, -1, coat],
      ] as const) {
        c.strokeStyle = col;
        c.lineWidth = u * 0.055;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(u * lx, belly);
        c.lineTo(u * lx + sw * dir, u * 0.4);
        c.stroke();
      }
      ellipse(c, 0, spine + u * 0.06, u * 0.32, u * 0.12, coat, ORC_EDGE, Math.max(0.7, u * 0.016));
      // Head down and forward.
      c.strokeStyle = coat;
      c.lineWidth = u * 0.09;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(u * 0.26, spine + u * 0.06);
      c.lineTo(u * 0.4, spine + u * 0.12);
      c.stroke();
      ellipse(c, u * 0.46, spine + u * 0.13, u * 0.08, u * 0.055, dark, ORC_EDGE, Math.max(0.6, u * 0.014));
      c.fillStyle = "#f0c04a";
      c.beginPath();
      c.arc(u * 0.46, spine + u * 0.11, Math.max(0.6, u * 0.016), 0, Math.PI * 2);
      c.fill();
      // Brush of a tail.
      c.strokeStyle = coat;
      c.lineWidth = u * 0.06;
      c.beginPath();
      c.moveTo(-u * 0.3, spine + u * 0.06);
      c.quadraticCurveTo(-u * 0.48, spine + u * 0.02, -u * 0.52, belly + u * 0.06);
      c.stroke();
    },
  );

/** An ogre: the same body, half again as big, swinging a tree with nails in it. */
const ogre: UnitDrawer = (a) =>
  orcBody(a, 1.5, (c, u) => {
    c.strokeStyle = "#7d9450";
    c.lineWidth = u * 0.09;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(u * 0.14, -u * 0.04);
    c.lineTo(u * 0.3, u * 0.04);
    c.stroke();
    c.strokeStyle = "#6b4a2c";
    c.lineWidth = u * 0.08;
    c.beginPath();
    c.moveTo(u * 0.28, u * 0.06);
    c.lineTo(u * 0.48, -u * 0.28);
    c.stroke();
    c.fillStyle = "#7b5734";
    c.beginPath();
    c.ellipse(u * 0.5, -u * 0.32, u * 0.12, u * 0.09, -0.6, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = ORC_EDGE;
    c.lineWidth = Math.max(0.7, u * 0.016);
    c.stroke();
    c.strokeStyle = "#c8ccd2";
    c.lineWidth = Math.max(0.7, u * 0.016);
    for (const k of [-0.05, 0.01, 0.07]) {
      c.beginPath();
      c.moveTo(u * (0.46 + k), -u * (0.36 + k * 0.3));
      c.lineTo(u * (0.52 + k), -u * (0.42 + k * 0.3));
      c.stroke();
    }
  });

const ORC_UNITS: Record<string, UnitDrawer> = { grunt, axethrower, wargrider, ogre };

const HUMAN_UNITS: Record<string, UnitDrawer> = {
  bear,
  dragon,
  wolf,
  deer,
  cow,
  sheep,
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
  knight,
  mage,
  ballista,
};

export const FACTION_UNIT_ART: Record<string, Record<string, UnitDrawer>> = {
  human: HUMAN_UNITS,
  // Orcs have art for their own roster and nothing else. Everything they can
  // ever share with a man -- the wildlife on their doorstep, a dragon over
  // their camp -- comes out of the Human set by the fallback below.
  orc: ORC_UNITS,
};

/**
 * A drawer for one unit of one faction.
 *
 * Falls back per DEFINITION rather than per faction, which matters the moment a
 * second faction exists: `FACTION_UNIT_ART[faction] ?? HUMAN_UNITS` picks the
 * orc table and then finds no bear in it, so a bear standing in an orc camp is
 * drawn as nothing at all. Asking the faction first and the Humans second means
 * a faction's table only has to hold what is actually different about it.
 */
export function unitArtFor(faction: string, def: string): UnitDrawer | undefined {
  return FACTION_UNIT_ART[faction]?.[def] ?? HUMAN_UNITS[def];
}
