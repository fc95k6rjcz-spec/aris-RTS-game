import { BUILDINGS, BUILD_MENU } from "../data/buildings";
import { UNITS } from "../data/units";
import { Camera } from "../render/camera";
import { Renderer, type Ghost } from "../render/renderer";
import type { Command } from "../sim/commands";
import type { Building, Unit } from "../sim/entities";
import { SUB, Tile, type EntityId, type PlayerId } from "../sim/types";
import { Faction, TICKS_PER_SECOND, WILD, World } from "../sim/world";
import {
  drawFrontScreen,
  frontRowAction,
  frontRowCount,
  newFrontState,
  type FrontAction,
  type FrontHit,
  type FrontState,
} from "../ui/frontScreen";
import { drawHud, hudH, layoutButtons, minimapRect, panelX, TOP_H, type HudButton, type MenuPage } from "../ui/hud";
import { SkirmishAI, type Difficulty } from "../ai/skirmish";
import { loadSettings, saveSettings, settings } from "./settings";
import { createSettingsPanel, type SettingsPanel } from "../ui/settingsPanel";
import { createPauseButton, type PauseButton } from "../ui/pauseButton";
import { Audio } from "./audio";
import { MAPS, MAP_BY_ID, type MapDef } from "../data/maps";

const TICK_MS = 1000 / TICKS_PER_SECOND;
const EDGE = 14;
const EDGE_SPEED = 14;

/**
 * Client-side orchestration: input → commands → sim tick → render.
 * The local player's commands are queued and applied on the next tick,
 * exactly as they would be in a lockstep session.
 */
export class Game {
  world: World;
  cam: Camera;
  renderer: Renderer;
  readonly player: PlayerId = 1;

  private pending: Command[] = [];
  private selected = new Set<EntityId>();
  private buildMode: string | null = null;
  /** Which page of the worker build menu is showing. */
  private menuPage: MenuPage = "basic";
  /** Next left-click issues an attack-move rather than a selection. */
  private attackMoveMode = false;
  private mouse = { x: 0, y: 0, inside: false };
  private drag: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private keys = new Set<string>();
  private message: { text: string; until: number; level: "info" | "error" } | null = null;
  private buttons: HudButton[] = [];
  private ai: SkirmishAI | null = null;
  private acc = 0;
  private last = performance.now();
  private running = true;
  /** Test hook: number of ticks simulated. */
  ticks = 0;
  /** Faction picker shown before the first tick. */
  menu = true;
  /** Debug: freeze the sim but keep rendering. */
  paused = false;
  /** Where the pause screen's Surrender button is, while it is on screen. */
  private surrenderRect: { x: number; y: number; w: number; h: number } | null = null;
  /** Read-only view of the above, for tests that click it where it is drawn. */
  get surrenderRectForTest(): { x: number; y: number; w: number; h: number } | null {
    return this.surrenderRect;
  }
  /** Exposed for headless tests; the game itself reads the module directly. */
  readonly settingsForTest = settings;
  /** Which front-screen pane is showing, and where the keyboard cursor is. */
  private front: FrontState = newFrontState();
  /** Clickable rectangles the front screen put on the canvas this frame. */
  private frontHits: FrontHit[] = [];
  private difficulty: Difficulty = "normal";
  private settingsPanel: SettingsPanel | null = null;
  private pauseButton: PauseButton | null = null;
  /** Last state pushed to the button, so a direct write to `paused` still shows. */
  private shownPaused = false;
  private readonly audio = new Audio();
  /** Exposed for headless tests: commands queued but not yet stepped. */
  get pendingForTest(): Command[] {
    return this.pending;
  }

  /** Exposed for headless tests: the command card as laid out this frame. */
  get buttonsForTest(): HudButton[] {
    return this.buttons;
  }

  /** Exposed for headless tests; the game itself uses the field directly. */
  get audioForTest(): Audio {
    return this.audio;
  }

  /** The map this match is being played on. */
  map: MapDef = MAPS[0]!;

