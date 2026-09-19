import { buildingName, BUILDINGS, BUILD_MENU } from "../data/buildings";
import { unitName, UNITS } from "../data/units";
import { Camera } from "../render/camera";
import { spriteImage } from "../render/sprites";
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
import { commandSets, compass, describeTask, hudH, layoutButtons, type HudButton, type MenuPage } from "../ui/hud";
import { createShell, type Shell, type ShellCommand, type ShellState } from "../ui/shell";
import { commandArt, portraitArt } from "../ui/art";
import { SkirmishAI, type Difficulty } from "../ai/skirmish";
import { loadSettings, saveSettings, settings } from "./settings";
import { createSettingsPanel, type SettingsPanel } from "../ui/settingsPanel";
import { createPauseButton, type PauseButton } from "../ui/pauseButton";
import { Audio } from "./audio";
import { MAPS, MAP_BY_ID, type MapDef } from "../data/maps";
import { WEAPON_OF } from "../sim/relic";
import crowning0 from "../assets/anim/crowning_0.png";
import crowning1 from "../assets/anim/crowning_1.png";
import crowning2 from "../assets/anim/crowning_2.png";
import crowning3 from "../assets/anim/crowning_3.png";
import { Lockstep, LocalTransport, type Transport } from "../net/lockstep";
import { host as hostRoom, join as joinRoom, type MatchSetup, type Room } from "../net/room";
import { clockAt, dayAt, phaseAt, phaseName, skyName } from "../sim/weather";

