/**
 * The front screen: splash, then menu.
 *
 * Two stages, because the painting and the menu want opposite things. The
 * painting wants the whole screen and no words on it; the menu wants a dark,
 * quiet column where type can be read. So the first stage gives the picture
 * everything -- letterboxed rather than cropped, because the title is painted
 * into it and cropping would cut the logo -- and asks only for a keypress. The
 * second stage keeps the picture on the left and puts the menu in a dark panel
 * down the right, where a menu has always lived.
 *
 * The menu itself is a single column of rows, and every screen after it
 * (opponent, realms, credits) is the same column with different rows in it.
 * That is deliberate: one renderer, one set of hit rectangles, one keyboard
 * model. Adding a screen is adding a list, not writing another layout.
 *
 * Rows that lead nowhere yet -- Continue with no save to continue, Trials with
 * no tutorial written -- are drawn dim and say why in the margin. They are not
 * clickable. A menu that lies about what it can do is worse than a short menu.
 */

import type { Difficulty } from "../ai/skirmish";
import { menuArt } from "../render/sprites";
import { MAPS } from "../data/maps";

const TITLE_A = "REALMS";
const TITLE_B = "OF VALOR";
const EYEBROW = "A REAL-TIME STRATEGY GAME";
const TAGLINE = "BUILD · EXPLORE · DEFEND · CONQUER";
const EPIGRAPH = "Eight kingdoms, one winter. Choose where the war begins.";
const VERSION = "0.1.0";

/** Which list of rows the column is showing. */
export type FrontPane = "splash" | "menu" | "skirmish" | "realms" | "credits";

export type FrontAction =
  | { kind: "begin" }
  | { kind: "pane"; pane: FrontPane }
  | { kind: "difficulty"; value: Difficulty }
  | { kind: "map"; id: string }
  | { kind: "settings" }
  | { kind: "scroll"; by: number };

export interface FrontHit {
  x: number;
  y: number;
  w: number;
  h: number;
  action: FrontAction;
  enabled: boolean;
}

export interface FrontState {
  pane: FrontPane;
  /** Highlighted row, for the keyboard. The mouse highlights whatever it is over. */
  cursor: number;
  /** First visible row in a list long enough to scroll. */
  scroll: number;
}

export function newFrontState(): FrontState {
  return { pane: "splash", cursor: 0, scroll: 0 };
}

/** One line in the column. */
interface Row {
  numeral: string;
  label: string;
  hint: string;
  enabled: boolean;
  /** Draw the gold marker: this is the value currently in force. */
  marked: boolean;
  action: FrontAction;
  /** Shown under the column while this row is the highlighted one. */
  note?: string;
}

const DIFFS: Array<[Difficulty, string, string]> = [
  ["easy", "Easy", "A neighbour who dithers. Room to learn the board."],
  ["normal", "Normal", "An opponent who develops, masses, and comes for you."],
  ["hard", "Hard", "Impatient and aggressive. It will not wait for you."],
  ["peaceful", "Peaceful", "It builds its own country and never marches on yours."],
  ["none", "Sandbox", "Nobody else at all. The map, and time to use it."],
];

const KIND_WORD: Record<string, string> = {
  lakeland: "Lakeland",
  gorge: "Gorge",
  highlands: "Highlands",
  plains: "Plains",
  islands: "Islands",
};

const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const numeral = (i: number): string => NUMERALS[i] ?? String(i + 1);

// ─────────────────────────── palette ───────────────────────────

const CREAM = "#efe4cd";
const GOLD = "#c8a24a";
const GOLD_HOT = "#f0d18a";
const MUTED = "#8a8274";
const DIM = "#4e4a43";

// ─────────────────────────── text helpers ───────────────────────────

/**
 * Letter-spaced text. `ctx.letterSpacing` exists in current Chrome but not
 * everywhere, and these strings are short, so they are drawn a glyph at a time
 * and the question never comes up.
 */
function tracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, sp: number): void {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + sp;
  }
}

function trackedWidth(ctx: CanvasRenderingContext2D, text: string, sp: number): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + sp;
  return Math.max(0, w - sp);
}

function trackedRight(ctx: CanvasRenderingContext2D, text: string, right: number, y: number, sp: number): void {
  tracked(ctx, text, right - trackedWidth(ctx, text, sp), y, sp);
}