  constructor(readonly canvas: HTMLCanvasElement, seed?: number) {
    // Settings first: the renderer and the opening menu both read them.
    loadSettings();
    this.difficulty = settings.difficulty;
    const def = this.chooseMap();
    this.map = def;
    this.world = this.buildWorld(def, seed);
    this.cam = new Camera(this.world.map.width, this.world.map.height);
    this.renderer = new Renderer(canvas, this.world, this.cam);
    this.resize();
    const home = this.world.map.starts[0]!;
    this.cam.centerOn((home.x + 1) * SUB, (home.y + 1) * SUB);
    this.bind();
    // The panel is DOM, not canvas, so it is skipped in headless tests where
    // there is no document to hang it on.
    // Browsers will not start audio before a gesture, so this arms it on the
    // first click or key rather than trying (and failing) at load.
    this.audio.install();
    if (typeof document !== "undefined" && document.body) {
      this.pauseButton = createPauseButton(() => this.setPaused(!this.paused));
      this.pauseButton.sync(this.paused);
      this.settingsPanel = createSettingsPanel(() => {
        // A closed panel hands time back; an open one holds it. Reset the
        // accumulator so the sim does not try to catch up on the pause.
        this.last = performance.now();
        this.acc = 0;
        this.difficulty = settings.difficulty;
        // Volume, mute and the score's own switch all land here.
        if (settings.music) this.audio.startMusic();
        else this.audio.stopMusic();
        this.audio.syncMusic();
      });
    }
    requestAnimationFrame(this.frame);
  }

  /** The map the settings ask for, resolving "random" against the catalogue. */
  private chooseMap(): MapDef {
    const want = settings.mapId;
    if (want && want !== "random") {
      const found = MAP_BY_ID.get(want);
      if (found) return found;
    }
    // Random means random per match, not one map picked once at load.
    return MAPS[Math.floor(Math.random() * MAPS.length)] ?? MAPS[0]!;
  }

  /** A fresh world on the given map, with both players seated at its starts. */
  private buildWorld(def: MapDef, seedOverride?: number): World {
    const n = def.size ?? 64;
    const w = new World(n, n, seedOverride ?? def.seed, def.kind, settings.pace, settings.stockade);
    w.addPlayer(1, Faction.Human, "#3b82f6");
    w.addPlayer(2, Faction.Human, "#ef4444");
    // The country itself, and whatever lives in it.
    w.addPlayer(WILD, Faction.Human, "#8a6b3f");
    // Seats come from the map, not from two hard-coded corners, so a layout can
    // put them where it makes sense -- and so more than two will fit later.
    const starts = w.map.starts;
    if (settings.crowning) {
      // One peasant each, no king and no hall. Act one is finding the weapon.
      w.spawnCrowning(1, starts[0]!.x - 1, starts[0]!.y - 1);
      w.spawnCrowning(2, starts[1]!.x - 2, starts[1]!.y - 2);
    } else if (settings.nomad) {
      // Both sides start homeless, or it is not a fair race for the good ground.
      w.spawnNomad(1, starts[0]!.x - 1, starts[0]!.y - 1);
      w.spawnNomad(2, starts[1]!.x - 2, starts[1]!.y - 2);
    } else {
      w.spawnStart(1, starts[0]!.x - 1, starts[0]!.y - 1);
      w.spawnStart(2, starts[1]!.x - 2, starts[1]!.y - 2);
    }
    // Scaled to the board: the same dozen bears that fill a 64-tile map are
    // invisible on a 160-tile one.
    if (settings.wildlife) w.spawnWildlife(Math.round(6 * ((n * n) / (64 * 64))));
    return w;
  }

  /** Start the match against the chosen opponent, on a freshly built map. */
  start(difficulty: Difficulty = "normal"): void {
    this.menu = false;
    // Rebuild the world so the map choice takes effect and a second game is not
    // played on the wreckage of the first.
    this.map = this.chooseMap();
    this.world = this.buildWorld(this.map);
    // A new camera as well: it carries the map bounds it clamps against, and a
    // stale one would pin the view inside the old map's corner.
    this.cam = new Camera(this.world.map.width, this.world.map.height);
    this.renderer = new Renderer(this.canvas, this.world, this.cam);
    this.selected.clear();
    this.pending = [];
    this.buildMode = null;
    this.resize();
    const home = this.world.map.starts[0]!;
    this.cam.centerOn((home.x + 1) * SUB, (home.y + 1) * SUB);
    this.renderer.fx.clear();
    // Player 2 is run by the AI, issuing the same commands a human would.
    this.ai = difficulty === "none" ? null : new SkirmishAI(this.world, 2, difficulty);
    this.last = performance.now();
    this.acc = 0;
  }