const TICK_MS = 1000 / TICKS_PER_SECOND;
/** How long the crowning plays for, in milliseconds. */
const CROWNING_MS = 2600;

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
  /**
   * Which seat this machine is playing.
   *
   * One in a single-player game and for whoever hosts a network match; two for
   * the guest. Not readonly any more, because the guest only learns which seat
   * it has when the host answers its knock.
   */
  player: PlayerId = 1;

  /**
   * The turn scheduler. Every game goes through it, including this one.
   *
   * Single-player uses a transport with no network behind it and no input
   * delay, which collapses the whole thing back to "apply what was queued, then
   * tick" -- exactly what the loop did before. That is the point: the lockstep
   * path is the only path, so it is exercised every time anybody plays and
   * cannot rot while nobody is looking at multiplayer.
   */
  private net: Lockstep = new Lockstep(new LocalTransport());
  private pending: Command[] = [];
  private selected = new Set<EntityId>();
  private buildMode: string | null = null;
  /** Which page of the worker build menu is showing. */
  private menuPage: MenuPage = "basic";
  /** Next left-click issues an attack-move rather than a selection. */
  private attackMoveMode = false;
  private mouse = { x: 0, y: 0, inside: false };
  private drag: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** Middle-mouse camera drag, in screen pixels. */
  private panDrag: { x: number; y: number } | null = null;
  /** Smoothed camera velocity, screen pixels per frame at 60 Hz. */
  private camVelocity = { x: 0, y: 0 };
  /** Classic RTS control groups. UI state only; unit ids are cleaned every tick. */
  private controlGroups = new Map<number, Set<EntityId>>();
  /** Last single-click, for same-type double-click selection. */
  private lastUnitClick: { id: EntityId; at: number } | null = null;
  /** Presentation-only order pings. They never enter the simulation. */
  private commandMarkers: Array<{ x: number; y: number; kind: "move" | "attack" | "gather" | "repair"; at: number }> = [];
  private keys = new Set<string>();
  private message: { text: string; until: number; level: "info" | "error" } | null = null;
  /**
   * A big centred line, for the two moments in a match that deserve one.
   *
   * Separate from the toast: a toast is "you cannot afford that" and belongs in
   * the corner of your eye. This is the game speaking, and it is allowed to
   * interrupt.
   */
  private banner: { title: string; line: string; until: number } | null = null;
  private buttons: HudButton[] = [];
  private ai: SkirmishAI | null = null;
  private acc = 0;
  private last = performance.now();
  private running = true;
  /** Last menu state pushed to the chrome, so the class is only toggled on change. */
  private shownMenu = true;
  /**
   * The crowning, while it is playing.
   *
   * Four painted frames -- reach, grasp, pull, raise -- shown where it actually
   * happened. The whole opening is a walk towards this moment, and it used to
   * be a line of text in the corner of the screen. It plays once, at the
   * relic's own position, and then the game carries on.
   */
  private crowningAt: { x: number; y: number; at: number } | null = null;
  /** Whether this player's king has already been proclaimed, so it happens once. */
  private crowned = false;
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
  /** The room this machine is in, if any. */
  private room: Room | null = null;
  /** Set before start() to play over a network instead of alone. */
  transport: Transport | null = null;
  /**
   * The match both machines must build, when there are two of them.
   *
   * Both sides construct their own world from nothing and have to construct
   * the SAME one, so the seed, the map and every setting the simulation reads
   * come down the wire from the host and override whatever this machine had
   * chosen for itself. Settings the simulation does not read -- volume, health
   * bars, edge scrolling -- are left alone, which is exactly why they were
   * separated in the first place.
   */
  setup: MatchSetup | null = null;
  private settingsPanel: SettingsPanel | null = null;
  /** The DOM chrome: top bar, command bar, minimap. Null in headless tests. */
  private shell: Shell | null = null;
  /** Which command tab is showing. */
  private tab = "build";
  private pauseButton: PauseButton | null = null;
  /** Last state pushed to the button, so a direct write to `paused` still shows. */
  private shownPaused = false;
  private readonly audio = new Audio();
  /** Exposed for headless tests: drive the lobby without a mouse. */
  hostForTest(): void {
    void this.openRoom();
  }
  joinForTest(code: string): void {
    this.front.net.typed = code;
    void this.knock();
  }
  get frontNetForTest(): { code: string; typed: string; status: string } {
    return this.front.net;
  }
  get netStateForTest(): string {
    return this.net.state(performance.now()).kind;
  }

  /** Exposed for headless tests: which command tab is showing. */
  set tabForTest(id: string) {
    this.tab = id;
  }

  /** Exposed for headless tests: the labels currently on the front screen. */
  get frontRowsForTest(): string[] {
    return this.frontHits.map((h) => h.action.kind);
  }

  /** Exposed for headless tests: the camera, for driving zoom and position. */
  get cameraForTest(): Camera {
    return this.cam;
  }

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
    const home = this.world.map.starts[this.player === 2 ? 1 : 0] ?? this.world.map.starts[0]!;
    this.cam.centerOn((home.x + 1) * SUB, (home.y + 1) * SUB);
    // The chrome first: it re-parents the canvas into its own grid row, and the
    // camera's size comes from that element rather than from the window.
    if (typeof document !== "undefined" && document.body) {
      this.shell = createShell(this.canvas);
      this.shell.onCommand((a) => this.runAction(a));
      this.shell.onTab((id) => {
        this.tab = id;
      });
      this.shell.onPause(() => this.setPaused(!this.paused));
      this.shell.onSettings(() => this.settingsPanel?.toggle());
      this.bindMinimap(this.shell.minimap);
      // The game opens on the front screen, which wants the whole window. The
      // frame loop only toggles this on a change, so the opening state has to
      // be set here or it never gets set at all.
      this.shell.setPlaying(!this.menu);
      this.shownMenu = this.menu;
      this.resize();
    }
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
    // In a network game the map is not this machine's to pick.
    if (this.setup) return MAP_BY_ID.get(this.setup.mapId) ?? MAPS[0]!;
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
    const m = this.setup;
    const w = new World(n, n, seedOverride ?? m?.seed ?? def.seed, def.kind, m?.pace ?? settings.pace, m?.stockade ?? settings.stockade);
    w.addPlayer(1, Faction.Human, "#3b82f6");
    w.addPlayer(2, Faction.Human, "#ef4444");
    // The country itself, and whatever lives in it.
    w.addPlayer(WILD, Faction.Human, "#8a6b3f");
    // Seats come from the map, not from two hard-coded corners, so a layout can
    // put them where it makes sense -- and so more than two will fit later.
    const starts = w.map.starts;
    const crowning = m?.crowning ?? settings.crowning;
    const nomad = m?.nomad ?? settings.nomad;
    const wild = m?.wildlife ?? settings.wildlife;
    if (crowning) {
      // One peasant each, no king and no hall. Act one is finding the weapon.
      w.spawnCrowning(1, starts[0]!.x - 1, starts[0]!.y - 1);
      w.spawnCrowning(2, starts[1]!.x - 2, starts[1]!.y - 2);
    } else if (nomad) {
      // Both sides start homeless, or it is not a fair race for the good ground.
      w.spawnNomad(1, starts[0]!.x - 1, starts[0]!.y - 1);
      w.spawnNomad(2, starts[1]!.x - 2, starts[1]!.y - 2);
    } else {
      w.spawnStart(1, starts[0]!.x - 1, starts[0]!.y - 1);
      w.spawnStart(2, starts[1]!.x - 2, starts[1]!.y - 2);
    }
    // Scaled to the board: the same dozen bears that fill a 64-tile map are
    // invisible on a 160-tile one.
    if (wild) w.spawnWildlife(Math.round(6 * ((n * n) / (64 * 64))));
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
    // Fog, unit colours and the minimap are all drawn from one seat's point of
    // view, and the guest's is not seat one.
    this.renderer.viewer = this.player;
    this.selected.clear();
    this.controlGroups.clear();
    this.commandMarkers = [];
    this.pending = [];
    this.buildMode = null;
    // A fresh scheduler for a fresh match: turn numbers start again, and a
    // stale one would be waiting on orders from the last game.
    this.net.close();
    this.net = new Lockstep(this.transport ?? new LocalTransport());
    this.net.start();
    this.resize();
    const home = this.world.map.starts[this.player === 2 ? 1 : 0] ?? this.world.map.starts[0]!;
    this.cam.centerOn((home.x + 1) * SUB, (home.y + 1) * SUB);
    this.renderer.fx.clear();
    // Player 2 is run by the AI, issuing the same commands a human would.
    // Nobody plays the other seat in a network game; there is somebody in it.
    this.ai = this.transport || difficulty === "none" ? null : new SkirmishAI(this.world, 2, difficulty);
    this.banner = null;
    this.crowned = false;
    // The crowning opening sends one unarmed man into fog full of bears. Say so.
    if (this.setup?.crowning ?? settings.crowning) {
      this.proclaim("BEWARE THE DEEP WOOD", "Your clan's weapon lies out past the treeline. Those who wander alone do not always come back.", 9000);
    }
    this.last = performance.now();
    this.acc = 0;
  }

  // ───────────────────────────── loop ─────────────────────────────

  private frame = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(250, now - this.last);
    this.last = now;
    // Chrome on or off, and the canvas resized to match, but only when it
    // actually changes -- this runs sixty times a second.
    if (this.menu !== this.shownMenu) {
      this.shownMenu = this.menu;
      this.shell?.setPlaying(!this.menu);
      this.resize();
    }
    if (this.menu) {
      // The front screen fills the canvas by itself; there is nothing to show
      // behind it.
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

  /**
   * Advance exactly one sim tick with whatever orders the scheduler hands over.
   *
   * It may hand over nothing, when a turn's orders have not all arrived. That
   * is not a failure -- it is the classic RTS stall, and every client stops at
   * the same turn, which is precisely why they stay identical. Rendering keeps
   * going, so the game does not appear frozen; it simply stops advancing.
   */
  tick(): void {
    if (this.menu) this.start();
    const turn = this.net.nextTick(performance.now(), () => this.world.checksum());
    if (!turn) return;
    this.renderer.snapshot();
    const cmds = turn.commands;
    // The AI is local and is not a seat: it plays on whichever machine is
    // running it. In a network game there is no AI, so this never fires.
    if (this.ai) cmds.push(...this.ai.think(this.world.tick));
    this.world.step(cmds);
    this.ticks++;
    // One tick's happenings, handed to the two things that show them. Neither
    // can write back, so the sim stays the only author of state.
    // The one moment the whole opening is waiting on.
    if (!this.crowned) {
      for (const e of this.world.fx) {
        if (e.kind === "crowned" && e.owner === this.player) {
          this.crowned = true;
          this.crowningAt = { x: e.x, y: e.y, at: performance.now() };
          // The banner waits for the pull: shouting "a King is born" over a man
          // still bending down gives the moment away before it happens.
          window.setTimeout(() => this.proclaim("A KING IS BORN", "Raise your hall. The valley is yours to take.", 6000), CROWNING_MS * 0.72);
          break;
        }
      }
    }
    this.renderer.fx.apply(this.world.fx, this.world.tick);
    this.renderer.fx.resolve(this.world.units());
    this.renderer.fx.prune(this.world.tick);
    this.audio.fromEvents(this.world.fx, {
      x: this.cam.x + this.cam.viewW / this.cam.scale / 2,
      y: this.cam.y + this.cam.viewH / this.cam.scale / 2,
      r: this.cam.viewW / this.cam.scale / 2,
    });
    for (const ev of this.world.events) if (ev.player === this.player) this.toast(ev.text, ev.level);
    // Drop selections and control-group members that no longer exist.
    for (const id of this.selected) if (!this.world.entities.has(id)) this.selected.delete(id);
    for (const [n, ids] of this.controlGroups) {
      for (const id of ids) if (!this.world.entities.has(id)) ids.delete(id);
      if (ids.size === 0) this.controlGroups.delete(n);
    }
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
    this.net.issue(c);
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

  private proclaim(title: string, line: string, ms: number): void {
    this.banner = { title, line, until: performance.now() + ms };
  }

  // ───────────────────────────── camera ─────────────────────────────

  /**
   * The canvas is one row of the shell's grid, not the window.
   *
   * Its backing store is set to the element's own pixel size, so the map fills
   * exactly the space the layout gave it and the camera's idea of its extent
   * matches what a click lands on. Without the shell -- headless tests -- it
   * falls back to the window, where it is the only thing on the page.
   */
  private resize(): void {
    const host = this.shell?.viewport;
    const w = host ? Math.max(1, Math.round(host.clientWidth)) : window.innerWidth;
    const h = host ? Math.max(1, Math.round(host.clientHeight)) : window.innerHeight;
    this.canvas.width = w;
    this.canvas.height = h;
    // Without the shell the old bottom bar is still notionally there.
    this.cam.resize(w, host ? h : h - hudH(h));
    const mm = this.shell?.minimap;
    if (mm) {
      mm.width = Math.max(1, Math.round(mm.clientWidth));
      mm.height = Math.max(1, Math.round(mm.clientHeight));
    }
  }

  /** Click or drag the minimap to move the camera. */
  private bindMinimap(mm: HTMLCanvasElement): void {
    const jump = (e: MouseEvent) => {
      const r = mm.getBoundingClientRect();
      const fx = (e.clientX - r.left) / Math.max(1, r.width);
      const fy = (e.clientY - r.top) / Math.max(1, r.height);
      this.cam.centerOn(fx * this.world.map.width * SUB - this.cam.viewW / this.cam.zoom / 2 * SUB, fy * this.world.map.height * SUB - this.cam.viewH / this.cam.zoom / 2 * SUB);
    };
    mm.addEventListener("mousedown", (e) => {
      e.preventDefault();
      jump(e);
      const move = (m: MouseEvent) => jump(m);
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });
  }

  private updateCamera(dt: number): void {
    const frame = Math.min(3, dt / 16.67);
    const top = EDGE_SPEED * settings.scrollSpeed;
    let wantX = 0;
    let wantY = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) wantX -= top;
    if (this.keys.has("d") || this.keys.has("arrowright")) wantX += top;
    if (this.keys.has("w") || this.keys.has("arrowup")) wantY -= top;
    if (this.keys.has("s") || this.keys.has("arrowdown")) wantY += top;
    if (settings.edgeScroll && this.mouse.inside && !this.drag && !this.panDrag) {
      if (this.mouse.x < EDGE) wantX -= top;
      if (this.mouse.x > this.canvas.width - EDGE) wantX += top;
      if (this.mouse.y < EDGE) wantY -= top;
      if (this.mouse.y > this.canvas.height - EDGE && this.mouse.y < this.canvas.height) wantY += top;
    }
    // Quick acceleration and a softer coast make keyboard/edge scrolling feel
    // deliberate without leaving the camera drifting after the player lets go.
    const accel = 1 - Math.pow(wantX || wantY ? 0.58 : 0.28, frame);
    this.camVelocity.x += (wantX - this.camVelocity.x) * accel;
    this.camVelocity.y += (wantY - this.camVelocity.y) * accel;
    if (Math.abs(this.camVelocity.x) < 0.05) this.camVelocity.x = 0;
    if (Math.abs(this.camVelocity.y) < 0.05) this.camVelocity.y = 0;
    if (this.camVelocity.x || this.camVelocity.y) this.cam.pan(this.camVelocity.x * frame, this.camVelocity.y * frame);
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
      if (this.panDrag) {
        this.cam.pan(this.panDrag.x - e.offsetX, this.panDrag.y - e.offsetY);
        this.panDrag = { x: e.offsetX, y: e.offsetY };
        this.camVelocity.x = 0;
        this.camVelocity.y = 0;
      } else if (this.drag) {
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
      this.cam.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.09 : 1 / 1.09);
    }, { passive: false });
    window.addEventListener("keydown", (e) => this.onKey(e));
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
  }

  /**
   * The canvas holds the map and nothing else now, so every point on it is in
   * the viewport. The bars above and below are elements, and the minimap has a
   * canvas of its own -- neither can be clicked through to the map by accident,
   * which is what these three tests used to be for.
   */
  private inViewport(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.canvas.width && y < this.canvas.height;
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
      if (!this.inViewport(x, y)) return;
      if (this.buildMode) {
        this.tryPlace();
        if (!e.shiftKey) this.buildMode = null;
        return;
      }
      if (this.attackMoveMode) {
        const w = this.cam.toWorld(x, y);
        const fighters = this.selectedUnits().filter((u) => UNITS[u.def]!.damage > 0);
        for (const target of this.formationTargets(fighters, w.x, w.y))
          this.issue({ type: "attackMove", player: this.player, units: [target.unit.id], x: target.x, y: target.y });
        if (fighters.length) this.marker(w.x, w.y, "attack");
        this.attackMoveMode = false;
        return;
      }
      this.drag = { x0: x, y0: y, x1: x, y1: y };
    } else if (e.button === 1) {
      if (!this.inViewport(x, y)) return;
      e.preventDefault();
      this.panDrag = { x, y };
      this.camVelocity.x = 0;
      this.camVelocity.y = 0;
    } else if (e.button === 2) {
      if (this.buildMode) {
        this.buildMode = null;
        return;
      }
      if (!this.inViewport(x, y)) return;
      const w = this.cam.toWorld(x, y);
      this.contextOrder(w.x, w.y, e.shiftKey);
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 1) {
      this.panDrag = null;
      return;
    }
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
        const entity = this.world.entities.get(hit);
        const now = performance.now();
        const double = entity?.kind === "unit" && entity.owner === this.player && this.lastUnitClick?.id === hit && now - this.lastUnitClick.at < 360;
        if (double && entity?.kind === "unit") {
          const ids: EntityId[] = [];
          for (const u of this.world.units()) {
            if (u.owner !== this.player || u.def !== entity.def || !this.world.canSeeEntity(this.player, u)) continue;
            const p = this.cam.toScreen(u.pos.x, u.pos.y);
            if (p.x >= 0 && p.y >= 0 && p.x < this.cam.viewW && p.y < this.cam.viewH) ids.push(u.id);
          }
          this.selected = new Set(ids);
          this.lastUnitClick = null;
        } else {
          this.selected = new Set([hit]);
          this.lastUnitClick = entity?.kind === "unit" && entity.owner === this.player ? { id: hit, at: now } : null;
        }
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

  /**
   * Give a group distinct destinations around the clicked point.
   *
   * This is deliberately client-side: the result is a set of ordinary,
   * serialisable move commands, so the simulation still receives nothing but
   * commands and lockstep peers receive the exact same destinations.
   */
  private formationTargets(units: Unit[], wx: number, wy: number): Array<{ unit: Unit; x: number; y: number }> {
    if (units.length <= 1) return units.map((unit) => ({ unit, x: Math.round(wx), y: Math.round(wy) }));

    const cx = units.reduce((n, u) => n + u.pos.x, 0) / units.length;
    const cy = units.reduce((n, u) => n + u.pos.y, 0) / units.length;
    let fx = wx - cx;
    let fy = wy - cy;
    const fm = Math.hypot(fx, fy);
    if (fm < 1) {
      fx = 0;
      fy = -1;
    } else {
      fx /= fm;
      fy /= fm;
    }
    const rx = -fy;
    const ry = fx;

    // Front-line first, then short ranged, long ranged/air, and siege/heavy.
    // Id is the tie-breaker, making repeated orders stable rather than shuffling.
    const role = (u: Unit): number => {
      const d = UNITS[u.def]!;
      if (d.domain === "air") return 3;
      if (d.range >= 4) return 3;
      if (d.range >= 2) return 2;
      if (d.speed <= 4 && d.damage > 0) return 4;
      return 1;
    };
    const ordered = [...units].sort((a, b) => role(a) - role(b) || a.id - b.id);
    const cols = Math.max(2, Math.ceil(Math.sqrt(ordered.length * 1.6)));
    const spacing = SUB * (ordered.some((u) => UNITS[u.def]!.domain === "sea") ? 1.35 : 0.92);
    const out: Array<{ unit: Unit; x: number; y: number }> = [];

    for (let i = 0; i < ordered.length; i++) {
      const unit = ordered[i]!;
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, ordered.length - row * cols);
      const col = i % cols;
      const side = (col - (inRow - 1) / 2) * spacing;
      const back = row * spacing;
      let x = Math.round(wx + rx * side - fx * back);
      let y = Math.round(wy + ry * side - fy * back);

      // If a slot lands in water/rock/building, spiral locally for a valid tile
      // rather than sending the whole formation back onto the centre point.
      const domain = UNITS[unit.def]!.domain;
      let tx = Math.floor(x / SUB);
      let ty = Math.floor(y / SUB);
      if (!this.world.map.isWalkable(tx, ty, domain)) {
        let found = false;
        for (let ring = 1; ring <= 4 && !found; ring++) {
          for (let dy = -ring; dy <= ring && !found; dy++) {
            for (let dx = -ring; dx <= ring; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
              const nx = tx + dx;
              const ny = ty + dy;
              if (!this.world.map.isWalkable(nx, ny, domain)) continue;
              tx = nx;
              ty = ny;
              x = nx * SUB + SUB / 2;
              y = ny * SUB + SUB / 2;
              found = true;
              break;
            }
          }
        }
      }
      out.push({ unit, x, y });
    }
    return out;
  }

  private marker(x: number, y: number, kind: "move" | "attack" | "gather" | "repair"): void {
    this.commandMarkers.push({ x, y, kind, at: performance.now() });
    if (this.commandMarkers.length > 12) this.commandMarkers.shift();
  }

  private contextOrder(wx: number, wy: number, queue = false): void {
    const units = this.selectedUnits().filter((u) => u.owner === this.player);
    const tx = Math.floor(wx / SUB);
    const ty = Math.floor(wy / SUB);
    const map = this.world.map;
    if (units.length === 0) {
      for (const b of this.selectedBuildings()) {
        if (b.owner === this.player && b.complete) {
          this.issue({ type: "setRally", player: this.player, building: b.id, x: Math.round(wx), y: Math.round(wy) });
          this.marker(wx, wy, "move");
        }
      }
      return;
    }
    const ids = units.map((u) => u.id);
    if (map.inBounds(tx, ty)) {
      const t = map.get(tx, ty);
      const gatherers = units.filter((u) => UNITS[u.def]!.canGather).map((u) => u.id);
      if ((t === Tile.Gold || t === Tile.Tree) && gatherers.length > 0) {
        this.issue({ type: "gather", player: this.player, units: gatherers, tx, ty });
        const others = units.filter((u) => !gatherers.includes(u.id));
        for (const target of this.formationTargets(others, wx, wy))
          this.issue({ type: "move", player: this.player, units: [target.unit.id], x: target.x, y: target.y, queue });
        this.marker(wx, wy, "gather");
        return;
      }
      const foe = this.pick(wx, wy);
      const fe = foe !== null ? this.world.entities.get(foe) : undefined;
      if (fe && fe.owner !== this.player) {
        const fighters = units.filter((u) => UNITS[u.def]!.damage > 0).map((u) => u.id);
        if (fighters.length > 0) {
          this.issue({ type: "attack", player: this.player, units: fighters, target: fe.id });
          this.marker(wx, wy, "attack");
          return;
        }
      }
      const occ = map.occupant[map.idx(tx, ty)]!;
      const b = occ ? this.world.entities.get(occ) : undefined;
      if (b?.kind === "building" && b.owner === this.player) {
        const builders = units.filter((u) => UNITS[u.def]!.canBuild).map((u) => u.id);
        if (builders.length > 0 && (!b.complete || b.hp < b.maxHp)) {
          this.issue({ type: "repair", player: this.player, units: builders, target: b.id });
          this.marker(wx, wy, "repair");
          return;
        }
      }
    }
    for (const target of this.formationTargets(units, wx, wy))
      this.issue({ type: "move", player: this.player, units: [target.unit.id], x: target.x, y: target.y, queue });
    this.marker(wx, wy, "move");
  }

  /**
   * The big line, drawn over the map and nothing else.
   *
   * Sits high rather than dead centre so it is not on top of whatever the player
   * is looking at, and fades out over its last second so it leaves rather than
   * vanishes.
   */
  private drawBanner(ctx: CanvasRenderingContext2D): void {
    const b = this.banner;
    if (!b) return;
    const left = b.until - performance.now();
    if (left <= 0) {
      this.banner = null;
      return;
    }
    const W = this.canvas.width;
    // Low, just above the command bar. High up it sat on top of the objective
    // line and, worse, on top of the only bit of map you can actually see in
    // the opening.
    const y = this.canvas.height - hudH(this.canvas.height) - 74;
    const fade = Math.min(1, left / 800);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const size = Math.round(Math.max(26, Math.min(46, W * 0.032)));
    ctx.font = `${size}px Georgia, 'Times New Roman', serif`;
    const tw = Math.max(ctx.measureText(b.title).width, 0);
    ctx.font = "15px Georgia, serif";
    const lw = ctx.measureText(b.line).width;
    const boxW = Math.min(W - 48, Math.max(tw, lw) + 72);
    ctx.fillStyle = "rgba(8,8,10,0.72)";
    ctx.fillRect(W / 2 - boxW / 2, y - size, boxW, size * 2 + 18);
    ctx.strokeStyle = "rgba(200,162,74,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(W / 2 - boxW / 2 + 0.5, y - size + 0.5, boxW - 1, size * 2 + 17);
    ctx.font = `${size}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = "#e8c547";
    ctx.fillText(b.title, W / 2, y - size * 0.1);
    ctx.font = "15px Georgia, serif";
    ctx.fillStyle = "rgba(230,222,208,0.9)";
    // Wrapped by hand would be better; at these lengths one line is enough and
    // the box grows to fit it.
    ctx.fillText(b.line, W / 2, y + size * 0.72);
    ctx.restore();
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
  }

  private runButton(btn: HudButton): void {
    this.runAction(btn.action);
  }

  /** One place a command turns into something happening, whatever pressed it. */
  private runAction(a: HudButton["action"]): void {
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
      // The join screen takes typing before it takes navigation: W and S are
      // letters here, not up and down.
      if (this.front.pane === "join") {
        if (k === "backspace") {
          this.front.net.typed = this.front.net.typed.slice(0, -1);
          this.front.net.status = "";
          return;
        }
        if (k.length === 1 && /[a-z0-9]/.test(k) && this.front.net.typed.length < 4) {
          this.front.net.typed += k.toUpperCase();
          this.front.net.status = "";
          return;
        }
        if (k === "enter") {
          void this.knock();
          return;
        }
      }
      if (k === "arrowdown" || k === "s") this.moveFrontCursor(1);
      else if (k === "arrowup" || k === "w") this.moveFrontCursor(-1);
      else if (k === "enter" || k === " ") {
        const a = frontRowAction(this.front, this.difficulty, settings.mapId, this.front.cursor);
        if (a) this.runFront(a);
      } else if (k === "escape") {
        if (this.front.pane === "host") this.runFront({ kind: "leaveRoom" });
        else if (this.front.pane === "join") this.runFront({ kind: "pane", pane: "multiplayer" });
        else if (this.front.pane === "multiplayer") this.runFront({ kind: "pane", pane: "menu" });
        else this.runFront({ kind: "pane", pane: this.front.pane === "menu" ? "splash" : "menu" });
      }
      return;
    }
    if (k === " " || k === "p") {
      e.preventDefault();
      this.setPaused(!this.paused);
      return;
    }
    if (/^[1-9]$/.test(k)) {
      const n = Number(k);
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const ids = this.selectedUnits().filter((u) => u.owner === this.player).map((u) => u.id);
        this.controlGroups.set(n, new Set(ids));
        this.toast(ids.length ? `Group ${n} set — ${ids.length} unit${ids.length === 1 ? "" : "s"}` : `Group ${n} cleared`, "info");
      } else if (e.shiftKey) {
        const group = this.controlGroups.get(n) ?? new Set<EntityId>();
        for (const u of this.selectedUnits()) if (u.owner === this.player) group.add(u.id);
        this.controlGroups.set(n, group);
        this.toast(`Added to group ${n}`, "info");
      } else {
        const group = this.controlGroups.get(n);
        if (group) {
          this.selected = new Set([...group].filter((id) => this.world.entities.has(id)));
          const units = this.selectedUnits();
          if (units.length) {
            const now = performance.now();
            const double = this.lastUnitClick?.id === -n && now - this.lastUnitClick.at < 360;
            if (double) {
              const cx = units.reduce((s, u) => s + u.pos.x, 0) / units.length;
              const cy = units.reduce((s, u) => s + u.pos.y, 0) / units.length;
              this.cam.centerOn(cx, cy);
            }
            this.lastUnitClick = { id: -n as EntityId, at: now };
          }
        }
      }
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
      case "host":
        void this.openRoom();
        break;
      case "join":
        void this.knock();
        break;
      case "leaveRoom":
        this.closeRoom();
        this.front.pane = "multiplayer";
        this.front.cursor = 0;
        break;
      case "scroll":
        this.front.scroll = Math.max(0, this.front.scroll + a.by);
        break;
    }
  }

  /**
   * The match this machine would like to play, to send to whoever joins.
   *
   * The host's own settings, snapshotted: everything the simulation reads and
   * nothing it does not. The seed is rolled here rather than taken from the map
   * so that two matches on the same map are still different games.
   */
  private proposal(): MatchSetup {
    const map = this.chooseMap();
    return {
      seed: (Math.random() * 0x7fffffff) | 0,
      mapId: map.id,
      pace: settings.pace,
      stockade: settings.stockade,
      crowning: settings.crowning,
      nomad: settings.nomad,
      wildlife: settings.wildlife,
    };
  }

  /** Open a room and wait for a friend to walk in. */
  private async openRoom(): Promise<void> {
    this.front.pane = "host";
    this.front.cursor = 0;
    this.front.net = { code: "", typed: "", status: "Opening a room…", busy: true };
    try {
      const room = await hostRoom(this.proposal(), (e) => {
        if (e.kind === "waiting") {
          this.front.net.code = e.code;
          this.front.net.status = "Waiting for your friend to join.";
        }
      });
      this.beginNetworkMatch(room);
    } catch (err) {
      this.front.net = { code: "", typed: "", status: err instanceof Error ? err.message : "Could not open a room.", busy: false };
      this.front.pane = "multiplayer";
      this.front.cursor = 0;
    }
  }

  /** Knock on somebody else's room. */
  private async knock(): Promise<void> {
    const code = this.front.net.typed;
    if (code.length !== 4) return;
    this.front.net.status = `Knocking on ${code}…`;
    this.front.net.busy = true;
    try {
      const room = await joinRoom(code, () => {});
      this.beginNetworkMatch(room);
    } catch (err) {
      this.front.net.status = err instanceof Error ? err.message : "Could not join.";
      this.front.net.busy = false;
    }
  }

  /**
   * Sit down and play.
   *
   * The seat, the transport and the agreed match are all set before start(),
   * because start() is what builds the world and every one of them changes what
   * it builds.
   */
  private beginNetworkMatch(room: Room): void {
    this.room = room;
    this.transport = room.transport;
    this.setup = room.setup;
    this.player = room.slot === 0 ? 1 : 2;
    this.front.net.status = "";
    this.start("none");
  }

  private closeRoom(): void {
    this.room?.transport.close();
    this.room = null;
    this.transport = null;
    this.setup = null;
    this.player = 1;
    this.front.net = { code: "", typed: "", status: "", busy: false };
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
    this.renderer.draw(alpha, this.selected, this.ghost(), this.drag, this.canvas.height);
    this.drawCommandMarkers(ctx);
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
    // Hotkeys still resolve against a laid-out card, because the keyboard has
    // to work whether or not the chrome exists (it does not, headless).
    this.buttons = layoutButtons(this.world, this.player, selUnits, selBuildings, this.canvas.width, this.canvas.height, this.menuPage);

    // A paused game that looks identical to a running one is a support ticket.
    if (this.paused && !this.menu && this.settingsPanel?.open !== true) {
      const cy = this.canvas.height / 2;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(6,8,11,0.55)";
      ctx.fillRect(this.canvas.width / 2 - 96, cy - 26, 192, 52);
      ctx.strokeStyle = "rgba(160,180,210,0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(this.canvas.width / 2 - 96.5, cy - 26.5, 193, 53);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "600 20px Georgia, serif";
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

    this.drawCrowning(ctx);
    this.updateShell(selUnits, selBuildings);
  }

  /**
   * The moment the weapon comes out of the ground.
   *
   * Drawn over the world at the spot it happened, at a size that reads as a
   * scene rather than as a unit -- this is the one instant in a match that is
   * allowed to be bigger than the game. It fades in and out at the edges so it
   * arrives and leaves rather than blinking.
   */
  private drawCommandMarkers(ctx: CanvasRenderingContext2D): void {
    const now = performance.now();
    this.commandMarkers = this.commandMarkers.filter((m) => now - m.at < 650);
    for (const m of this.commandMarkers) {
      const age = now - m.at;
      const t = age / 650;
      const p = this.cam.toScreen(m.x, m.y);
      const radius = 7 + t * 13;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.strokeStyle = m.kind === "attack" ? "#ff5b5b" : m.kind === "gather" ? "#e7c75a" : m.kind === "repair" ? "#75e6b1" : "#74b9ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - radius * 0.55, p.y);
      ctx.lineTo(p.x + radius * 0.55, p.y);
      ctx.moveTo(p.x, p.y - radius * 0.55);
      ctx.lineTo(p.x, p.y + radius * 0.55);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawCrowning(ctx: CanvasRenderingContext2D): void {
    const c = this.crowningAt;
    if (!c) return;
    const t = performance.now() - c.at;
    if (t > CROWNING_MS) {
      this.crowningAt = null;
      return;
    }
    const frames = [crowning0, crowning1, crowning2, crowning3];
    const i = Math.min(frames.length - 1, Math.floor((t / CROWNING_MS) * frames.length));
    const img = spriteImage(frames[i]!);
    if (!img) return;
    const p = this.cam.toScreen(c.x, c.y);
    const s = this.cam.zoom;
    const h = s * 4.2;
    const w = (img.naturalWidth / img.naturalHeight) * h;
    const fade = Math.min(1, t / 220) * Math.min(1, (CROWNING_MS - t) / 420);
    ctx.save();
    ctx.globalAlpha = fade;
    // A wash of gold under it, so it lifts off whatever ground it happens on.
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, h * 0.75);
    glow.addColorStop(0, "rgba(255,228,150,0.45)");
    glow.addColorStop(1, "rgba(255,228,150,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - h, p.y - h, h * 2, h * 2);
    ctx.drawImage(img, p.x - w / 2, p.y - h * 0.86, w, h);
    ctx.restore();
  }

  /**
   * Hand this frame's state to the chrome.
   *
   * Everything here is a read of the simulation turned into strings and
   * fractions. The shell cannot reach back: it raises actions, and those go
   * through the same runAction the keyboard uses.
   */
  private updateShell(selUnits: Unit[], selBuildings: Building[]): void {
    const shell = this.shell;
    if (!shell || this.menu) return;
    const p = this.world.players.get(this.player)!;
    const sup = this.world.supply(this.player);
    const sets = commandSets(this.world, this.player, selUnits, selBuildings);
    if (!sets.byTab[this.tab] || !sets.tabs.some((t) => t.id === this.tab)) this.tab = sets.tabs[0]?.id ?? "orders";

    // Elapsed match time, read as a day and a clock: twenty ticks a second, and
    // a "day" every four minutes, which is about the length of an opening.
    const { day } = dayAt(this.world.tick);
    const clock = clockAt(this.world.tick);

    // What is selected, said once.
    let selection: ShellState["selection"] = null;
    let production: { name: string; progress: number; eta: string } | null = null;
    const b = selBuildings[0];
    if (selUnits.length > 0) {
      const u = selUnits[0]!;
      const def = UNITS[u.def]!;
      const name = selUnits.length > 1 ? `${selUnits.length} selected` : unitName(u.def, p.faction).toUpperCase();
      const sub = selUnits.length > 1 ? `${unitName(u.def, p.faction)} and others` : `${def.royal ? "Hero" : "Unit"} · ${describeTask(u)}`;
      // The roster is capped: past a couple of dozen faces the panel is a wall
      // of thumbnails and the count in the heading is the useful number.
      const members =
        selUnits.length > 1
          ? selUnits.slice(0, 24).map((m) => ({
              portrait: portraitArt(m.def),
              hp: m.hp,
              maxHp: m.maxHp,
              name: unitName(m.def, p.faction),
            }))
          : [];
      selection = { name, sub, hp: u.hp, maxHp: u.maxHp, portrait: portraitArt(u.def), members };
    } else if (b) {
      const d = BUILDINGS[b.def]!;
      selection = {
        name: buildingName(b.def, p.faction).toUpperCase(),
        sub: b.complete ? "Structure" : "Under construction",
        hp: b.hp,
        maxHp: b.maxHp,
        portrait: null,
        members: [],
      };
      if (!b.complete) {
        production = { name: buildingName(b.def, p.faction), progress: b.progress / d.buildTime, eta: eta((d.buildTime - b.progress) / TICKS_PER_SECOND) };
      } else if (b.queue.length > 0) {
        const q = b.queue[0]!;
        const u = UNITS[q.unit]!;
        production = { name: unitName(q.unit, p.faction), progress: 1 - q.remaining / Math.max(1, q.total), eta: eta(q.remaining / TICKS_PER_SECOND) };
      }
    }

    // The line across the top of the map: whatever is most worth saying.
    const msg = this.message && performance.now() < this.message.until ? this.message.text : null;
    const mode = this.buildMode ? `Placing ${buildingName(this.buildMode, p.faction)} — click to place, right-click to cancel` : null;
    const site = this.world.buildings().find((x) => x.owner === this.player && !x.complete);
    const banner = mode ?? msg ?? (site ? `${buildingName(site.def, p.faction)} under construction — ${Math.round((site.progress / BUILDINGS[site.def]!.buildTime) * 100)}%` : null);

    const relic = this.world.relics.find((r) => r.owner === this.player && !r.taken);
    let objective: { title: string; line: string } | null = null;
    if (relic && this.world.winner === null) {
      const man = selUnits[0] ?? this.world.units().find((u) => u.owner === this.player) ?? null;
      const weapon = WEAPON_OF[p.faction].name;
      if (man) {
        const dx = relic.x + 0.5 - man.pos.x / SUB;
        const dy = relic.y + 0.5 - man.pos.y / SUB;
        objective = {
          title: `FIND YOUR ${weapon.toUpperCase()}`,
          line: `No king, no hall — until he takes it up. It lies ${Math.round(Math.hypot(dx, dy))} paces to the ${compass(dx, dy)}.`,
        };
      }
    }

    const bn = this.banner && performance.now() < this.banner.until ? this.banner : null;
    if (!bn) this.banner = null;

    // What the network is doing, when there is one. A lockstep game that stops
    // advancing looks exactly like a game that has crashed unless it says
    // otherwise, so it says otherwise.
    let netBanner: string | null = null;
    if (this.transport) {
      const st = this.net.state(performance.now());
      if (st.kind === "stalled" && st.ms > 350) netBanner = `Waiting for the other player — ${(st.ms / 1000).toFixed(1)}s`;
      else if (st.kind === "desync") netBanner = `The two games have drifted apart at turn ${st.turn}. This is a bug, not your fault.`;
      else if (st.kind === "over") netBanner = st.why;
    }

    // The sky drives the rain bed. Read from the simulation, because how hard it
    // is raining is the same number that decides how fast people walk.
    this.audio.setRain(this.world.rain);

    shell.update({
      gold: p.gold,
      lumber: p.lumber,
      oil: p.oil,
      food: p.food,
      supplyUsed: sup.used,
      supplyMax: sup.max,
      day,
      clock,
      selection,
      production,
      tabs: sets.tabs,
      activeTab: this.tab,
      commands: (sets.byTab[this.tab] ?? []).map((c) => ({ ...c, art: commandArt(c.action) })) as ShellCommand[],
      banner: netBanner ?? (objective || !banner ? null : banner),
      objective,
      proclaim: bn ? { title: bn.title, line: bn.line } : null,
      mapName: this.map.name,
      // The sky when it is doing something, otherwise the hour: "Storm" matters
      // more than "Dusk", and "Dusk" matters more than "Clear".
      weather: this.world.rain > 0 ? skyName(this.world.sky) : phaseName(phaseAt(this.world.tick)),
      paused: this.paused,
    });

    const mm = shell.minimap;
    const mctx = mm.getContext("2d");
    if (mctx) {
      mctx.clearRect(0, 0, mm.width, mm.height);
      // Square, centred: the map is square and the panel is not, so letterbox
      // rather than stretch. A stretched minimap lies about where things are.
      const size = Math.min(mm.width, mm.height);
      this.renderer.drawMinimap((mm.width - size) / 2, (mm.height - size) / 2, size, true, mctx);
    }
  }

}


/** Seconds as m:ss, for the little countdowns in the selection panel. */
function eta(secs: number): string {
  const n = Math.max(0, Math.ceil(secs));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
