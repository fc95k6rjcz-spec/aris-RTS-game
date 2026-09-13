/**
 * The game's chrome: top bar, bottom command bar, minimap, banners.
 *
 * Built from DOM rather than painted into the canvas, which is a reversal of
 * how this game used to work and worth explaining.
 *
 * Everything that sits *in* the world -- units, buildings, health bars, the
 * fog -- has to be drawn, because it has to line up with the world. Chrome does
 * not. Chrome is a form: rows of buttons with hover states, tabs, labels at
 * half a dozen sizes and letter-spacings, a description line that reflows. The
 * browser does every one of those things properly and for free, and the
 * canvas version was hand-rolling all of it -- hit testing, hover, text
 * metrics, wrapping -- badly and at a cost in code. The settings panel already
 * made this argument and won it; this is the same argument for the rest.
 *
 * What that buys, concretely: real fonts at real weights, crisp text at any
 * scale, hover and focus that work with the keyboard, and a layout that
 * compresses on a short laptop screen instead of clipping. What it costs is
 * that the canvas no longer owns the whole window -- it is one row of a grid --
 * so the camera's idea of its own size comes from the element, not the window.
 *
 * The canvas keeps the map, the minimap keeps its own small canvas, and
 * everything else here is elements.
 */

import type { HudButton } from "./hud";

/** One tile in the command grid. */
export interface ShellCommand {
  /** The tile's picture, or null for a command with no art yet. */
  art: string | null;
  label: string;
  /** "1200 · 800", or null for orders, which cost nothing. */
  cost: string | null;
  hotkey: string;
  enabled: boolean;
  description: string;
  action: HudButton["action"];
}

export interface ShellTab {
  id: string;
  label: string;
}

export interface ShellState {
  gold: number;
  lumber: number;
  oil: number;
  food: number;
  supplyUsed: number;
  supplyMax: number;
  /** Elapsed match time, as a day count and a clock. */
  day: number;
  clock: string;
  selection: {
    name: string;
    sub: string;
    hp: number;
    maxHp: number;
    portrait: string | null;
    /**
     * Everyone selected, when it is more than one.
     *
     * A group used to collapse to "2 SELECTED / KING AND OTHERS" over a single
     * empty portrait, which tells you the count and nothing else -- not who they
     * are, and not which of them is hurt. This is the roster.
     */
    members: Array<{ portrait: string | null; hp: number; maxHp: number; name: string }>;
  } | null;
  production: { name: string; progress: number; eta: string } | null;
  tabs: ShellTab[];
  activeTab: string;
  commands: ShellCommand[];
  /** The line across the top of the map: what is happening right now. */
  banner: string | null;
  /** The big centred proclamation, if one is up. */
  proclaim: { title: string; line: string } | null;
  /** The standing objective, while there is one. */
  objective: { title: string; line: string } | null;
  mapName: string;
  /** What the sky is doing, for the top bar. */
  weather: string;
  paused: boolean;
}

export interface Shell {
  /** Where the game canvas lives. Its size is the camera's size. */
  readonly viewport: HTMLElement;
  readonly minimap: HTMLCanvasElement;
  update(s: ShellState): void;
  /**
   * Chrome off while the front screen is up.
   *
   * The menu is painted on the canvas and wants the whole window; the game
   * wants the canvas to be the middle row of three. Rather than two layouts,
   * the bars are simply taken out of the grid and the row stretches to fill it.
   */
  setPlaying(on: boolean): void;
  onCommand(cb: (a: HudButton["action"]) => void): void;
  onTab(cb: (id: string) => void): void;
  onPause(cb: () => void): void;
  onSettings(cb: () => void): void;
  destroy(): void;
}

const IDLE_HINT = "Hover a command for detail. Dimmed entries are not yet available.";