/** Wrap on spaces, for the one or two prose lines the screen carries. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? line + " " + word : word;
    if (line && ctx.measureText(next).width > max) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  return out;
}

// ─────────────────────────── picture ───────────────────────────

/** Fill the frame, cropping what will not fit. */
function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, iw: number, ih: number, W: number, H: number): void {
  const scale = Math.max(W / iw, H / ih);
  ctx.drawImage(img, (W - iw * scale) / 2, (H - ih * scale) / 2, iw * scale, ih * scale);
}

/** Fit the whole picture inside the frame. Returns the box it landed in. */
function drawContain(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  iw: number,
  ih: number,
  W: number,
  H: number,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(W / iw, H / ih);
  const w = iw * scale;
  const h = ih * scale;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  ctx.drawImage(img, x, y, w, h);
  return { x, y, w, h };
}

/** Stands in for the painting when it has not loaded (or is the placeholder). */
function drawSubstitute(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#141d2b");
  sky.addColorStop(0.55, "#26313c");
  sky.addColorStop(0.56, "#1d2a22");
  sky.addColorStop(1, "#0e150f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.72, H * 0.5, 0, W * 0.72, H * 0.5, H * 0.55);
  glow.addColorStop(0, "rgba(255,196,120,0.35)");
  glow.addColorStop(1, "rgba(255,196,120,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

// ─────────────────────────── the splash ───────────────────────────

function drawSplash(ctx: CanvasRenderingContext2D, W: number, H: number): FrontHit[] {
  ctx.fillStyle = "#08090b";
  ctx.fillRect(0, 0, W, H);

  const art = menuArt();
  let box = { x: 0, y: 0, w: W, h: H };
  if (art) box = drawContain(ctx, art, art.naturalWidth, art.naturalHeight, W, H);
  else drawSubstitute(ctx, W, H);

  // Seat the prompt on something, whatever the picture does down there.
  const footFrom = box.y + box.h - 150;
  const foot = ctx.createLinearGradient(0, footFrom, 0, box.y + box.h);
  foot.addColorStop(0, "rgba(6,6,8,0)");
  foot.addColorStop(1, "rgba(6,6,8,0.78)");
  ctx.fillStyle = foot;
  ctx.fillRect(box.x, footFrom, box.w, box.h - (footFrom - box.y));

  // A slow breath rather than a blink: it reads as invitation, not as an error.
  const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(performance.now() / 900));
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `${Math.round(Math.max(15, Math.min(22, H * 0.026)))}px Georgia, 'Times New Roman', serif`;
  ctx.fillStyle = `rgba(239,228,205,${pulse.toFixed(3)})`;
  const prompt = "PRESS ANY KEY";
  const sp = 6;
  tracked(ctx, prompt, (W - trackedWidth(ctx, prompt, sp)) / 2, box.y + box.h - 46, sp);

  // If letterboxing left a real bar at the bottom, it gets the chapter line.
  const bar = H - (box.y + box.h);
  if (bar >= 86) {
    const x = Math.max(28, W * 0.055);
    let y = box.y + box.h + 34;
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = MUTED;
    tracked(ctx, "CHAPTER I", x, y, 3);
    y += 26;
    ctx.font = `italic ${Math.round(Math.max(14, Math.min(18, H * 0.022)))}px Georgia, serif`;
    ctx.fillStyle = "rgba(239,228,205,0.82)";
    ctx.fillText("The banners are raised at Emberfall.", x, y);
    if (bar >= 120) ctx.fillText("What holds the pass tonight decides the age.", x, y + 24);
  }

  // The whole screen is the button.
  return [{ x: 0, y: 0, w: W, h: H, action: { kind: "pane", pane: "menu" }, enabled: true }];
}

// ─────────────────────────── the column ───────────────────────────

/** Which rows each pane is made of. */
function rowsFor(state: FrontState, difficulty: Difficulty, mapId: string): { rows: Row[]; note: string; heading: string | null } {
  switch (state.pane) {
    case "skirmish": {
      const rows: Row[] = DIFFS.map(([value, label, blurb], i) => ({
        numeral: numeral(i),
        label,
        hint: value === difficulty ? "Chosen" : "",
        enabled: true,
        marked: value === difficulty,
        action: { kind: "difficulty", value },
        note: blurb,
      }));
      rows.push({
        numeral: numeral(rows.length),
        label: "March Out",
        hint: "Enter",
        enabled: true,
        marked: false,
        action: { kind: "begin" },
        note: "Begin the match on the chosen realm.",
      });
      rows.push({
        numeral: "",
        label: "Back",
        hint: "Esc",
        enabled: true,
        marked: false,
        action: { kind: "pane", pane: "menu" },
      });
      return { rows, note: "", heading: "CHOOSE YOUR OPPONENT" };
    }
    case "realms": {
      const all: Row[] = [
        {
          numeral: "",
          label: "Random Realm",
          hint: "Every match",
          enabled: true,
          marked: mapId === "random",
          action: { kind: "map", id: "random" },
          note: "A different map each time you march out.",
        },
        ...MAPS.map((m) => ({
          numeral: "",
          label: m.name,
          hint: KIND_WORD[m.kind] ?? m.kind,
          enabled: true,
          marked: m.id === mapId,
          action: { kind: "map", id: m.id } as FrontAction,
          note: `${KIND_WORD[m.kind] ?? m.kind}. ${Math.round(m.open * 100)}% open ground, ${m.size ?? 64} tiles across.`,
        })),
      ];
      return { rows: all, note: "", heading: `${MAPS.length} REALMS` };
    }
    case "credits": {
      const rows: Row[] = [
        { numeral: "", label: "Design & Code", hint: "Justin Caruana", enabled: false, marked: false, action: { kind: "pane", pane: "credits" } },
        { numeral: "", label: "Built With", hint: "TypeScript · Vite", enabled: false, marked: false, action: { kind: "pane", pane: "credits" } },
        { numeral: "", label: "Engine", hint: "Deterministic lockstep sim", enabled: false, marked: false, action: { kind: "pane", pane: "credits" } },
        { numeral: "", label: "Build", hint: VERSION, enabled: false, marked: false, action: { kind: "pane", pane: "credits" } },
        { numeral: "", label: "Back", hint: "Esc", enabled: true, marked: false, action: { kind: "pane", pane: "menu" } },
      ];
      return { rows, note: "Made in the open. Every unit, map and rule is in the repository.", heading: "CREDITS" };
    }
    default: {
      const rows: Row[] = [
        {
          numeral: numeral(0),
          label: "New Campaign",
          hint: "Enter",
          enabled: true,
          marked: false,
          action: { kind: "begin" },
          note: "Raise a hall, take the valley, and hold it.",
        },
        {
          numeral: numeral(1),
          label: "Continue",
          hint: "No save",
          enabled: false,
          marked: false,
          action: { kind: "pane", pane: "menu" },
          note: "Nothing saved yet — campaigns are not written to disk.",
        },
        {
          numeral: numeral(2),
          label: "Skirmish",
          hint: "1 v 1",
          enabled: true,
          marked: false,
          action: { kind: "pane", pane: "skirmish" },
          note: "Pick an opponent and fight a single match.",
        },
        {
          numeral: numeral(3),
          label: "Trials",
          hint: "Soon",
          enabled: false,
          marked: false,
          action: { kind: "pane", pane: "menu" },
          note: "The tutorial is not written yet.",
        },
        {
          numeral: numeral(4),
          label: "Realm Map",
          hint: `${MAPS.length} maps`,
          enabled: true,
          marked: false,
          action: { kind: "pane", pane: "realms" },
          note: "Choose the ground you fight over.",
        },
        {
          numeral: numeral(5),
          label: "Settings",
          hint: "Gear",
          enabled: true,
          marked: false,
          action: { kind: "settings" },
          note: "Sound, speed, pace, and how the game opens.",
        },
        {
          numeral: numeral(6),
          label: "Credits",
          hint: "",
          enabled: true,
          marked: false,
          action: { kind: "pane", pane: "credits" },
          note: "Who made this, and what with.",
        },
        {
          numeral: numeral(7),
          label: "Leave the Realm",
          hint: "Esc",
          enabled: true,
          marked: false,
          action: { kind: "pane", pane: "splash" },
          note: "Back to the gate.",
        },
      ];
      return { rows, note: EPIGRAPH, heading: null };
    }
  }
}

export function drawFrontScreen(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  mouse: { x: number; y: number },
  state: FrontState,
  difficulty: Difficulty,
  mapId: string,
): FrontHit[] {
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  if (state.pane === "splash") {
    const hits = drawSplash(ctx, W, H);
    ctx.restore();
    return hits;
  }

  // ── picture on the left, dark panel on the right ──
  //
  // The painting has its own title lettered into the middle of it. Laying a
  // translucent panel over that put two "REALMS OF VALOR" on the screen at once,
  // one of them upside-down in tone and half legible. So the picture is given
  // the left band only, anchored to its left edge -- which is where the figures
  // are -- and the panel is opaque. The painted title is off-screen rather than
  // dimmed, and the drawn one is the only one.
  const narrow = W < 900;
  const split = narrow ? 0 : 0.46;
  const splitX = Math.round(W * split);
  const art = menuArt();

  if (narrow) {
    if (art) drawCover(ctx, art, art.naturalWidth, art.naturalHeight, W, H);
    else drawSubstitute(ctx, W, H);
    ctx.fillStyle = "rgba(9,9,11,0.93)";
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, splitX, H);
    ctx.clip();
    if (art) {
      // Show roughly the left third of the painting -- the elf, the knight and
      // the dwarf -- and nothing of the lettering that starts just past it.
      // Scaled up until that slice fills the band, then biased downwards, since
      // the figures stand in the lower half and the sky is the expendable part.
      const CROP = 0.34;
      const scale = Math.max(splitX / (art.naturalWidth * CROP), H / art.naturalHeight);
      const dh = art.naturalHeight * scale;
      ctx.drawImage(art, 0, -(dh - H) * 0.55, art.naturalWidth * scale, dh);
    } else {
      drawSubstitute(ctx, splitX, H);
    }
    // Take the top off the picture's brightness so the panel is clearly the
    // thing being read.
    ctx.fillStyle = "rgba(9,9,11,0.22)";
    ctx.fillRect(0, 0, splitX, H);
    // Feather the last stretch into the panel rather than butting them together.
    const seam = ctx.createLinearGradient(splitX - 140, 0, splitX, 0);
    seam.addColorStop(0, "rgba(9,9,11,0)");
    seam.addColorStop(1, "rgba(9,9,11,0.95)");
    ctx.fillStyle = seam;
    ctx.fillRect(splitX - 140, 0, 140, H);
    ctx.restore();

    const panel = ctx.createLinearGradient(splitX, 0, W, H);
    panel.addColorStop(0, "#0c0c0e");
    panel.addColorStop(1, "#08080a");
    ctx.fillStyle = panel;
    ctx.fillRect(splitX, 0, W - splitX, H);
    ctx.fillStyle = "rgba(200,162,74,0.18)";
    ctx.fillRect(splitX, 0, 1, H);
  }

  // ── column geometry ──
  const x = narrow ? Math.max(28, W * 0.08) : Math.round(W * split) + Math.max(40, W * 0.045);
  const colW = Math.min(560, W - x - Math.max(28, W * 0.05));
  const right = x + colW;
  const gutter = 44;
  const labelX = x + gutter;

  const { rows, note, heading } = rowsFor(state, difficulty, mapId);

  // ── masthead ──
  let y = Math.max(58, H * 0.10);
  ctx.fillStyle = MUTED;
  ctx.font = "11px system-ui, sans-serif";
  tracked(ctx, heading ?? EYEBROW, x, y, 3.4);

  y += Math.round(Math.max(44, Math.min(64, H * 0.075)));
  const titleSize = Math.round(Math.max(34, Math.min(62, H * 0.074)));
  ctx.font = `${titleSize}px Georgia, 'Times New Roman', serif`;
  ctx.fillStyle = CREAM;
  tracked(ctx, TITLE_A, x, y, 2);
  y += Math.round(titleSize * 0.98);
  tracked(ctx, TITLE_B, x, y, 2);

  y += 22;
  const rule = ctx.createLinearGradient(x, 0, right, 0);
  rule.addColorStop(0, "rgba(200,162,74,0.85)");
  rule.addColorStop(1, "rgba(200,162,74,0.05)");
  ctx.fillStyle = rule;
  ctx.fillRect(x, y, colW, 1);

  y += 22;
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillStyle = MUTED;
  tracked(ctx, TAGLINE, x, y, 3);

  // ── rows ──
  const footerH = 96;
  const top = y + Math.max(30, H * 0.05);
  const space = H - top - footerH;
  const rowH = Math.round(Math.max(34, Math.min(58, space / Math.max(6, Math.min(rows.length, 9)))));
  const perPage = Math.max(3, Math.floor(space / rowH));

  // Keep the highlighted row on screen without the caller having to think about it.
  const maxScroll = Math.max(0, rows.length - perPage);
  const scroll = Math.max(0, Math.min(maxScroll, state.scroll));
  state.scroll = scroll;

  const hits: FrontHit[] = [];
  const labelSize = Math.round(Math.max(17, Math.min(27, rowH * 0.50)));
  let hovered: Row | null = null;
  let cursored: Row | null = null;

  for (let i = scroll; i < Math.min(rows.length, scroll + perPage); i++) {
    const r = rows[i]!;
    const ry = top + (i - scroll) * rowH;
    const over = mouse.x >= x && mouse.x < right && mouse.y >= ry && mouse.y < ry + rowH;
    const on = r.enabled && (over || (i === state.cursor && !inColumn(mouse, x, right, top, top + perPage * rowH)));
    if (over && r.enabled) hovered = r;
    if (i === state.cursor) cursored = r;

    if (r.enabled) hits.push({ x, y: ry, w: colW, h: rowH, action: r.action, enabled: true });

    if (on) {
      const wash = ctx.createLinearGradient(x, 0, right, 0);
      wash.addColorStop(0, "rgba(200,162,74,0.13)");
      wash.addColorStop(1, "rgba(200,162,74,0)");
      ctx.fillStyle = wash;
      ctx.fillRect(x, ry, colW, rowH);
      ctx.fillStyle = GOLD_HOT;
      ctx.fillRect(x - 10, ry + rowH * 0.22, 2, rowH * 0.56);
    }

    // numeral
    if (r.numeral) {
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = r.enabled ? (on ? GOLD : MUTED) : DIM;
      tracked(ctx, r.numeral, x + 4, ry + rowH / 2 + 4, 1.5);
    }

    // label
    ctx.font = `${labelSize}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = r.enabled ? (on ? "#fff6e2" : CREAM) : DIM;
    tracked(ctx, r.label.toUpperCase(), labelX, ry + rowH / 2 + labelSize * 0.36, 1.6);

    // the gold tick for a value that is currently in force
    if (r.marked) {
      const lw = trackedWidth(ctx, r.label.toUpperCase(), 1.6);
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(labelX + lw + 14, ry + rowH / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // hint
    if (r.hint) {
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = r.enabled ? (on ? "rgba(240,209,138,0.9)" : MUTED) : DIM;
      trackedRight(ctx, r.hint, right, ry + rowH / 2 + 4, 1.5);
    }
  }

  // Scroll marks, only when there is something past the edge.
  if (maxScroll > 0) {
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = MUTED;
    if (scroll > 0) ctx.fillText("▲", right + 10, top + 12);
    if (scroll < maxScroll) ctx.fillText("▼", right + 10, top + perPage * rowH - 4);
  }

  // ── the line under the column ──
  const shown = hovered ?? cursored;
  const blurb = shown?.note ?? note;
  if (blurb) {
    const by = top + perPage * rowH + 26;
    ctx.font = `italic ${Math.round(Math.max(13, Math.min(16, H * 0.021)))}px Georgia, serif`;
    const lines = wrap(ctx, blurb, colW - 18);
    ctx.fillStyle = "rgba(200,162,74,0.5)";
    ctx.fillRect(x, by - 13, 1, lines.length * 21 + 4);
    ctx.fillStyle = "rgba(239,228,205,0.78)";
    lines.forEach((ln, i) => ctx.fillText(ln, x + 14, by + i * 21));
  }

  // ── footer ──
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillStyle = DIM;
  tracked(ctx, `BUILD ${VERSION}    ARROWS TO MOVE    ENTER TO SELECT`, x, H - 28, 2.6);

  ctx.restore();
  return hits;
}

function inColumn(mouse: { x: number; y: number }, x: number, right: number, top: number, bottom: number): boolean {
  return mouse.x >= x && mouse.x < right && mouse.y >= top && mouse.y < bottom;
}

/** How many rows the current pane has — the keyboard needs it to clamp. */
export function frontRowCount(state: FrontState, difficulty: Difficulty, mapId: string): number {
  return rowsFor(state, difficulty, mapId).rows.length;
}

/** The action on a given row, for Enter. */
export function frontRowAction(state: FrontState, difficulty: Difficulty, mapId: string, i: number): FrontAction | null {
  const r = rowsFor(state, difficulty, mapId).rows[i];
  return r && r.enabled ? r.action : null;
}