  // ───────────────────────────── loop ─────────────────────────────

  private frame = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(250, now - this.last);
    this.last = now;
    if (this.menu) {
      this.render(0);
      this.drawMenu();
      requestAnimationFrame(this.frame);
      return;
    }
    // `paused` is public and the headless tests write it directly, so the button
    // follows the field rather than trusting every caller to go through
    // setPaused.
    if (this.paused !== this.shownPaused) {
      this.shownPaused = this.paused;
      this.pauseButton?.sync(this.paused);
    }
    const open = this.settingsPanel?.open === true;
    // Game speed is wall-clock only: it changes how often real time asks for a
    // tick, never what a tick computes, so the sim stays deterministic.
    const step = TICK_MS / Math.max(0.1, settings.gameSpeed);
    this.acc += open ? 0 : dt;
    if (!open) this.updateCamera(dt);
    while (this.acc >= step) {
      this.acc -= step;
      if (!this.paused) this.tick();
    }
    this.render(this.acc / step);
    requestAnimationFrame(this.frame);
  };

  /** Advance exactly one sim tick with whatever commands are queued. */
  tick(): void {
    if (this.menu) this.start();
    this.renderer.snapshot();
    const cmds = this.pending;
    this.pending = [];
    if (this.ai) cmds.push(...this.ai.think(this.world.tick));
    this.world.step(cmds);
    this.ticks++;
    // One tick's happenings, handed to the two things that show them. Neither
    // can write back, so the sim stays the only author of state.
    this.renderer.fx.apply(this.world.fx, this.world.tick);
    this.renderer.fx.resolve(this.world.units());
    this.renderer.fx.prune(this.world.tick);
    this.audio.fromEvents(this.world.fx, {
      x: this.cam.x + this.cam.viewW / this.cam.scale / 2,
      y: this.cam.y + this.cam.viewH / this.cam.scale / 2,
      r: this.cam.viewW / this.cam.scale / 2,
    });
    for (const ev of this.world.events) if (ev.player === this.player) this.toast(ev.text, ev.level);
    // Drop selections of entities that no longer exist.
    for (const id of this.selected) if (!this.world.entities.has(id)) this.selected.delete(id);
  }

  /**
   * The single way pause changes. Routing the keyboard, the button and anything
   * else through here means the control always shows the real state.
   */
  /**
   * Concede, and go back to the front screen.
   *
   * The match is marked lost rather than simply abandoned -- the opponent is
   * recorded as the winner -- so a surrendered game reads the same way to
   * everything downstream as one that was fought to the end.
   */
  surrender(): void {
    if (this.menu) return;
    const other = [...this.world.players.keys()].find((p) => p !== this.player && p !== WILD);
    this.world.winner = other ?? null;
    this.setPaused(false);
    this.surrenderRect = null;
    this.selected.clear();
    this.buildMode = null;
    this.menu = true;
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    // Hand time back cleanly: without this the accumulated milliseconds spent
    // paused are spent all at once on resume, and the game lurches forward.
    this.last = performance.now();
    this.acc = 0;
    this.pauseButton?.sync(paused);
  }

  issue(c: Command): void {
    this.pending.push(c);
  }

  stop(): void {
    this.running = false;
  }

  // ───────────────────────────── selection helpers ─────────────────────────────

  selectedUnits(): Unit[] {
    const out: Unit[] = [];
    for (const id of this.selected) {
      const e = this.world.entities.get(id);
      if (e?.kind === "unit") out.push(e);
    }
    return out;
  }
  selectedBuildings(): Building[] {
    const out: Building[] = [];
    for (const id of this.selected) {
      const e = this.world.entities.get(id);
      if (e?.kind === "building") out.push(e);
    }
    return out;
  }
  select(ids: EntityId[]): void {
    this.selected = new Set(ids);
    // A new selection always starts on the basic page.
    this.menuPage = "basic";
  }

  private toast(text: string, level: "info" | "error" = "error"): void {
    this.message = { text, until: performance.now() + 2500, level };
  }

  // ───────────────────────────── camera ─────────────────────────────

  private resize(): void {
    const dpr = 1; // Keep 1:1 for crisp, cheap rendering; bump for retina later.
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.cam.resize(this.canvas.width, this.canvas.height - hudH(this.canvas.height));
  }

  private updateCamera(dt: number): void {
    const k = (dt / 16.67) * EDGE_SPEED * settings.scrollSpeed;
    let dx = 0;
    let dy = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) dx -= k;
    if (this.keys.has("d") || this.keys.has("arrowright")) dx += k;
    if (this.keys.has("w") || this.keys.has("arrowup")) dy -= k;
    if (this.keys.has("s") || this.keys.has("arrowdown")) dy += k;
    if (settings.edgeScroll && this.mouse.inside && !this.drag) {
      if (this.mouse.x < EDGE) dx -= k;
      if (this.mouse.x > this.canvas.width - EDGE) dx += k;
      if (this.mouse.y < EDGE) dy -= k;
      if (this.mouse.y > this.canvas.height - EDGE && this.mouse.y < this.canvas.height) dy += k;
    }
    if (dx || dy) this.cam.pan(dx, dy);
  }

  // ───────────────────────────── input ─────────────────────────────

  private bind(): void {
    const c = this.canvas;
    window.addEventListener("resize", () => this.resize());
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("mouseenter", () => (this.mouse.inside = true));
    c.addEventListener("mouseleave", () => (this.mouse.inside = false));
    c.addEventListener("mousemove", (e) => {
      this.mouse.x = e.offsetX;
      this.mouse.y = e.offsetY;
      if (this.drag) {
        this.drag.x1 = e.offsetX;
        this.drag.y1 = e.offsetY;
      }
    });
    c.addEventListener("mousedown", (e) => this.onMouseDown(e));
    c.addEventListener("mouseup", (e) => this.onMouseUp(e));
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      // On the front screen the wheel scrolls the realm list; there is no camera
      // to zoom yet.
      if (this.menu) {
        this.runFront({ kind: "scroll", by: e.deltaY > 0 ? 1 : -1 });
        return;
      }
      this.cam.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });
    window.addEventListener("keydown", (e) => this.onKey(e));
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
  }

  private inViewport(x: number, y: number): boolean {
    return y >= TOP_H && y < this.canvas.height - hudH(this.canvas.height);
  }
  private inMinimap(x: number, y: number): boolean {
    const m = minimapRect(this.canvas.width, this.canvas.height);
    return x >= m.x && x < m.x + m.size && y >= m.y && y < m.y + m.size;
  }
  private minimapToWorld(x: number, y: number): { x: number; y: number } {
    const m = minimapRect(this.canvas.width, this.canvas.height);
    return {
      x: ((x - m.x) / m.size) * this.world.map.width * SUB,
      y: ((y - m.y) / m.size) * this.world.map.height * SUB,
    };
  }

  private onMouseDown(e: MouseEvent): void {
    const { offsetX: x, offsetY: y } = e;
    if (this.menu) {
      if (e.button !== 0) return;
      // Last match wins: the splash hands back one rectangle covering the whole
      // screen, and rows are pushed after it, so this picks the row when there
      // is one and the screen itself when there is not.
      let hit: FrontHit | null = null;
      for (const h of this.frontHits) {
        if (h.enabled && x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) hit = h;
      }
      if (hit) this.runFront(hit.action);
      return;
    }
    // The pause screen's Surrender button sits over the map, so it is checked
    // before anything the map would otherwise do with the click.
    if (e.button === 0 && this.paused && this.surrenderRect) {
      const r = this.surrenderRect;
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
        this.surrender();
        return;
      }
    }
    if (e.button === 0) {
      if (this.inMinimap(x, y)) {
        const w = this.minimapToWorld(x, y);
        this.cam.centerOn(w.x, w.y);
        return;
      }
      if (y >= this.canvas.height - hudH(this.canvas.height)) {
        this.clickHud(x, y);
        return;
      }
      if (!this.inViewport(x, y)) return;
      if (this.buildMode) {
        this.tryPlace();
        if (!e.shiftKey) this.buildMode = null;
        return;
      }
      if (this.attackMoveMode) {
        const w = this.cam.toWorld(x, y);
        const ids = this.selectedUnits().filter((u) => UNITS[u.def]!.damage > 0).map((u) => u.id);
        if (ids.length) this.issue({ type: "attackMove", player: this.player, units: ids, x: Math.round(w.x), y: Math.round(w.y) });
        this.attackMoveMode = false;
        return;
      }
      this.drag = { x0: x, y0: y, x1: x, y1: y };
    } else if (e.button === 2) {
      if (this.buildMode) {
        this.buildMode = null;
        return;
      }
      if (this.inMinimap(x, y)) {
        const w = this.minimapToWorld(x, y);
        this.contextOrder(w.x, w.y);
        return;
      }
      if (!this.inViewport(x, y)) return;
      const w = this.cam.toWorld(x, y);
      this.contextOrder(w.x, w.y);
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button !== 0 || !this.drag) return;
    const d = this.drag;
    this.drag = null;
    const isClick = Math.abs(d.x1 - d.x0) < 4 && Math.abs(d.y1 - d.y0) < 4;
    const shift = e.shiftKey;
    if (isClick) {
      const w = this.cam.toWorld(d.x0, d.y0);
      const hit = this.pick(w.x, w.y);
      if (hit === null) {
        if (!shift) this.selected.clear();
      } else if (shift) {
        if (this.selected.has(hit)) this.selected.delete(hit);
        else this.selected.add(hit);
      } else {
        this.selected = new Set([hit]);
      }
    } else {
      const a = this.cam.toWorld(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1));
      const b = this.cam.toWorld(Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
      const ids: EntityId[] = [];
      for (const u of this.world.units())
        if (u.owner === this.player && u.pos.x >= a.x && u.pos.x <= b.x && u.pos.y >= a.y && u.pos.y <= b.y) ids.push(u.id);
      if (!shift) this.selected.clear();
      for (const id of ids) this.selected.add(id);
    }
    // Mixed selections collapse to units (Warcraft behaviour).
    if (this.selectedUnits().length > 0) for (const b of this.selectedBuildings()) this.selected.delete(b.id);
  }

  /** Entity under a world point: units first (they're smaller), then buildings. */
  private pick(wx: number, wy: number): EntityId | null {
    let best: EntityId | null = null;
    let bestD = SUB * 0.6;
    for (const u of this.world.units()) {
      const d = Math.hypot(u.pos.x - wx, u.pos.y - wy);
      if (d < bestD) {
        bestD = d;
        best = u.id;
      }
    }
    if (best !== null) return best;
    const tx = Math.floor(wx / SUB);
    const ty = Math.floor(wy / SUB);
    if (!this.world.map.inBounds(tx, ty)) return null;
    const occ = this.world.map.occupant[this.world.map.idx(tx, ty)]!;
    return occ !== 0 ? occ : null;
  }

  private contextOrder(wx: number, wy: number): void {
    const units = this.selectedUnits().filter((u) => u.owner === this.player);
    const tx = Math.floor(wx / SUB);
    const ty = Math.floor(wy / SUB);
    const map = this.world.map;
    if (units.length === 0) {
      // Building selected → set rally.
      for (const b of this.selectedBuildings()) if (b.owner === this.player && b.complete) b.rally = { x: Math.round(wx), y: Math.round(wy) };
      return;
    }
    const ids = units.map((u) => u.id);
    if (map.inBounds(tx, ty)) {
      const t = map.get(tx, ty);
      const gatherers = units.filter((u) => UNITS[u.def]!.canGather).map((u) => u.id);
      if ((t === Tile.Gold || t === Tile.Tree) && gatherers.length > 0) {
        this.issue({ type: "gather", player: this.player, units: gatherers, tx, ty });
        const others = ids.filter((id) => !gatherers.includes(id));
        if (others.length) this.issue({ type: "move", player: this.player, units: others, x: Math.round(wx), y: Math.round(wy) });
        return;
      }
      // An enemy under the cursor is an attack order.
      const foe = this.pick(wx, wy);
      const fe = foe !== null ? this.world.entities.get(foe) : undefined;
      if (fe && fe.owner !== this.player) {
        const fighters = units.filter((u) => UNITS[u.def]!.damage > 0).map((u) => u.id);
        if (fighters.length > 0) {
          this.issue({ type: "attack", player: this.player, units: fighters, target: fe.id });
          return;
        }
      }
      const occ = map.occupant[map.idx(tx, ty)]!;
      const b = occ ? this.world.entities.get(occ) : undefined;
      if (b?.kind === "building" && b.owner === this.player) {
        const builders = units.filter((u) => UNITS[u.def]!.canBuild).map((u) => u.id);
        if (builders.length > 0 && (!b.complete || b.hp < b.maxHp)) {
          this.issue({ type: "repair", player: this.player, units: builders, target: b.id });
          return;
        }
      }
    }
    this.issue({ type: "move", player: this.player, units: ids, x: Math.round(wx), y: Math.round(wy) });
  }

  private ghost(): Ghost | null {
    if (!this.buildMode || !this.mouse.inside || !this.inViewport(this.mouse.x, this.mouse.y)) return null;
    const d = BUILDINGS[this.buildMode]!;
    const w = this.cam.toWorld(this.mouse.x, this.mouse.y);
    const tx = Math.floor(w.x / SUB - d.size / 2 + 0.5);
    const ty = Math.floor(w.y / SUB - d.size / 2 + 0.5);
    return { def: this.buildMode, owner: this.player, tx, ty, ok: this.world.placementError(this.player, this.buildMode, tx, ty) === null };
  }

  private tryPlace(): void {
    const g = this.ghost();
    if (!g) return;
    const err = this.world.placementError(this.player, g.def, g.tx, g.ty);
    if (err) {
      this.toast(err);
      return;
    }
    const builders = this.selectedUnits().filter((u) => UNITS[u.def]!.canBuild && u.owner === this.player);
    if (builders.length === 0) return;
    this.issue({ type: "build", player: this.player, units: builders.map((u) => u.id), building: g.def, tx: g.tx, ty: g.ty });
  }

  private clickHud(x: number, y: number): void {
    const btn = this.buttons.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
    if (btn) {
      if (btn.enabled) this.runButton(btn);
      return;
    }
    // Queue item click → cancel.
    const sb = this.selectedBuildings();
    if (sb.length === 1 && this.selectedUnits().length === 0) {
      const b = sb[0]!;
      const y0 = this.canvas.height - hudH(this.canvas.height);
      const px = panelX(this.canvas.height);
      if (y >= y0 + 80 && y < y0 + 104) {
        const i = Math.floor((x - (px + 56)) / 64);
        if (i >= 0 && i < b.queue.length) this.issue({ type: "cancelTrain", player: this.player, building: b.id, index: i });
      }
    }
  }

  private runButton(btn: HudButton): void {
    const a = btn.action;
    switch (a.type) {
      case "build":
        this.buildMode = a.def;
        break;
      case "train": {
        const b = this.selectedBuildings()[0];
        if (b) this.issue({ type: "train", player: this.player, building: b.id, unit: a.def });
        break;
      }
      case "harvest": {
        // Each worker is sent to his own nearest node rather than all of them to
        // one, so selecting six and pressing Harvest spreads them over the wood
        // instead of queueing them at a single trunk.
        const gatherers = this.selectedUnits().filter((u) => UNITS[u.def]!.canGather);
        if (gatherers.length === 0) {
          this.toast("Select a Worker first");
          break;
        }
        let sent = 0;
        for (const u of gatherers) {
          const node = this.world.nearestResource(Math.floor(u.pos.x / SUB), Math.floor(u.pos.y / SUB));
          if (!node) continue;
          this.issue({ type: "gather", player: this.player, units: [u.id], tx: node.x, ty: node.y });
          sent++;
        }
        if (sent === 0) this.toast("Nothing to harvest nearby");
        else this.toast(sent === 1 ? "Off to work" : `${sent} sent to work`, "info");
        break;
      }
      case "cancelBuild": {
        const b = this.selectedBuildings()[0];
        if (b) this.issue({ type: "cancelBuild", player: this.player, building: b.id });
        break;
      }
      case "cancelTrain": {
        const b = this.selectedBuildings()[0];
        if (b) this.issue({ type: "cancelTrain", player: this.player, building: b.id, index: a.index });
        break;
      }
      case "upgrade": {
        const b = this.selectedBuildings()[0];
        if (b) this.issue({ type: "upgrade", player: this.player, building: b.id });
        break;
      }
      case "cancelUpgrade": {
        const b = this.selectedBuildings()[0];
        if (b) this.issue({ type: "cancelUpgrade", player: this.player, building: b.id });
        break;
      }
      case "attack":
        this.attackMoveMode = true;
        this.toast("Attack-move: click a destination", "info");
        break;
      case "research": {
        const b = this.selectedBuildings()[0];
        if (b) this.issue({ type: "research", player: this.player, building: b.id, upgrade: a.id });
        break;
      }
      case "cancelResearch": {
        const b = this.selectedBuildings()[0];
        if (b) this.issue({ type: "cancelResearch", player: this.player, building: b.id });
        break;
      }
      case "page":
        this.menuPage = a.page;
        break;
      case "stop":
        this.issue({ type: "stop", player: this.player, units: this.selectedUnits().map((u) => u.id) });
        break;
    }
  }

  private onKey(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    if (this.menu) {
      // Any key at all opens the gate; after that the keyboard drives the column.
      if (this.front.pane === "splash") {
        this.runFront({ kind: "pane", pane: "menu" });
        return;
      }
      if (k === "arrowdown" || k === "s") this.moveFrontCursor(1);
      else if (k === "arrowup" || k === "w") this.moveFrontCursor(-1);
      else if (k === "enter" || k === " ") {
        const a = frontRowAction(this.front, this.difficulty, settings.mapId, this.front.cursor);
        if (a) this.runFront(a);
      } else if (k === "escape") {
        this.runFront({ kind: "pane", pane: this.front.pane === "menu" ? "splash" : "menu" });
      }
      return;
    }
    if (k === " " || k === "p") {
      e.preventDefault();
      this.setPaused(!this.paused);
      return;
    }
    if (k === "escape") {
      if (this.attackMoveMode) this.attackMoveMode = false;
      else if (this.buildMode) this.buildMode = null;
      else {
        const b = this.selectedBuildings()[0];
        if (b && !b.complete) this.issue({ type: "cancelBuild", player: this.player, building: b.id });
        else this.selected.clear();
      }
      return;
    }
    // Attack-move: press A then click, like every RTS.
    if (k === "a" && this.selectedUnits().some((u) => UNITS[u.def]!.damage > 0)) {
      this.attackMoveMode = true;
      this.toast("Attack-move: click a destination", "info");
      return;
    }
    // Hotkeys map to the current command card.
    const btn = this.buttons.find((b) => b.hotkey.toLowerCase() === k);
    if (btn && !e.ctrlKey && !e.metaKey) {
      if (btn.enabled) this.runButton(btn);
      else this.toast(btn.tooltip);
      return;
    }
    // Quick build hotkeys even when the card doesn't show (e.g. no worker selected → message).
    if (BUILD_MENU.some((id) => BUILDINGS[id]!.hotkey.toLowerCase() === k) && this.selectedUnits().length === 0) {
      this.toast("Select a Worker first");
    }
    this.keys.add(k);
  }

  // ───────────────────────────── menu ─────────────────────────────

  private drawMenu(): void {
    const ctx = this.canvas.getContext("2d")!;
    this.frontHits = drawFrontScreen(
      ctx,
      this.canvas.width,
      this.canvas.height,
      this.mouse,
      this.front,
      this.difficulty,
      settings.mapId,
    );
  }

  /**
   * One place where a front-screen row turns into something happening, so the
   * mouse and the keyboard cannot drift apart.
   */
  private runFront(a: FrontAction): void {
    switch (a.kind) {
      case "begin":
        this.start(this.difficulty);
        break;
      case "pane":
        this.front.pane = a.pane;
        this.front.cursor = 0;
        this.front.scroll = 0;
        break;
      case "difficulty":
        this.difficulty = a.value;
        settings.difficulty = a.value;
        saveSettings();
        break;
      case "map":
        settings.mapId = a.id;
        saveSettings();
        this.front.pane = "menu";
        this.front.cursor = 0;
        this.front.scroll = 0;
        break;
      case "settings":
        this.settingsPanel?.toggle();
        break;
      case "scroll":
        this.front.scroll = Math.max(0, this.front.scroll + a.by);
        break;
    }
  }

  /** Step the keyboard cursor past any rows that are not selectable. */
  private moveFrontCursor(step: number): void {
    const n = frontRowCount(this.front, this.difficulty, settings.mapId);
    if (n === 0) return;
    let i = this.front.cursor;
    for (let tries = 0; tries < n; tries++) {
      i = (i + step + n) % n;
      if (frontRowAction(this.front, this.difficulty, settings.mapId, i)) break;
    }
    this.front.cursor = i;
    // Keep the cursor in view in a list long enough to scroll. The draw clamps
    // `scroll` to what actually fits, so a generous window here is harmless.
    if (i < this.front.scroll) this.front.scroll = i;
    else if (i > this.front.scroll + 5) this.front.scroll = i - 5;
  }

  // ───────────────────────────── render ─────────────────────────────

  private render(alpha: number): void {
    const ctx = this.canvas.getContext("2d")!;
    ctx.fillStyle = "#0b0d10";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const selUnits = this.selectedUnits();
    const selBuildings = this.selectedBuildings();
    this.renderer.draw(alpha, this.selected, this.ghost(), this.drag, this.canvas.height - hudH(this.canvas.height));
    // Rally point for a selected building.
    for (const b of selBuildings) {
      if (!b.rally) continue;
      const p = this.cam.toScreen(b.rally.x, b.rally.y);
      ctx.strokeStyle = "#9cff9c";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y - 14);
      ctx.stroke();
      ctx.fillStyle = "#9cff9c";
      ctx.fillRect(p.x, p.y - 14, 8, 5);
    }
    this.buttons = layoutButtons(this.world, this.player, selUnits, selBuildings, this.canvas.width, this.canvas.height, this.menuPage);
    const hover = this.buttons.find((b) => this.mouse.x >= b.x && this.mouse.x < b.x + b.w && this.mouse.y >= b.y && this.mouse.y < b.y + b.h) ?? null;
    const msg = this.message && performance.now() < this.message.until ? this.message : null;
    const mode = this.buildMode ? `Placing ${BUILDINGS[this.buildMode]!.name} — click to place, right-click to cancel` : null;
    drawHud(ctx, this.world, this.player, selUnits, selBuildings, this.buttons, hover, this.canvas.width, this.canvas.height, msg, mode);
    // A paused game that looks identical to a running one is a support ticket.
    // The settings panel says so itself, so this only appears when the panel is
    // shut.
    if (this.paused && !this.menu && this.settingsPanel?.open !== true) {
      const cy = (this.canvas.height - hudH(this.canvas.height)) / 2;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(6,8,11,0.55)";
      ctx.fillRect(this.canvas.width / 2 - 96, cy - 26, 192, 52);
      ctx.strokeStyle = "rgba(160,180,210,0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(this.canvas.width / 2 - 96.5, cy - 26.5, 193, 53);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "600 20px system-ui, sans-serif";
      ctx.fillText("PAUSED", this.canvas.width / 2, cy - 5);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText("Space to resume", this.canvas.width / 2, cy + 16);

      // Surrender. Only offered from the pause screen, which is the one place a
      // player is deliberately stopped and thinking about whether to go on --
      // and it is two clicks from anything else, so nobody concedes a match by
      // brushing a button mid-fight.
      const r = { x: this.canvas.width / 2 - 70, y: cy + 40, w: 140, h: 32 };
      this.surrenderRect = r;
      const hot = this.mouse.x >= r.x && this.mouse.x < r.x + r.w && this.mouse.y >= r.y && this.mouse.y < r.y + r.h;
      ctx.fillStyle = hot ? "rgba(150,40,40,0.92)" : "rgba(60,20,20,0.8)";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = hot ? "#ff9b9b" : "rgba(190,110,110,0.6)";
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      ctx.fillStyle = "#ffd9d9";
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.fillText("Surrender", r.x + r.w / 2, r.y + r.h / 2 + 1);
      ctx.restore();
    } else {
      this.surrenderRect = null;
    }
    const mm = minimapRect(this.canvas.width, this.canvas.height);
    this.renderer.drawMinimap(mm.x, mm.y, mm.size, true);
  }
}