const CSS = `
:root {
  --ink: #07070a;
  --panel-a: #13131a;
  --panel-b: #0c0c10;
  --gold: #d8b35a;
  --gold-bright: #e8c15e;
  --parchment: #f2e6c8;
  --body: #e9e2d2;
  --muted: #9a927e;
  --faint: #7e786a;
  --fainter: #6e685c;
  --rule: rgba(216,179,90,0.3);
  --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --display: Cinzel, Georgia, "Times New Roman", serif;
  --serif: "EB Garamond", Georgia, "Times New Roman", serif;
}
html, body { margin: 0; height: 100%; overflow: hidden; background: var(--ink); }
.rv-shell {
  position: fixed; inset: 0;
  display: grid; grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100vh; overflow: hidden;
  font-family: var(--mono); color: var(--body);
  background: #0a0a0c;
}

/* ── top bar ── */
.rv-top {
  height: 46px; padding: 0 16px;
  display: flex; align-items: center; gap: 10px;
  background: linear-gradient(180deg, #14141a 0%, #0d0d11 100%);
  border-bottom: 1px solid var(--rule);
  box-shadow: 0 6px 18px rgba(0,0,0,0.55);
}
.rv-res {
  display: flex; align-items: baseline; gap: 8px;
  padding: 5px 12px; border: 1px solid rgba(255,255,255,0.1);
}
.rv-res .mk { width: 8px; height: 8px; align-self: center; }
.rv-res .lb { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); }
.rv-res .vl { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.rv-res.gold { background: rgba(216,179,90,0.09); border-color: rgba(216,179,90,0.26); }
.rv-res.gold .mk { background: var(--gold-bright); transform: rotate(45deg); }
.rv-res.gold .vl { color: var(--parchment); }
.rv-res.lumber { background: rgba(120,150,90,0.08); }
.rv-res.lumber .mk { background: #8fae63; }
.rv-res.lumber .vl { color: #e4ecd8; }
.rv-res.food { background: rgba(196,120,70,0.08); }
.rv-res.food .mk { background: #d08a55; border-radius: 50% 50% 40% 40%; }
.rv-res.food .vl { color: #f0ddc8; }
.rv-res.oil { background: rgba(255,255,255,0.03); }
.rv-res.oil .mk { background: #5c6470; border-radius: 50%; }
.rv-res.oil .lb { color: var(--faint); }
.rv-res.oil .vl { color: #8d8878; }
.rv-div { width: 1px; height: 22px; background: rgba(255,255,255,0.12); margin: 0 4px; }
.rv-supply { display: flex; align-items: center; gap: 8px; padding: 5px 12px; }
.rv-supply .lb { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); }
.rv-supply .vl { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--parchment); }
.rv-supply .den { color: var(--faint); }
.rv-ticks { display: flex; gap: 2px; }
.rv-ticks i { width: 3px; height: 12px; background: rgba(255,255,255,0.14); }
.rv-ticks i.on { background: var(--gold-bright); }
.rv-spacer { flex: 1; }
.rv-clock { display: flex; align-items: baseline; gap: 8px; margin-right: 6px; }
.rv-clock .day { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--faint); }
.rv-clock .sky { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); margin-right: 4px; }
.rv-clock .sky.wet { color: #8fb6d8; }
.rv-clock .time { font-size: 13px; color: #c9c2b0; font-variant-numeric: tabular-nums; }
.rv-icon {
  width: 30px; height: 30px; padding: 0; cursor: pointer;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
  color: #cfc8b6; font-family: var(--mono); font-size: 12px;
}
.rv-icon:hover { background: rgba(216,179,90,0.16); border-color: var(--gold); color: #fff4d8; }

/* ── map viewport ── */
.rv-view { position: relative; overflow: hidden; background: #06080a; min-height: 0; }
.rv-view > canvas { display: block; width: 100%; height: 100%; cursor: crosshair; }
.rv-vig { position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 90px 30px rgba(4,5,7,0.75); }
.rv-banner {
  position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px; padding: 6px 14px;
  background: rgba(10,10,12,0.82); border: 1px solid var(--rule);
  font-size: 11px; letter-spacing: 0.16em; white-space: nowrap; color: var(--body);
  pointer-events: none;
}
.rv-banner i { width: 6px; height: 6px; background: var(--gold-bright); }
/* display:flex outranks the [hidden] attribute, so a hidden banner stayed laid
   out and sat in the sky as an empty box. The settings panel learned this the
   same way. */
.rv-banner[hidden] { display: none; }

/* The shell carries its own pause and settings buttons, so the free-floating
   ones from before would be a second pair in the same corner. */
.rts-gear, .rts-pause { display: none !important; }
.rv-obj {
  position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
  padding: 8px 18px; text-align: center; pointer-events: none;
  background: rgba(10,10,12,0.82); border: 1px solid var(--rule);
}
.rv-obj .t { font-size: 11px; letter-spacing: 0.18em; color: var(--gold-bright); font-weight: 600; }
.rv-obj .l { margin-top: 4px; font-size: 12px; color: #cbd3da; }
.rv-proclaim {
  position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%);
  padding: 14px 34px; text-align: center; pointer-events: none;
  background: rgba(8,8,10,0.78); border: 1px solid rgba(216,179,90,0.5);
  transition: opacity 500ms ease;
}
.rv-proclaim .t {
  font-family: var(--display); font-size: clamp(22px, 2.6vw, 38px);
  letter-spacing: 0.1em; color: var(--gold-bright);
}
.rv-proclaim .l { margin-top: 6px; font-family: var(--serif); font-size: 15px; color: #e6ded0; }

/* ── bottom bar ── */
.rv-bottom {
  display: grid;
  grid-template-columns: minmax(220px, 270px) minmax(0, 1fr) minmax(190px, 240px);
  gap: 1px; background: rgba(216,179,90,0.22);
  height: clamp(214px, 24vh, 232px);
  border-top: 1px solid rgba(216,179,90,0.34);
}
.rv-pane { background: linear-gradient(180deg, var(--panel-a) 0%, var(--panel-b) 100%); min-width: 0; min-height: 0; }

/* selection */
.rv-sel { padding: 10px 14px; display: grid; grid-template-rows: auto minmax(0,1fr); gap: 10px; }
.rv-sel .who { display: flex; gap: 12px; }
.rv-port {
  width: 56px; height: 56px; flex: none; border: 1px solid rgba(216,179,90,0.35);
  background: #14161b;
  background-image: repeating-linear-gradient(135deg, rgba(216,179,90,0.16) 0 3px, rgba(0,0,0,0) 3px 7px);
  background-size: cover; background-position: center top;
}
/* The roster, when more than one thing is selected. */
.rv-roster { display: flex; flex-wrap: wrap; gap: 5px; align-content: flex-start; min-height: 0; overflow: hidden; }
.rv-face { width: 42px; }
.rv-face .pic {
  width: 42px; height: 42px; border: 1px solid rgba(216,179,90,0.35);
  background: #14161b center top / cover no-repeat;
  background-image: repeating-linear-gradient(135deg, rgba(216,179,90,0.16) 0 3px, rgba(0,0,0,0) 3px 7px);
}
.rv-face .hp { margin-top: 2px; height: 3px; background: rgba(255,255,255,0.12); }
.rv-face .hp i { display: block; height: 100%; background: #6fae4e; }
.rv-face .hp i.hurt { background: #d8b35a; }
.rv-face .hp i.bad { background: #c4553f; }
.rv-sel .nm { font-family: var(--display); font-size: 17px; font-weight: 700; letter-spacing: 0.06em; color: var(--parchment); }
.rv-sel .sb { margin-top: 3px; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); }
.rv-hp { margin-top: 8px; display: flex; align-items: center; gap: 8px; }
.rv-hp .track { width: 108px; height: 6px; background: rgba(255,255,255,0.1); }
.rv-hp .fill { height: 100%; background: #6fae4e; }
.rv-hp .val { font-size: 11px; color: #c9c2b0; font-variant-numeric: tabular-nums; }
.rv-prod .lb { font-size: 9px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--fainter); }
.rv-prod .row { margin-top: 6px; display: flex; align-items: center; gap: 10px; }
.rv-prod .nm { font-size: 12px; white-space: nowrap; }
.rv-prod .track { flex: 1; height: 4px; background: rgba(255,255,255,0.1); }
.rv-prod .fill { height: 100%; background: var(--gold); }
.rv-prod .eta { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.rv-empty { font-family: var(--serif); font-style: italic; font-size: 14px; color: #8b8676; }

/* commands */
.rv-cmd { padding: 9px 14px 10px; display: grid; grid-template-rows: auto minmax(0,1fr) auto; gap: 8px; }
.rv-tabs { display: flex; align-items: center; gap: 6px; }
.rv-tab {
  padding: 6px 14px; cursor: pointer; font-family: var(--mono);
  font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); color: var(--muted);
}
.rv-tab:hover { color: #fff4d8; }
.rv-tab.on { background: rgba(216,179,90,0.16); border-color: var(--gold); color: var(--parchment); }
.rv-hints { margin-left: auto; display: flex; gap: 18px; font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--fainter); }
.rv-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  grid-auto-rows: minmax(0, 1fr); gap: 6px; min-height: 0; overflow: hidden;
}
.rv-tile {
  position: relative; overflow: hidden;
  padding: 6px 8px; display: flex; flex-direction: column; justify-content: space-between;
  text-align: left; font-family: var(--mono); cursor: pointer; min-width: 0;
  background: rgba(216,179,90,0.10); border: 1px solid rgba(216,179,90,0.4); color: var(--parchment);
  background-size: cover; background-position: center;
}
/* Painted tiles need their own contrast: the art runs edge to edge, so the
   label and the cost row sit on gradients of their own rather than on whatever
   the picture happens to be doing there. */
.rv-tile.art::before, .rv-tile.art::after {
  content: ""; position: absolute; left: 0; right: 0; pointer-events: none;
}
.rv-tile.art::before { top: 0; height: 46%; background: linear-gradient(180deg, rgba(8,8,10,0.88) 0%, rgba(8,8,10,0.45) 55%, rgba(8,8,10,0) 100%); }
.rv-tile.art::after { bottom: 0; height: 42%; background: linear-gradient(0deg, rgba(8,8,10,0.9) 0%, rgba(8,8,10,0.4) 60%, rgba(8,8,10,0) 100%); }
.rv-tile.art .lb, .rv-tile.art .ft { position: relative; z-index: 1; }
.rv-tile.art .lb { text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
.rv-tile.art.off { filter: grayscale(0.75) brightness(0.55); }
.rv-tile .lb { font-size: 11px; line-height: 1.25; letter-spacing: 0.04em; }
.rv-tile .ft { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
.rv-tile .ct { font-size: 9px; font-variant-numeric: tabular-nums; color: #b6ae9c; }
.rv-tile .ky { font-size: 9px; font-weight: 600; color: var(--gold); }
.rv-tile:hover { border-color: var(--gold); }
.rv-tile.off {
  background: rgba(255,255,255,0.025); border-color: rgba(255,255,255,0.08);
  color: #8b8676; cursor: not-allowed;
}
.rv-tile.off .ct, .rv-tile.off .ky { color: var(--fainter); }
.rv-desc {
  min-height: 2.1em; padding-left: 10px; border-left: 1px solid var(--rule);
  font-family: var(--serif); font-style: italic; font-size: 14px; color: #b6ae9c;
}

/* minimap */
.rv-mini { padding: 10px; display: grid; grid-template-rows: auto minmax(0,1fr); gap: 8px; }
.rv-mini .hd { display: flex; justify-content: space-between; font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; }
.rv-mini .hd .nm { color: var(--fainter); }
.rv-mini .hd .kb { color: var(--muted); }
.rv-mini .body { border: 1px solid var(--rule); min-height: 0; position: relative; background: #0b1310; }
.rv-mini canvas { display: block; width: 100%; height: 100%; cursor: pointer; }

.rv-shell.menu > .rv-top, .rv-shell.menu > .rv-bottom { display: none; }
.rv-shell.menu > .rv-view > .rv-vig { display: none; }

@media (prefers-reduced-motion: reduce) {
  .rv-proclaim { transition: none; }
}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/**
 * Build the chrome and hand back the hole the game draws into.
 *
 * The canvas is moved rather than created: it already exists in the document
 * and the game is already holding a reference to it, so re-parenting it keeps
 * every one of those references valid.
 */
export function createShell(canvas: HTMLCanvasElement): Shell {
  const style = el("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  // Type the game actually wants, rather than whatever the browser has lying
  // about. Loaded from Google's CDN with a real fallback stack behind it, so a
  // machine with no network gets Georgia and a monospace and still reads fine.
  const fonts = el("link");
  fonts.rel = "stylesheet";
  fonts.href =
    "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=EB+Garamond:ital@0;1&family=IBM+Plex+Mono:wght@400;600&display=swap";
  document.head.appendChild(fonts);

  const root = el("div", "rv-shell");

  // ── top ──
  const top = el("div", "rv-top");
  const mkRes = (cls: string, label: string) => {
    const box = el("div", `rv-res ${cls}`);
    const mk = el("i", "mk");
    const lb = el("span", "lb", label);
    const vl = el("span", "vl", "0");
    box.append(mk, lb, vl);
    top.appendChild(box);
    return vl;
  };
  const goldVal = mkRes("gold", "Gold");
  const lumberVal = mkRes("lumber", "Lumber");
  const foodVal = mkRes("food", "Food");
  const oilVal = mkRes("oil", "Oil");
  top.appendChild(el("div", "rv-div"));
  const supply = el("div", "rv-supply");
  const supLb = el("span", "lb", "Supply");
  const supVal = el("span", "vl");
  const supUsed = document.createTextNode("0");
  const supDen = el("span", "den", "/0");
  supVal.append(supUsed, supDen);
  const ticks = el("div", "rv-ticks");
  supply.append(supLb, supVal, ticks);
  top.appendChild(supply);
  top.appendChild(el("div", "rv-spacer"));
  const clock = el("div", "rv-clock");
  const skyEl = el("span", "sky", "Clear");
  const dayEl = el("span", "day", "Day 1");
  const timeEl = el("span", "time", "0:00");
  clock.append(skyEl, dayEl, timeEl);
  const pauseBtn = el("button", "rv-icon", "II");
  pauseBtn.title = "Pause (Space)";
  const gearBtn = el("button", "rv-icon", "⚙");
  gearBtn.title = "Settings";
  top.append(clock, pauseBtn, gearBtn);

  // ── viewport ──
  const view = el("div", "rv-view");
  view.appendChild(canvas);
  const vig = el("div", "rv-vig");
  const banner = el("div", "rv-banner");
  const bannerDot = el("i");
  const bannerText = el("span");
  banner.append(bannerDot, bannerText);
  banner.hidden = true;
  const objective = el("div", "rv-obj");
  const objT = el("div", "t");
  const objL = el("div", "l");
  objective.append(objT, objL);
  objective.hidden = true;
  const proclaim = el("div", "rv-proclaim");
  const procT = el("div", "t");
  const procL = el("div", "l");
  proclaim.append(procT, procL);
  proclaim.hidden = true;
  view.append(vig, banner, objective, proclaim);

  // ── bottom ──
  const bottom = el("div", "rv-bottom");

  const sel = el("div", "rv-pane rv-sel");
  const who = el("div", "who");
  const port = el("div", "rv-port");
  const whoText = el("div");
  const selName = el("div", "nm", "—");
  const selSub = el("div", "sb", "Nothing selected");
  const hp = el("div", "rv-hp");
  const hpTrack = el("div", "track");
  const hpFill = el("div", "fill");
  hpTrack.appendChild(hpFill);
  const hpVal = el("span", "val", "");
  hp.append(hpTrack, hpVal);
  whoText.append(selName, selSub, hp);
  who.append(port, whoText);
  const roster = el("div", "rv-roster");
  const prod = el("div", "rv-prod");
  sel.append(who, roster, prod);

  const cmd = el("div", "rv-pane rv-cmd");
  const tabRow = el("div", "rv-tabs");
  const hints = el("div", "rv-hints");
  hints.append(el("span", undefined, "Right-click to order"), el("span", undefined, "A + click to attack-move"));
  const grid = el("div", "rv-grid");
  const desc = el("div", "rv-desc", IDLE_HINT);
  cmd.append(tabRow, grid, desc);

  const mini = el("div", "rv-pane rv-mini");
  const miniHd = el("div", "hd");
  const miniName = el("span", "nm", "");
  miniHd.append(miniName, el("span", "kb", "Tab"));
  const miniBody = el("div", "body");
  const minimap = el("canvas");
  miniBody.appendChild(minimap);
  mini.append(miniHd, miniBody);

  bottom.append(sel, cmd, mini);
  root.append(top, view, bottom);
  document.body.appendChild(root);

  let onCmd: (a: HudButton["action"]) => void = () => {};
  let onTabCb: (id: string) => void = () => {};
  pauseBtn.addEventListener("click", () => pauseCb());
  gearBtn.addEventListener("click", () => gearCb());
  let pauseCb: () => void = () => {};
  let gearCb: () => void = () => {};

  // Rebuilding the grid every frame would throw away hover and focus sixty
  // times a second, so tiles are reused and only their contents change.
  const tiles: Array<{ node: HTMLButtonElement; lb: HTMLElement; ct: HTMLElement; ky: HTMLElement; cmd: ShellCommand | null }> = [];
  let hovered: string | null = null;

  const ensureTiles = (n: number) => {
    while (tiles.length < n) {
      const node = el("button", "rv-tile");
      const lb = el("span", "lb");
      const ft = el("span", "ft");
      const ct = el("span", "ct");
      const ky = el("span", "ky");
      ft.append(ct, ky);
      node.append(lb, ft);
      const entry = { node, lb, ct, ky, cmd: null as ShellCommand | null };
      node.addEventListener("mouseenter", () => {
        hovered = entry.cmd?.description ?? null;
        desc.textContent = hovered ?? IDLE_HINT;
      });
      node.addEventListener("mouseleave", () => {
        hovered = null;
        desc.textContent = IDLE_HINT;
      });
      node.addEventListener("click", () => {
        // A dimmed tile is hoverable, so its description can say what it wants,
        // but it does nothing when pressed.
        if (entry.cmd?.enabled) onCmd(entry.cmd.action);
      });
      tiles.push(entry);
      grid.appendChild(node);
    }
    while (tiles.length > n) {
      const t = tiles.pop()!;
      t.node.remove();
    }
  };

  const tabNodes = new Map<string, HTMLElement>();
  const syncTabs = (list: ShellTab[], active: string) => {
    const wanted = list.map((t) => t.id).join("|");
    if (tabRow.dataset.sig !== wanted) {
      tabRow.dataset.sig = wanted;
      for (const n of tabNodes.values()) n.remove();
      tabNodes.clear();
      for (const t of list) {
        const b = el("button", "rv-tab", t.label);
        b.addEventListener("click", () => {
          onTabCb(t.id);
          hovered = null;
          desc.textContent = IDLE_HINT;
        });
        tabNodes.set(t.id, b);
        tabRow.appendChild(b);
      }
      tabRow.appendChild(hints);
    }
    for (const [id, n] of tabNodes) n.classList.toggle("on", id === active);
  };

  let tickCount = 0;

  return {
    viewport: view,
    minimap,
    update(s: ShellState): void {
      goldVal.textContent = String(s.gold);
      lumberVal.textContent = String(s.lumber);
      foodVal.textContent = String(s.food);
      oilVal.textContent = String(s.oil);
      supUsed.nodeValue = String(s.supplyUsed);
      supDen.textContent = `/${s.supplyMax}`;
      // The tick strip is capped so a big supply cap does not paint a hundred
      // hairlines into a 200px panel.
      const want = Math.min(24, Math.max(0, s.supplyMax));
      if (tickCount !== want) {
        tickCount = want;
        ticks.textContent = "";
        for (let i = 0; i < want; i++) ticks.appendChild(el("i"));
      }
      const on = Math.round((s.supplyUsed / Math.max(1, s.supplyMax)) * want);
      ticks.childNodes.forEach((n, i) => (n as HTMLElement).classList.toggle("on", i < on));

      dayEl.textContent = `Day ${s.day}`;
      skyEl.textContent = s.weather;
      skyEl.classList.toggle("wet", s.weather === "Rain" || s.weather === "Storm");
      timeEl.textContent = s.clock;
      pauseBtn.textContent = s.paused ? "▶" : "II";

      if (s.selection) {
        selName.textContent = s.selection.name;
        selSub.textContent = s.selection.sub;
        hp.hidden = false;
        hpFill.style.width = `${Math.max(0, Math.min(100, (s.selection.hp / Math.max(1, s.selection.maxHp)) * 100))}%`;
        hpVal.textContent = `${Math.ceil(s.selection.hp)}/${s.selection.maxHp}`;
        port.style.visibility = "visible";
        port.style.backgroundImage = s.selection.portrait ? `url(${s.selection.portrait})` : "";
        // One face per selected unit, each with its own health, so a group tells
        // you who is in it and which of them is hurt.
        const want = s.selection.members;
        roster.hidden = want.length < 2;
        if (want.length >= 2) {
          while (roster.childElementCount > want.length) roster.lastElementChild!.remove();
          while (roster.childElementCount < want.length) {
            const f = el("div", "rv-face");
            const pic = el("div", "pic");
            const bar = el("div", "hp");
            bar.appendChild(el("i"));
            f.append(pic, bar);
            roster.appendChild(f);
          }
          want.forEach((m, i) => {
            const f = roster.children[i] as HTMLElement;
            const pic = f.firstElementChild as HTMLElement;
            const fill = f.lastElementChild!.firstElementChild as HTMLElement;
            pic.style.backgroundImage = m.portrait ? `url(${m.portrait})` : "";
            pic.title = m.name;
            const frac = Math.max(0, Math.min(1, m.hp / Math.max(1, m.maxHp)));
            fill.style.width = `${frac * 100}%`;
            fill.className = frac > 0.6 ? "" : frac > 0.3 ? "hurt" : "bad";
          });
        }
      } else {
        selName.textContent = "—";
        selSub.textContent = "Nothing selected";
        hp.hidden = true;
        roster.hidden = true;
        port.style.visibility = "hidden";
        port.style.backgroundImage = "";
      }

      if (s.production) {
        if (!prod.dataset.on) {
          prod.dataset.on = "1";
          prod.textContent = "";
          const lb = el("div", "lb", "Building");
          const row = el("div", "row");
          row.append(el("span", "nm"), (() => { const t = el("div", "track"); t.appendChild(el("div", "fill")); return t; })(), el("span", "eta"));
          prod.append(lb, row);
        }
        (prod.querySelector(".nm") as HTMLElement).textContent = s.production.name;
        (prod.querySelector(".fill") as HTMLElement).style.width = `${Math.round(s.production.progress * 100)}%`;
        (prod.querySelector(".eta") as HTMLElement).textContent = s.production.eta;
      } else if (prod.dataset.on) {
        delete prod.dataset.on;
        prod.textContent = "";
      }

      syncTabs(s.tabs, s.activeTab);
      ensureTiles(s.commands.length);
      s.commands.forEach((c, i) => {
        const t = tiles[i]!;
        t.cmd = c;
        if (t.lb.textContent !== c.label) t.lb.textContent = c.label;
        const cost = c.cost ?? "";
        if (t.ct.textContent !== cost) t.ct.textContent = cost;
        if (t.ky.textContent !== c.hotkey) t.ky.textContent = c.hotkey;
        t.node.classList.toggle("off", !c.enabled);
        const art = c.art ? `url(${c.art})` : "";
        if (t.node.style.backgroundImage !== art) t.node.style.backgroundImage = art;
        t.node.classList.toggle("art", !!c.art);
      });
      if (!hovered) desc.textContent = IDLE_HINT;

      // An empty string is not a banner; showing the chrome round nothing put a
      // small blank box in the middle of the sky.
      banner.hidden = !s.banner;
      if (s.banner) bannerText.textContent = s.banner;
      objective.hidden = !s.objective?.title;
      if (s.objective) {
        objT.textContent = s.objective.title;
        objL.textContent = s.objective.line;
      }
      proclaim.hidden = s.proclaim === null;
      if (s.proclaim) {
        procT.textContent = s.proclaim.title;
        procL.textContent = s.proclaim.line;
      }
      miniName.textContent = s.mapName;
    },
    setPlaying(on: boolean): void {
      root.classList.toggle("menu", !on);
    },
    onCommand(cb) {
      onCmd = cb;
    },
    onTab(cb) {
      onTabCb = cb;
    },
    onPause(cb) {
      pauseCb = cb;
    },
    onSettings(cb) {
      gearCb = cb;
    },
    destroy() {
      root.remove();
      style.remove();
    },
  };
}
