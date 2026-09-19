import { BUILDINGS } from "../data/buildings";
import { levelDef, LEVELLED } from "../data/levels";
import { UNITS } from "../data/units";
import type { Building, Unit } from "../sim/entities";
import { SUB, Tile } from "../sim/types";
import type { World } from "../sim/world";
import type { Camera } from "./camera";
import { artFor, drawConstruction } from "./buildingArt";
import { unitArtFor } from "./unitArt";
import { bakeRegion, CHUNK, T as TERRAIN_T, T_FAR } from "./terrain";
import { bucket, stamp } from "./stamp";
import { settings } from "../game/settings";
import { Fx } from "./fx";
import { drawWalk, gait, swingLean, LEG_SWING, type Gait } from "./gait";
import { drawFire } from "./fire";
import { EXPLORED, UNEXPLORED, VISIBLE } from "../sim/vision";
import { WEAPON_OF } from "../sim/relic";
import { drawWeapon } from "./weaponArt";
import { AnimationClock, anySheets, clipFor, frameAt, sheetFor, stateFor, type AnimState } from "./anim";
import { motionFor } from "./motion";
import { groundFor } from "./ground";
import relicSword from "../assets/ui/relic_sword.jpg";
import { lightAt } from "../sim/weather";
import { grassReady } from "./grass";

/** The pose used when the player has turned unit animation off. */
const NO_GAIT: Gait = { lift: 0, lean: 0, sx: 1, sy: 1, shadow: 1 };
import { goldMineSprite, grassTexture, iceTexture, waterTexture, oreCartSprite, peasantSprite, tierSprite, treeSprite, treeVariant, unitViewSprite, UNIT_VIEW_HEIGHT, type PeasantKind, spriteImage } from "./sprites";

export interface Ghost {
  def: string;
  owner: number;
  tx: number;
  ty: number;
  ok: boolean;
}

const TILE_COLORS: Record<number, string> = {
  [Tile.Grass]: "#4f7d3a",
  [Tile.Dirt]: "#6e5a3c",
  [Tile.Water]: "#2b5f9e",
  [Tile.Tree]: "#2c4d24",
  [Tile.Gold]: "#7a6a2a",
  [Tile.Rock]: "#5c5c5c",
  [Tile.Ice]: "#cfe4ee",
};

/**
 * Canvas 2D renderer. Everything is drawn procedurally so the project has no
 * art dependencies yet; swap in sprite sheets later without touching the sim.
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  /** Previous-tick unit positions for interpolation. */
  private prev = new Map<number, { x: number; y: number }>();
  private animationClock = new AnimationClock();
  /** Near-detail terrain, baked one chunk at a time and kept while it is used. */
  private chunks = new Map<number, { img: HTMLCanvasElement; used: number }>();
  /** The whole map at a coarse resolution, trees and all, for zoomed-out views. */
  private terrainFar: HTMLCanvasElement | null = null;
  private terrainVersion = -1;
  /** The map those bakes belong to; a new map means start again. */
  private terrainMap: unknown = null;
  /**
   * Zoom below which the coarse whole-map bake is used instead of near chunks.
   * A field rather than a constant so a test can force either path.
   */
  /**
   * Below this zoom the coarse whole-map bake is used instead of live trees.
   *
   * It used to be T_FAR + 6, which meant that between 21 and 25 pixels a tile
   * the bake -- which is painted at 20 pixels a tile -- was being blown UP to
   * fill the screen. That is a 25% upscale of an already-downsampled image, and
   * it is why zooming out went soft and the forest turned to mush before it
   * turned to trees. The bake may now only ever be shrunk, never stretched, so
   * the picture is sharp at every zoom. The cost is that the 20-to-25 band now
   * draws its trees live -- about 600 cached blits on a 1100px view, where the
   * measurement that motivated the bake in the first place was a couple of
   * thousand uncached ones.
   */
  farBelow = T_FAR;
  /** Whether the ground variants had loaded last time we looked. */
  private grassWasReady = false;
  /** Set when a bake wanted a sprite that had not loaded yet. */
  private missedArt = false;
  /** Whether the coarse bake must be redone because art was missing. */
  private farStale = false;
  /** Frame counter, used only to evict the least recently drawn chunk. */
  private frame = 0;
  /** Whether the current bake used the photographic grass. */
  private terrainTextured = false;
  /** Swings, flashes, falling bodies and dust. Fed from the sim each tick. */
  readonly fx = new Fx();
  /** Whose eyes we are drawing through. */
  viewer: number = 1;
  /** Fog baked at one pixel per tile, redrawn only when vision changes. */
  private fogTile: HTMLCanvasElement | null = null;
  private fogTileTick = -1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly world: World,
    private readonly cam: Camera,
  ) {
    this.ctx = canvas.getContext("2d")!;
  }

  /** Call once per sim tick, before stepping, to capture positions. */
  snapshot(): void {
    this.prev.clear();
    for (const u of this.world.units()) this.prev.set(u.id, { x: u.pos.x, y: u.pos.y });
  }


  draw(alpha: number, selected: Set<number>, ghost: Ghost | null, box: { x0: number; y0: number; x1: number; y1: number } | null, viewH: number): void {
    const ctx = this.ctx;
    const cam = this.cam;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cam.viewW, viewH);
    ctx.clip();
    this.drawTerrain();
    if (settings.animations) this.drawWaterMotion();
    // Tracks go on the ground, under everything that stands on it.
    this.drawPaths();
    this.drawOreCarts(alpha);
    this.drawGoldMines();
    this.drawTrees();
    this.drawResources();
    this.drawRelics();
    // Draw buildings then units so units walk in front of walls; sort by y for a bit of depth.
    const buildings = this.world
      .buildings()
      .filter((b) => b.owner === this.viewer || this.exploredAt(b.tx + b.size / 2, b.ty + b.size / 2));
    for (const b of buildings) this.drawBuilding(b, selected.has(b.id), alpha);
    this.drawCorpses();
    const units = [...this.world.units()]
      // An enemy you cannot see is not drawn at all. Buildings are different:
      // once you have seen one you remember it, so they are drawn on explored
      // ground whether or not anyone is watching it now.
      .filter((u) => this.world.canSeeEntity(this.viewer, u))
      .sort((a, b) => a.pos.y - b.pos.y);
    this.drawFog(viewH);
    this.drawRelicPointer(viewH);
    this.drawDaylight(viewH);
    this.drawLocalLights(viewH);
    this.drawWeather(viewH);
    // Keep visible people readable over the atmospheric terrain wash. The
    // visibility filter above still hides enemies outside our actual sight.
    for (const u of units) this.drawUnit(u, alpha, selected.has(u.id));
    this.drawProjectiles();
    this.fx.drawMarks(ctx, this.world.tick + alpha, (x, y) => this.cam.toScreen(x, y), this.cam.zoom, settings.damageNumbers);
    if (ghost) this.drawGhost(ghost);
    if (box) {
      ctx.strokeStyle = "rgba(120,255,120,0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.min(box.x0, box.x1) + 0.5, Math.min(box.y0, box.y1) + 0.5, Math.abs(box.x1 - box.x0), Math.abs(box.y1 - box.y0));
    }
    ctx.restore();
  }

  /**
   * One pixel per tile: black where unexplored, a translucent wash where merely
   * remembered, clear where in sight. Rebuilt only when the sim's vision has
   * actually moved on.
   */
  private bakeFogTile(v: { at(x: number, y: number): number }, w: number, h: number): HTMLCanvasElement {
    if (this.fogTile && this.fogTile.width === w && this.fogTile.height === h && this.fogTileTick === this.world.tick) {
      return this.fogTile;
    }
    if (!this.fogTile || this.fogTile.width !== w || this.fogTile.height !== h) {
      this.fogTile = document.createElement("canvas");
      this.fogTile.width = w;
      this.fogTile.height = h;
    }
    const c = this.fogTile.getContext("2d")!;
    const img = c.createImageData(w, h);
    const d = img.data;
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const i = (ty * w + tx) * 4;
        const state = v.at(tx, ty);
        if (state === VISIBLE) {
          d[i + 3] = 0;
          continue;
        }
        d[i] = 5;
        d[i + 1] = 8;
        d[i + 2] = 13;
        d[i + 3] = state === EXPLORED ? 115 : 247;
      }
    }
    c.putImageData(img, 0, 0);
    this.fogTileTick = this.world.tick;
    return this.fogTile;
  }

  /** Has the viewer ever seen this tile? */
  private exploredAt(tx: number, ty: number): boolean {
    if (!this.world.fogEnabled) return true;
    return (this.world.vision.get(this.viewer)?.at(Math.floor(tx), Math.floor(ty)) ?? VISIBLE) !== UNEXPLORED;
  }

  /**
   * Paint the fog over everything.
   *
   * Two washes, not one: unexplored ground is black, and ground you have walked
   * but cannot currently see is merely dimmed, so you still read the shape of
   * the map you scouted. Drawn per tile at the edges of the view only -- the
   * whole grid is never touched, just the part on screen.
   */
  private drawFog(viewH: number): void {
    if (!this.world.fogEnabled) return;
    const v = this.world.vision.get(this.viewer);
    if (!v) return;
    const ctx = this.ctx;
    const map = this.world.map;
    // One pixel per tile, baked when vision moves and blitted scaled. The first
    // version filled a rect per on-screen tile: at 160x160 and low zoom that is
    // thousands of translucent fills a frame, and it showed. Smoothing is left
    // on deliberately — the fog edge softens instead of stepping.
    const fog = this.bakeFogTile(v, map.width, map.height);
    const p = this.cam.toScreen(0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";
    ctx.drawImage(fog, p.x, p.y, map.width * this.cam.zoom, map.height * this.cam.zoom);
    // Off the edge of the map is simply outside the world: black it out too.
    ctx.fillStyle = "rgba(4,6,9,0.97)";
    if (p.x > 0) ctx.fillRect(0, 0, p.x, viewH);
    if (p.y > 0) ctx.fillRect(0, 0, this.cam.viewW, p.y);
    const ex = p.x + map.width * this.cam.zoom;
    const ey = p.y + map.height * this.cam.zoom;
    if (ex < this.cam.viewW) ctx.fillRect(ex, 0, this.cam.viewW - ex, viewH);
    if (ey < viewH) ctx.fillRect(0, ey, this.cam.viewW, viewH - ey);
    ctx.restore();
  }

  // ───────────────────────────── terrain ─────────────────────────────

  /**
   * Terrain, at whichever level of detail the zoom can actually show.
   *
   * Zoomed out, the coarse whole-map bake is one small blit. Zoomed in, only the
   * chunks under the view are baked, and only those are drawn. Either way the
   * browser is never asked to resample a forty-megapixel image per frame, which
   * is what made a 160x160 board stutter.
   */
  private drawTerrain(): void {
    const map = this.world.map;
    // Re-bake when the map changes, and once more when the grass texture finishes
    // loading — the first bake can happen before the image is ready.
    const grass = grassTexture();
    // All three photographs, not just the grass: whichever arrives last has to
    // trigger the re-bake, or the sea and the floes stay painted for the rest of
    // the match while the fields are photographic.
    const texReady = grass !== null && waterTexture() !== null && iceTexture() !== null;
    if (texReady !== this.terrainTextured || this.terrainMap !== map) {
      this.chunks.clear();
      this.terrainFar = null;
      this.terrainMap = map;
      this.terrainTextured = texReady;
      map.drainTouched();
      this.terrainVersion = map.version;
    } else if (this.terrainVersion !== map.version) {
      // Something changed, but almost never the whole map: a tree fell, a seam
      // was mined out. Repaint the squares that moved, not the world. This is
      // the difference between chopping wood costing nothing and costing a
      // stutter every swing.
      const { tiles, all } = map.drainTouched();
      if (all) {
        this.chunks.clear();
        this.terrainFar = null;
      } else {
        const cols = Math.ceil(map.width / CHUNK);
        for (const i of tiles) {
          const tx = i % map.width;
          const ty = (i / map.width) | 0;
          // A tile can bleed a tree canopy or a shore blend into its neighbours,
          // so drop any chunk within one tile of the change.
          for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]] as const) {
            const c = Math.floor((tx + ox) / CHUNK);
            const r = Math.floor((ty + oy) / CHUNK);
            if (c >= 0 && r >= 0) this.chunks.delete(r * cols + c);
          }
          this.patchFar(map, tx, ty, grass);
        }
      }
      this.terrainVersion = map.version;
    }
    // The ground variants load after the first bake, and bakes are cached, so
    // without this the map keeps the fallback texture for the whole match.
    if (!this.grassWasReady && grassReady()) {
      this.grassWasReady = true;
      this.chunks.clear();
      this.terrainFar = null;
    }
    const ctx = this.ctx;
    const s = this.cam.zoom;
    this.frame++;
    ctx.imageSmoothingEnabled = true;
    // "high" is a multi-pass resample: 10 ms a frame on a full-screen blit, and
    // invisible at these scales. The expensive filtering is done once, in the
    // bake and in the sprite stamps, never per frame.
    ctx.imageSmoothingQuality = "low";

    if (s < this.farBelow) {
      if (this.farStale) this.terrainFar = null;
      if (!this.terrainFar) this.terrainFar = this.bakeFar(map, grass);
      const far = this.terrainFar;
      const sx = (this.cam.x / SUB) * T_FAR;
      const sy = (this.cam.y / SUB) * T_FAR;
      ctx.drawImage(far, sx, sy, (this.cam.viewW / s) * T_FAR, (this.cam.viewH / s) * T_FAR, 0, 0, this.cam.viewW, this.cam.viewH);
      return;
    }

    const T = TERRAIN_T;
    const cols = Math.ceil(map.width / CHUNK);
    const c0 = Math.max(0, Math.floor(this.cam.x / SUB / CHUNK));
    const r0 = Math.max(0, Math.floor(this.cam.y / SUB / CHUNK));
    const c1 = Math.min(cols - 1, Math.floor((this.cam.x / SUB + this.cam.viewW / s) / CHUNK));
    const r1 = Math.min(Math.ceil(map.height / CHUNK) - 1, Math.floor((this.cam.y / SUB + this.cam.viewH / s) / CHUNK));
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const key = r * cols + c;
        let entry = this.chunks.get(key);
        if (!entry) {
          const tw = Math.min(CHUNK, map.width - c * CHUNK);
          const th = Math.min(CHUNK, map.height - r * CHUNK);
          entry = { img: bakeRegion(map, c * CHUNK, r * CHUNK, tw, th, T, 1337, grass), used: 0 };
          this.chunks.set(key, entry);
        }
        entry.used = this.frame;
        const p = this.cam.toScreen(c * CHUNK * SUB, r * CHUNK * SUB);
        ctx.drawImage(entry.img, p.x, p.y, (entry.img.width / T) * s, (entry.img.height / T) * s);
      }

    // Keep a couple of screens' worth and drop the rest, so panning across a big
    // map does not accumulate every chunk it has ever touched.
    const cap = Math.max(24, (c1 - c0 + 3) * (r1 - r0 + 3) * 2);
    while (this.chunks.size > cap) {
      let oldest = -1;
      let oldestUsed = Infinity;
      for (const [k, e] of this.chunks)
        if (e.used < oldestUsed) {
          oldestUsed = e.used;
          oldest = k;
        }
      this.chunks.delete(oldest);
    }
  }

  /**
   * The coarse whole-map bake, with the forest painted into it.
   *
   * Zoomed out, the view can hold a couple of thousand trees, and drawing each
   * one per frame cost 20 ms even as a plain blit -- the calls themselves were
   * the expense. At that size a tree is a dozen pixels and never moves, so it
   * belongs in the bake; only when a tree actually falls is anything repainted.
   */
  private bakeFar(map: World["map"], grass: HTMLImageElement | null): HTMLCanvasElement {
    const canvas = bakeRegion(map, 0, 0, map.width, map.height, T_FAR, 1337, grass);
    const c = canvas.getContext("2d")!;
    // The tree paintings load asynchronously, and the first bake can easily
    // happen before they arrive -- which baked a forest of nothing and left it
    // that way, since nothing else invalidates the canvas. Note the miss and
    // bake again next frame until the art is actually there.
    this.missedArt = false;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) this.drawTree(c, x, y, T_FAR, (x + 0.5) * T_FAR, (y + 0.5) * T_FAR);
    this.farStale = this.missedArt;
    return canvas;
  }

  /** Repaint a few tiles of the coarse bake in place, rather than all of it. */
  private patchFar(map: World["map"], tx: number, ty: number, grass: HTMLImageElement | null): void {
    const far = this.terrainFar;
    if (!far) return;
    const c = far.getContext("2d")!;
    const x0 = Math.max(0, tx - 1);
    const y0 = Math.max(0, ty - 1);
    const x1 = Math.min(map.width - 1, tx + 1);
    const y1 = Math.min(map.height - 1, ty + 1);
    const patch = bakeRegion(map, x0, y0, x1 - x0 + 1, y1 - y0 + 1, T_FAR, 1337, grass);
    c.clearRect(x0 * T_FAR, y0 * T_FAR, patch.width, patch.height);
    c.drawImage(patch, x0 * T_FAR, y0 * T_FAR);
    // Neighbouring canopies overhang the patch, so redraw a wider ring of trees
    // to put back the bits the clear took out.
    for (let y = Math.max(0, ty - 3); y <= Math.min(map.height - 1, ty + 3); y++)
      for (let x = Math.max(0, tx - 3); x <= Math.min(map.width - 1, tx + 3); x++)
        this.drawTree(c, x, y, T_FAR, (x + 0.5) * T_FAR, (y + 0.5) * T_FAR);
  }

  /**
   * One tree, if this tile has one, centred on (cx, cy) at `s` pixels per tile.
   *
   * Tree and shadow are stamped together at the size they will appear and then
   * blitted 1:1. Drawing each one straight from its full-size painting meant
   * resampling a large image per trunk per frame, which was 31 ms a frame on a
   * wooded 160x160 board -- the single biggest thing making the game stutter.
   */
  private drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, cx: number, cy: number): void {
    const map = this.world.map;
    if (map.isHidden(x, y)) return;
    if (map.get(x, y) !== Tile.Tree) {
      // Not a tree now, but it was one: leave the stump.
      if (map.felled[map.idx(x, y)]) this.drawStump(ctx, x, y, s, cx, cy);
      return;
    }
    const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    const variant = treeVariant(((h >> 12) & 1023) / 1024);
    const img = treeSprite(variant);
    if (!img) {
      this.missedArt = true;
      return;
    }
    const jx = ((h & 15) / 15 - 0.5) * s * 0.22;
    const jy = (((h >> 4) & 15) / 15 - 0.5) * s * 0.18;
    // A tree being worked visibly comes down. Three steps rather than a
    // continuous shrink, so the stamp cache still has something to cache: a
    // half-cut trunk is a distinct sprite, not a thousand near-identical ones.
    const full = 40;
    const left = map.amount[map.idx(x, y)] ?? full;
    const wear = left >= full ? 0 : left > full * 0.5 ? 1 : left > full * 0.25 ? 2 : 3;
    const shrink = [1, 0.86, 0.71, 0.56][wear]!;
    const w = bucket(s * (1.5 + (((h >> 8) & 15) / 15) * 0.35) * shrink);
    const th = Math.round((img.naturalHeight / img.naturalWidth) * w);
    const shadowH = Math.max(2, Math.round(s * 0.32));
    const pad = Math.max(0, Math.ceil(w * 0.32 - w / 2 + s * 0.1) + 2);
    const canopy = stamp(`tree${variant}@${Math.round(s)}/${wear}`, w + pad * 2, th + shadowH, (c, cw, ch) => {
      c.fillStyle = "rgba(0,0,0,0.26)";
      c.beginPath();
      c.ellipse(cw / 2 + s * 0.1, ch - shadowH * 0.55, w * 0.32, s * 0.16, 0, 0, Math.PI * 2);
      c.fill();
      c.drawImage(img, (cw - w) / 2, 0, w, th);
    });
    const live = ctx === this.ctx && settings.animations;
    const sway = live ? Math.sin((this.world.tick + x * 7 + y * 11) / 18) * s * 0.028 : 0;
    ctx.drawImage(canopy, Math.round(cx + jx + sway - canopy.width / 2), Math.round(cy + jy + s * 0.34 - th - shadowH * 0.45));
  }

  /**
   * Cheap live water detail layered over the baked terrain.
   * Only a fraction of visible water tiles draw a ripple, so large maps remain cheap.
   */
  private drawWaterMotion(): void {
    const s = this.cam.zoom;
    if (s < 18) return;
    const map = this.world.map;
    const x0 = Math.max(0, Math.floor(this.cam.x / SUB) - 1);
    const y0 = Math.max(0, Math.floor(this.cam.y / SUB) - 1);
    const x1 = Math.min(map.width - 1, x0 + Math.ceil(this.cam.viewW / s) + 2);
    const y1 = Math.min(map.height - 1, y0 + Math.ceil(this.cam.viewH / s) + 2);
    const t = performance.now() / 1000;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(220,240,255,0.2)";
    ctx.lineWidth = Math.max(0.75, s * 0.015);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (map.get(x, y) !== Tile.Water) continue;
        const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        if ((hash & 3) !== 0) continue;
        const p = this.cam.toScreen((x + 0.5) * SUB, (y + 0.5) * SUB);
        const phase = t * (0.8 + ((hash >>> 5) & 7) * 0.05) + (hash % 17);
        const drift = Math.sin(phase) * s * 0.08;
        const len = s * (0.18 + ((hash >>> 8) & 7) * 0.018);
        ctx.globalAlpha = 0.12 + (Math.sin(phase * 1.7) + 1) * 0.07;
        ctx.beginPath();
        ctx.moveTo(p.x - len + drift, p.y);
        ctx.quadraticCurveTo(p.x + drift, p.y - s * 0.035, p.x + len + drift, p.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Pools of warm light from completed Torches are drawn after the global
   * day/night wash. Higher tiers have both a larger radius and stronger light.
   * This is presentation only; actual sight radius is handled by vision.
   */
  private drawLocalLights(viewH: number): void {
    if (!settings.animations) return;
    const night = lightAt(this.world.tick).alpha;
    if (night < 0.06) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const b of this.world.buildings()) {
      if (!b.complete || b.def !== "torch") continue;
      if (b.owner !== this.viewer && !this.world.canSeeEntity(this.viewer, b)) continue;
      const lv = levelDef("torch", b.level);
      const radius = (lv.radius ?? 4) * this.cam.zoom;
      const power = lv.light ?? 0.3;
      const centre = this.cam.toScreen((b.tx + 0.5) * SUB, (b.ty + 0.5) * SUB);
      if (centre.x + radius < 0 || centre.y + radius < 0 || centre.x - radius > this.cam.viewW || centre.y - radius > viewH) continue;

      const flicker = 0.92 + Math.sin(performance.now() / 85 + b.id * 1.7) * 0.08;
      const alpha = Math.min(0.72, night * power * 0.62 * flicker);
      const g = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, radius);
      g.addColorStop(0, b.level >= 10 ? `rgba(170,215,255,${alpha})` : `rgba(255,205,105,${alpha})`);
      g.addColorStop(0.28, `rgba(255,175,70,${alpha * 0.58})`);
      g.addColorStop(1, "rgba(255,150,40,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * The colour of the hour, washed over the world.
   *
   * Under everything the weather does, so a storm at dusk is dark AND orange
   * rather than one or the other. Drawn with `multiply` rather than a flat
   * overlay: a wash of translucent blue over grass gives grey, while
   * multiplying by blue gives grass at night, which is a different and much
   * better-looking thing.
   */
  private drawDaylight(viewH: number): void {
    const light = lightAt(this.world.tick);
    if (light.alpha <= 0.01) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = light.alpha;
    ctx.fillStyle = light.css;
    ctx.fillRect(0, 0, this.cam.viewW, viewH);
    ctx.restore();
    // A touch of the same colour laid on top, so a dawn actually glows rather
    // than merely failing to be dark.
    ctx.save();
    ctx.globalAlpha = light.alpha * 0.28;
    ctx.fillStyle = light.css;
    ctx.fillRect(0, 0, this.cam.viewW, viewH);
    ctx.restore();
  }

  /**
   * Rain, and the light going out of the day.
   *
   * Drawn from the wall clock rather than the sim tick, like every other purely
   * visual thing here: how the drops happen to fall is not a decision the
   * simulation is allowed to see. What IS from the simulation is how hard it is
   * raining, because that is the same number that decides how fast your people
   * walk, and both machines in a network game have to agree about it.
   *
   * The drops are drawn as short streaks rather than dots, and at a slant --
   * vertical rain reads as static. They are seeded off screen position rather
   * than stored, so nothing accumulates and panning does not drag the storm
   * along with the camera.
   */
  private drawWeather(viewH: number): void {
    const wet = this.world.rain;
    if (wet <= 0.01) return;
    const ctx = this.ctx;
    const W = this.cam.viewW;
    const t = performance.now() / 1000;
    ctx.save();

    // The light goes first. A storm is not merely wet, it is dim.
    ctx.fillStyle = `rgba(24,30,44,${wet * 0.3})`;
    ctx.fillRect(0, 0, W, viewH);

    const drops = Math.round(W * viewH * 0.00042 * wet);
    const slant = 0.26;
    const fall = 1350 + wet * 700;
    ctx.strokeStyle = `rgba(196,214,236,${0.16 + wet * 0.2})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < drops; i++) {
      // A fixed lattice scrolled by time: no state, no drift, no allocation.
      const seed = i * 2654435761;
      const px = ((seed >>> 7) % 10007) / 10007;
      const phase = ((seed >>> 3) % 1009) / 1009;
      const y = ((t * fall * (0.75 + phase * 0.5) + phase * viewH * 3) % (viewH + 60)) - 30;
      const x = (px * (W + viewH * slant) - y * slant + W) % (W + 40) - 20;
      const len = 11 + phase * 13 + wet * 8;
      ctx.moveTo(x, y);
      ctx.lineTo(x + len * slant, y + len);
    }
    ctx.stroke();

    // Lightning: rare, brief, and only in a storm.
    if (wet > 0.9) {
      const beat = Math.floor(t / 6.5);
      const into = t - beat * 6.5;
      if (((beat * 2654435761) >>> 8) % 5 === 0 && into < 0.22) {
        const flash = into < 0.06 ? 1 : Math.max(0, 1 - (into - 0.06) / 0.16);
        ctx.fillStyle = `rgba(214,226,255,${flash * 0.3})`;
        ctx.fillRect(0, 0, W, viewH);
      }
    }
    ctx.restore();
  }

  /**
   * The tracks people have beaten into the ground.
   *
   * Four rows of photographed tiles do the work now -- see render/ground.ts --
   * chosen by the three numbers the simulation keeps about each tile: how worn
   * it is, how churned it is, and whether the clan walking it has laid stone.
   * The hand-drawn blobs this replaces could show a path was there; these show
   * what kind of path it is, and what the rain has done to it.
   *
   * Drawn live rather than baked, because wear and mud change constantly and
   * rebaking a terrain chunk every time somebody walks over it would be absurd.
   */
  private drawPaths(): void {
    const s = this.cam.zoom;
    const map = this.world.map;
    const paved = (this.world.players.get(this.viewer)?.research.paving ?? 0) > 0;
    const rain = this.world.rain;
    const x0 = Math.max(0, Math.floor(this.cam.x / SUB) - 1);
    const y0 = Math.max(0, Math.floor(this.cam.y / SUB) - 1);
    const x1 = Math.min(map.width - 1, x0 + Math.ceil(this.cam.viewW / s) + 2);
    const y1 = Math.min(map.height - 1, y0 + Math.ceil(this.cam.viewH / s) + 2);
    const ctx = this.ctx;
    // Half a tile of overlap each side, so neighbouring worn tiles run into one
    // another and a route reads as a track rather than as a row of squares.
    const size = bucket(s * 1.6);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = map.idx(x, y);
        const w = map.wear[i]!;
        if (w < 18 || map.isHidden(x, y)) continue;
        const t = map.get(x, y);
        if (t !== Tile.Grass && t !== Tile.Dirt) continue;
        const g = groundFor(w, map.mud[i]!, paved, rain);
        // Fade in rather than appear: ground one footfall from bare grass should
        // not be a fully drawn path.
        const a = Math.min(1, (w - 18) / 90) * 0.92;
        const p = this.cam.toScreen(x * SUB + SUB / 2, y * SUB + SUB / 2);
        const px = Math.round(p.x - size / 2);
        const py = Math.round(p.y - size / 2);
        const dry = this.groundStamp(g.dry, size);
        if (dry) {
          ctx.globalAlpha = a;
          ctx.drawImage(dry, px, py);
        }
        // Dry and wet are cross-faded rather than switched between: mud arrives
        // over a couple of minutes of rain and dries over about four, and a
        // threshold would throw all of that away.
        if (g.wetness > 0.03) {
          const wet = this.groundStamp(g.wet, size);
          if (wet) {
            ctx.globalAlpha = a * Math.min(1, g.wetness);
            ctx.drawImage(wet, px, py);
          }
        }
      }
    ctx.globalAlpha = 1;
  }

  /**
   * One unit, from a cut sheet. Returns the height drawn, or null if this unit
   * has no sheet and should fall through to the painted still.
   */
  private drawUnitFrames(u: Unit, x: number, y: number, s: number, faction: string, state: AnimState, seconds: number): number | null {
    const sheet = sheetFor(faction, u.def);
    if (!sheet) return null;
    const clip = clipFor(sheet, state);
    if (!clip) return null;
    // Action time starts at the gesture, not at application launch.
    const src = frameAt(clip, settings.animations ? seconds : 0, settings.animations ? u.id : 0);
    if (!src) return null;
    const img = spriteImage(src);
    if (!img) {
      this.missedArt = true;
      return null;
    }
    const h = s * sheet.height;
    const w = (img.naturalWidth / img.naturalHeight) * h;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.42, s * 0.3, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(img, x - w / 2, y + s * 0.45 - h, w, h);
    ctx.restore();
    return h;
  }

  /**
   * One ground tile, pre-scaled and feathered to a soft disc.
   *
   * The feather is the whole trick. Drawn as a hard square these would put a
   * grid over the map and the edge of a path would be a staircase; faded to
   * nothing at the rim, neighbours overlap and the join disappears. Cached by
   * source and size like every other sprite, because otherwise this is a
   * full-size resample per tile per frame.
   */
  private groundStamp(src: string, size: number): HTMLCanvasElement | null {
    const img = spriteImage(src);
    if (!img) {
      this.missedArt = true;
      return null;
    }
    return stamp(`ground:${src}`, size, size, (c, w, h) => {
      c.drawImage(img, 0, 0, w, h);
      c.globalCompositeOperation = "destination-in";
      const grad = c.createRadialGradient(w / 2, h / 2, w * 0.16, w / 2, h / 2, w * 0.5);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(0.62, "rgba(0,0,0,0.95)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);
    });
  }
  /**
   * What a felled tree leaves behind.
   *
   * Cut ground used to snap back to clean grass, which read as a bug: the wood
   * you had spent all morning on looked exactly like the wood you had not
   * touched. A stump costs nothing -- it is three ellipses -- and it turns a
   * worked forest into somewhere you can see the work.
   */
  private drawStump(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, cx: number, cy: number): void {
    const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    const jx = ((h & 15) / 15 - 0.5) * s * 0.22;
    const jy = (((h >> 4) & 15) / 15 - 0.5) * s * 0.18;
    const r = Math.max(1.5, s * 0.15);
    const px = cx + jx;
    const py = cy + jy + s * 0.1;
    ctx.save();
    // Shadow, bark, and the pale cut face on top.
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(px + s * 0.06, py + r * 0.5, r * 1.15, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a3823";
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9c7b4e";
    ctx.beginPath();
    ctx.ellipse(px, py - r * 0.22, r * 0.72, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (r > 3) {
      ctx.strokeStyle = "rgba(74,56,35,0.75)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(px, py - r * 0.22, r * 0.36, r * 0.25, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Forest. Only the tiles on screen are drawn, each with a small deterministic
   * jitter in size and offset so a wood does not look like a grid of clones.
   */
  private drawTrees(): void {
    const s = this.cam.zoom;
    // Zoomed out the forest is already painted into the coarse bake; drawing it
    // again here would be two thousand redundant blits a frame.
    if (s < this.farBelow) return;
    const map = this.world.map;
    const x0 = Math.max(0, Math.floor(this.cam.x / SUB) - 1);
    const y0 = Math.max(0, Math.floor(this.cam.y / SUB) - 1);
    const x1 = Math.min(map.width - 1, x0 + Math.ceil(this.cam.viewW / s) + 2);
    const y1 = Math.min(map.height - 1, y0 + Math.ceil(this.cam.viewH / s) + 3);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const p = this.cam.toScreen(x * SUB + SUB / 2, y * SUB + SUB / 2);
        this.drawTree(this.ctx, x, y, s, p.x, p.y);
      }
  }


  /**
   * Rail lines and ore carts, drawn for any seam a player is currently mining.
   *
   * Purely cosmetic: nothing here touches the simulation, and the carts carry no
   * gold — the workers still do that. It exists because a mine with a cart running
   * out of it reads as a working mine, where a mine with people walking past it
   * reads as scenery.
   */
  private drawOreCarts(alpha: number): void {
    const img = oreCartSprite();
    if (!img) return;
    const s = this.cam.zoom;
    const ctx = this.ctx;

    for (const seam of this.world.map.goldSeams()) {
      // Who is mining this seam right now?
      let owner: number | null = null;
      for (const u of this.world.units()) {
        const t = u.task;
        if (t.kind !== "gather" || t.resource !== "gold") continue;
        if (t.tx < seam.x0 || t.tx > seam.x1 || t.ty < seam.y0 || t.ty > seam.y1) continue;
        owner = u.owner;
        break;
      }
      if (owner === null) continue;

      // Route: seam centre to that player's nearest Gold Depot. The depot is the
      // rail head — its art has track running into it — so a player with no depot
      // gets no rails, and building one is what puts the line on the map.
      const from = { x: ((seam.x0 + seam.x1 + 1) / 2) * SUB, y: ((seam.y0 + seam.y1 + 1) / 2) * SUB };
      let to: { x: number; y: number } | null = null;
      let bestD = Infinity;
      for (const b of this.world.buildings()) {
        if (b.owner !== owner || !b.complete || b.def !== "golddepot") continue;
        const c = { x: (b.tx + b.size / 2) * SUB, y: (b.ty + b.size / 2) * SUB };
        const d = (c.x - from.x) ** 2 + (c.y - from.y) ** 2;
        if (d < bestD) {
          bestD = d;
          to = c;
        }
      }
      if (!to) continue;

      const a = this.cam.toScreen(from.x, from.y);
      const b2 = this.cam.toScreen(to.x, to.y);
      const dx = b2.x - a.x;
      const dy = b2.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      // Cull whole routes that are nowhere near the view.
      const pad = s * 3;
      if (Math.max(a.x, b2.x) < -pad || Math.min(a.x, b2.x) > this.cam.viewW + pad) continue;
      if (Math.max(a.y, b2.y) < -pad || Math.min(a.y, b2.y) > this.cam.viewH + pad) continue;

      const ux = dx / len;
      const uy = dy / len;
      const px = -uy;
      const py = ux;
      const gauge = s * 0.16;

      // Sleepers, then the two rails over them.
      ctx.strokeStyle = "rgba(74,51,32,0.85)";
      ctx.lineWidth = Math.max(1, s * 0.07);
      const step = s * 0.34;
      ctx.beginPath();
      for (let d = step; d < len; d += step) {
        const mx = a.x + ux * d;
        const my = a.y + uy * d;
        ctx.moveTo(mx - px * gauge * 1.7, my - py * gauge * 1.7);
        ctx.lineTo(mx + px * gauge * 1.7, my + py * gauge * 1.7);
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(120,124,130,0.9)";
      ctx.lineWidth = Math.max(1, s * 0.045);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(a.x + px * gauge * side, a.y + py * gauge * side);
        ctx.lineTo(b2.x + px * gauge * side, b2.y + py * gauge * side);
        ctx.stroke();
      }

      // Two carts running mine → drop-off, half a cycle apart. The return trip is
      // left off deliberately: there is only a loaded cart in the art, and an
      // empty one drawn from the same sprite would read as gold going backwards.
      const period = 20 * 9; // ticks for one run
      const t0 = ((this.world.tick + alpha) % period) / period;
      const cw = s * 1.1;
      const ch = (img.naturalHeight / img.naturalWidth) * cw;
      for (const offset of [0, 0.5]) {
        const t = (t0 + offset) % 1;
        const cx = a.x + dx * t;
        const cy = a.y + dy * t;
        if (cx < -cw || cy < -ch || cx > this.cam.viewW + cw || cy > this.cam.viewH + ch) continue;
        // Fade in and out at the ends so carts appear at the mine mouth rather
        // than popping into existence mid-track.
        const fade = Math.min(1, Math.min(t, 1 - t) * 8);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(cx, cy);
        // The art faces right; mirror it when the route runs leftward.
        if (ux < 0) ctx.scale(-1, 1);
        ctx.drawImage(img, -cw / 2, -ch * 0.72, cw, ch);
        ctx.restore();
      }
    }
  }

  /** Painted mines, one per gold seam, anchored to the bottom of the deposit. */
  /**
   * The weapon in the ground.
   *
   * Drawn only where the viewer can actually see, like everything else -- the
   * whole point is that it has to be found. It is a small thing on a large
   * board, so it gets a slow beacon of light rather than realism: the eye needs
   * something to catch on from across a screen of trees.
   */
  /**
   * The weapon in the ground.
   *
   * Painted art now rather than two strokes of a pen. It arrives as a whole
   * little scene -- a sword standing in a cracked outcrop with grass round it --
   * and rather than cutting the grass away it is drawn with a soft edge and
   * allowed to blend, because the thing it is standing on is grass too. The
   * shaft of light over it stays: the sword is what the whole opening is
   * waiting on, and it has to be findable from across a field.
   */
  private drawRelics(): void {
    if (this.world.relics.length === 0) return;
    const ctx = this.ctx;
    const s = this.cam.zoom;
    const t = this.world.tick;
    for (const r of this.world.relics) {
      if (r.taken || r.owner !== this.viewer) continue;
      const v = this.world.vision.get(this.viewer);
      if (this.world.fogEnabled && v && v.at(r.x, r.y) !== VISIBLE) continue;
      const p = this.cam.toScreen((r.x + 0.5) * SUB, (r.y + 0.5) * SUB);
      const pulse = 0.55 + 0.45 * Math.sin(t * 0.08);

      const size = bucket(s * 2.6);
      const art = stamp(`relic@${size}`, size, size, (c, w, h) => {
        const img = spriteImage(relicSword);
        if (!img) return;
        c.drawImage(img, 0, 0, w, h);
        c.globalCompositeOperation = "destination-in";
        const g = c.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.5);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(0.7, "rgba(0,0,0,0.92)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      });
      if (!spriteImage(relicSword)) this.missedArt = true;

      ctx.save();
      // A shaft of light standing over it, so it can be found from across a
      // field rather than only stumbled upon.
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 2);
      glow.addColorStop(0, `rgba(255,238,170,${0.42 * pulse})`);
      glow.addColorStop(1, "rgba(255,238,170,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(p.x - s * 2, p.y - s * 2, s * 4, s * 4);
      ctx.drawImage(art, Math.round(p.x - size / 2), Math.round(p.y - size / 2));
      ctx.restore();
    }
  }

  /**
   * An arrow at the edge of the screen pointing at your weapon, with how far
   * off it is.
   *
   * Drawn over the fog rather than under it, because the fog is exactly what
   * makes it necessary. The first version of this opening put the weapon thirty
   * tiles out on a 160-tile board behind a wall of trees and said nothing about
   * where -- so the player wandered, and the whole first act read as being lost
   * rather than as a quest. Knowing the direction costs nothing; the walk is
   * still the walk.
   */
  private drawRelicPointer(viewH: number): void {
    const r = this.world.relics.find((x) => !x.taken && x.owner === this.viewer);
    if (!r) return;
    const ctx = this.ctx;
    const p = this.cam.toScreen((r.x + 0.5) * SUB, (r.y + 0.5) * SUB);
    const m = 46;
    const onScreen = p.x > m && p.x < this.cam.viewW - m && p.y > m && p.y < viewH - m;
    if (onScreen) return;

    // Where the line from the middle of the view to the weapon leaves the screen.
    const cx = this.cam.viewW / 2;
    const cy = viewH / 2;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const scale = Math.min(Math.abs((this.cam.viewW / 2 - m) / (dx || 1e-6)), Math.abs((viewH / 2 - m) / (dy || 1e-6)));
    const ax = cx + dx * scale;
    const ay = cy + dy * scale;
    const ang = Math.atan2(dy, dx);

    // Distance in tiles, from the King if he is still a commoner walking to it.
    const me = [...this.world.units()].find((u) => u.owner === this.viewer);
    const away = me ? Math.round(Math.hypot(me.pos.x / SUB - r.x, me.pos.y / SUB - r.y)) : 0;

    ctx.save();
    ctx.translate(ax, ay);
    const pulse = 0.65 + 0.35 * Math.sin(this.world.tick * 0.09);
    ctx.rotate(ang);
    ctx.fillStyle = `rgba(255,226,140,${pulse})`;
    ctx.strokeStyle = "rgba(60,40,10,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-10, -11);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.rotate(-ang);
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(`${away}`, 0, 22);
    ctx.fillStyle = "#ffe28c";
    ctx.fillText(`${away}`, 0, 22);
    ctx.restore();
  }

  private drawGoldMines(): void {
    const img = goldMineSprite();
    if (!img) return;
    const s = this.cam.zoom;
    for (const seam of this.world.map.goldSeams()) {
      const tw = seam.x1 - seam.x0 + 1;
      const th = seam.y1 - seam.y0 + 1;
      const p = this.cam.toScreen(seam.x0 * SUB, seam.y0 * SUB);
      const w = tw * s * 1.12;
      const h = (img.naturalHeight / img.naturalWidth) * w;
      if (p.x + w < 0 || p.y + th * s < 0 || p.x > this.cam.viewW || p.y > this.cam.viewH) continue;
      const x = p.x - (w - tw * s) / 2;
      // Sit the mine on the bottom edge of its seam so it reads as standing on it.
      const y = p.y + th * s - h + s * 0.15;
      this.ctx.fillStyle = "rgba(0,0,0,0.28)";
      this.ctx.beginPath();
      this.ctx.ellipse(p.x + (tw * s) / 2, p.y + th * s - s * 0.15, w * 0.4, s * 0.28, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.drawImage(img, x, y, w, h);
    }
  }

  /** Arrows, bolts and shells in flight, arcing toward their target. */
  private drawProjectiles(): void {
    const ctx = this.ctx;
    for (const p of this.world.projectiles) {
      const x = p.from.x + (p.to.x - p.from.x) * p.t;
      const y = p.from.y + (p.to.y - p.from.y) * p.t;
      // A parabolic hop, highest at the midpoint.
      const lift = Math.sin(p.t * Math.PI) * SUB * (p.kind === "shell" ? 1.2 : 0.5);
      const s = this.cam.toScreen(x, y - lift);
      const scale = this.cam.zoom / SUB;
      if (p.kind === "bolt") {
        ctx.fillStyle = "rgba(140,200,255,0.9)";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(220,240,255,0.9)";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2 * scale, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "shell") {
        ctx.fillStyle = "#2b2b2b";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 5 * scale, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const ang = Math.atan2(p.to.y - p.from.y, p.to.x - p.from.x);
        ctx.strokeStyle = "#e8dcc4";
        ctx.lineWidth = Math.max(1, 1.6 * scale);
        ctx.beginPath();
        ctx.moveTo(s.x - Math.cos(ang) * 7 * scale, s.y - Math.sin(ang) * 7 * scale);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
    }
  }

  private drawResources(): void {
    // Nothing extra for now; resource amounts appear in the HUD on hover.
  }

  // ───────────────────────────── buildings ─────────────────────────────

  private drawBuilding(b: Building, selected: boolean, alpha = 0): void {
    const ctx = this.ctx;
    const s = this.cam.zoom;
    const p = this.cam.toScreen(b.tx * SUB, b.ty * SUB);
    const w = b.size * s;
    if (p.x + w < 0 || p.y + w < 0 || p.x > this.cam.viewW || p.y > this.cam.viewH) return;
    const color = this.world.players.get(b.owner)!.color;
    const d = BUILDINGS[b.def]!;

    const faction = this.world.players.get(b.owner)!.faction;
    const art = { ctx, faction, def: b.def, x: p.x, y: p.y, w, color, progress: b.progress / d.buildTime, tick: this.world.tick + alpha, level: b.level };
    if (!b.complete) {
      drawConstruction(art);
      this.bar(p.x, p.y - 6, w, art.progress, "#e8c547");
    } else if (!(faction === "human" && this.drawPaintedBuilding(b, p.x, p.y, w, color))) {
      artFor(faction, b.def)?.(art);
    }
    if (b.complete && settings.animations) this.drawBuildingActivity(b, p.x, p.y, w, alpha);
    if (selected) {
      // Corner brackets on the ground footprint — a full box would cut across
      // the painted art, which deliberately overhangs its tiles.
      ctx.strokeStyle = "#9cff9c";
      ctx.lineWidth = 2;
      const k = Math.max(6, w * 0.22);
      for (const [cx, cy, dx, dy] of [
        [p.x, p.y, 1, 1],
        [p.x + w, p.y, -1, 1],
        [p.x, p.y + w, 1, -1],
        [p.x + w, p.y + w, -1, -1],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(cx + dx * k, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + dy * k);
        ctx.stroke();
      }
      this.bar(p.x, p.y + w + 2, w, b.hp / b.maxHp, "#4ce04c");
    }
    // Show a levelled building's area of effect while it is selected.
    if (selected && b.complete) {
      const lv = LEVELLED[b.def] ? levelDef(b.def, b.level) : null;
      if (lv?.radius) {
        const c = { x: p.x + w / 2, y: p.y + w / 2 };
        ctx.strokeStyle = lv.heal ? "rgba(150,230,150,0.55)" : "rgba(150,200,255,0.45)";
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(c.x, c.y, lv.radius * s, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // Fire, straight off the health bar's own number: no state, no events. A
    // building that is being repaired stops burning by itself.
    if (b.complete) {
      const frac = b.hp / b.maxHp;
      this.drawBuildingDamage(b, p.x, p.y, w, frac);
      if (settings.animations) drawFire(ctx, p.x, p.y, w, frac, this.world.tick + alpha, b.id);
    }
    // A damaged building shows its health, selected or not, unless the player
    // has asked for bars only on selection.
    if (this.wantsBar(b.hp / b.maxHp, selected)) this.bar(p.x, p.y - 6, w, b.hp / b.maxHp, b.hp / b.maxHp < 0.35 ? "#e04c4c" : "#4ce04c");
    if (b.research) this.bar(p.x, p.y + w - 9, w, 1 - b.research.remaining / b.research.total, "#c98bff");
    // Training / upgrade progress.
    if (b.complete) {
      if (b.upgrade) this.bar(p.x, p.y + w - 5, w, 1 - b.upgrade.remaining / b.upgrade.total, "#e8c547");
      else {
        const job = b.queue[0];
        if (job) this.bar(p.x, p.y + w - 5, w, 1 - job.remaining / job.total, "#5ab0ff");
      }
    }
  }

  /**
   * Small, cheap loops that keep completed structures alive even when their
   * painted tier sprite is static. Bespoke building sheets can replace these
   * later without changing simulation or building data.
   */
  private drawBuildingActivity(b: Building, x: number, y: number, w: number, alpha: number): void {
    const ctx = this.ctx;
    const t = (this.world.tick + alpha) / 20 + b.id * 0.173;
    const cx = x + w * 0.5;
    const cy = y + w * 0.5;

    const puff = (px: number, py: number, phase: number, scale = 1): void => {
      const k = ((t * 0.32 + phase) % 1 + 1) % 1;
      ctx.globalAlpha = (1 - k) * 0.26;
      ctx.fillStyle = "#c9c7c2";
      ctx.beginPath();
      ctx.arc(px + Math.sin(t * 1.7 + phase * 5) * w * 0.025, py - k * w * 0.3, w * (0.018 + k * 0.035) * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    const pennant = (px: number, py: number, h: number): void => {
      const player = this.world.players.get(b.owner);
      if (!player) return;
      const wave = Math.sin(t * 4.2) * w * 0.035;
      ctx.strokeStyle = "#3a2a1a";
      ctx.lineWidth = Math.max(1, w * 0.009);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py + h);
      ctx.stroke();
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + w * 0.12, py + h * 0.1 + wave, px + w * 0.2, py + h * 0.22);
      ctx.lineTo(px, py + h * 0.3);
      ctx.closePath();
      ctx.fill();
    };

    ctx.save();
    switch (b.def) {
      case "townhall":
      case "barracks":
      case "stables":
      case "tower":
      case "gryphonaviary":
        pennant(cx, y + w * 0.06, w * 0.26);
        break;

      case "farm": {
        // A few foreground stalks bend together in the wind.
        ctx.strokeStyle = "rgba(221,190,89,0.75)";
        ctx.lineWidth = Math.max(1, w * 0.008);
        const sway = Math.sin(t * 2.4) * w * 0.025;
        for (let i = 0; i < 6; i++) {
          const px = x + w * (0.18 + i * 0.12);
          const py = y + w * 0.83;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.quadraticCurveTo(px + sway, py - w * 0.12, px + sway * 1.4, py - w * 0.2);
          ctx.stroke();
        }
        break;
      }

      case "lumbermill": {
        // Visible saw wheel: enough motion to read as a working mill over any
        // painted tier sprite.
        const sx = x + w * 0.8;
        const sy = y + w * 0.7;
        const r = w * 0.075;
        ctx.strokeStyle = "#c8cdd1";
        ctx.lineWidth = Math.max(1, w * 0.012);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const a = t * 7 + (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
          ctx.stroke();
        }
        break;
      }

      case "shipyard": {
        const sway = Math.sin(t * 1.8) * w * 0.08;
        ctx.strokeStyle = "#d9d1bf";
        ctx.lineWidth = Math.max(1, w * 0.007);
        ctx.beginPath();
        ctx.moveTo(x + w * 0.78, y + w * 0.25);
        ctx.lineTo(x + w * 0.61 + sway, y + w * 0.67);
        ctx.stroke();
        ctx.fillStyle = "#777d82";
        ctx.fillRect(x + w * 0.59 + sway, y + w * 0.66, w * 0.045, w * 0.035);
        break;
      }

      case "church": {
        const pulse = 0.45 + Math.sin(t * 2.2) * 0.18;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = pulse * 0.22;
        const g = ctx.createRadialGradient(cx, y + w * 0.28, 0, cx, y + w * 0.28, w * 0.28);
        g.addColorStop(0, "rgba(255,232,155,1)");
        g.addColorStop(1, "rgba(255,232,155,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, y + w * 0.28, w * 0.28, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case "magetower": {
        ctx.globalCompositeOperation = "lighter";
        const r = w * 0.16;
        for (let i = 0; i < 3; i++) {
          const a = t * (1.1 + i * 0.18) + (i / 3) * Math.PI * 2;
          const px = cx + Math.cos(a) * r;
          const py = y + w * 0.28 + Math.sin(a) * r * 0.42;
          ctx.fillStyle = i === 0 ? "rgba(120,205,255,0.8)" : "rgba(135,120,255,0.62)";
          ctx.beginPath();
          ctx.arc(px, py, Math.max(1.5, w * 0.018), 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case "foundry":
        puff(x + w * 0.35, y + w * 0.3, 0.1, 1.2);
        puff(x + w * 0.68, y + w * 0.26, 0.58, 1.1);
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 4; i++) {
          const k = ((t * 1.4 + i * 0.23) % 1 + 1) % 1;
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = "#ffb43d";
          ctx.beginPath();
          ctx.arc(x + w * 0.54 + Math.sin(i * 2.2) * w * 0.07 * k, y + w * 0.73 - k * w * 0.18, Math.max(1, w * 0.009), 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      case "oilrig": {
        const a = Math.sin(t * 2.1) * 0.32;
        const px = x + w * 0.52;
        const py = y + w * 0.42;
        ctx.strokeStyle = "#4b4240";
        ctx.lineWidth = Math.max(2, w * 0.018);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * w * 0.23, py + Math.sin(a) * w * 0.13);
        ctx.stroke();
        break;
      }

      case "refinery":
        puff(x + w * 0.34, y + w * 0.24, 0.2, 1.1);
        puff(x + w * 0.62, y + w * 0.2, 0.66, 1.35);
        break;

      case "airfactory": {
        // A test propeller on the apron.
        const px = x + w * 0.76;
        const py = y + w * 0.7;
        ctx.strokeStyle = "#d6dadd";
        ctx.lineWidth = Math.max(1.2, w * 0.012);
        for (let i = 0; i < 2; i++) {
          const a = t * 11 + i * Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(px - Math.cos(a) * w * 0.09, py - Math.sin(a) * w * 0.09);
          ctx.lineTo(px + Math.cos(a) * w * 0.09, py + Math.sin(a) * w * 0.09);
          ctx.stroke();
        }
        break;
      }

      case "torch": {
        // The main flame is part of the tier art. Loose embers make it feel
        // alive and scale naturally with the larger upper-tier beacon.
        const lv = levelDef("torch", b.level);
        const power = lv.light ?? 0.3;
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 5; i++) {
          const k = ((t * (0.7 + i * 0.09) + i * 0.21) % 1 + 1) % 1;
          const px = cx + Math.sin(i * 3.1 + t) * w * 0.08 * k;
          const py = y + w * (0.39 - b.level * 0.012) - k * w * (0.18 + power * 0.2);
          ctx.globalAlpha = (1 - k) * (0.3 + power * 0.55);
          ctx.fillStyle = b.level >= 10 ? "#9bd7ff" : "#ffbe55";
          ctx.beginPath();
          ctx.arc(px, py, Math.max(1, w * (0.008 + power * 0.008) * (1 - k)), 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case "golddepot": {
        const pulse = 0.45 + Math.sin(t * 3.4) * 0.35;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = pulse * 0.5;
        ctx.fillStyle = "#ffd85e";
        ctx.beginPath();
        ctx.arc(cx + w * 0.18, cy - w * 0.12, Math.max(1.5, w * 0.018), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }

    // Any active upgrade/research gets a few work sparks so progress is visible
    // in the world as well as on the HUD bar.
    if (b.upgrade || b.research) {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 3; i++) {
        const k = ((t * 1.7 + i * 0.31) % 1 + 1) % 1;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = b.research ? "#cfa5ff" : "#ffd36b";
        ctx.beginPath();
        ctx.arc(cx + Math.sin(i * 4 + t) * w * 0.12, y + w * 0.68 - k * w * 0.16, Math.max(1, w * 0.008), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * Readable structural damage layered over the finished building art.
   *
   * This gives every Human structure seven visible damage bands even where a
   * bespoke destroyed sprite has not been painted yet: cracks, soot, missing
   * masonry, exposed beams and rubble intensify as HP falls. Fire remains a
   * separate animated layer so repairing a building naturally reverses both.
   */
  private drawBuildingDamage(b: Building, x: number, y: number, w: number, frac: number): void {
    if (frac > 0.9) return;
    const ctx = this.ctx;
    const severity = Math.max(0, Math.min(1, (0.9 - frac) / 0.9));
    ctx.save();

    // Soot and scorching start early and become much stronger below half health.
    ctx.globalAlpha = 0.08 + severity * 0.22;
    ctx.fillStyle = "#171719";
    for (let i = 0; i < 2 + Math.floor(severity * 5); i++) {
      const h = ((b.id * 1103515245 + i * 12345) >>> 0) / 4294967296;
      const k = ((b.id * 2654435761 + i * 7919) >>> 0) / 4294967296;
      ctx.beginPath();
      ctx.ellipse(
        x + w * (0.15 + h * 0.7),
        y + w * (0.2 + k * 0.55),
        w * (0.05 + severity * 0.05),
        w * (0.025 + severity * 0.04),
        h * 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Masonry cracks. Fixed from id/index so they do not shimmer frame to frame.
    ctx.globalAlpha = 0.55 + severity * 0.35;
    ctx.strokeStyle = "#2b2522";
    ctx.lineWidth = Math.max(1, w * 0.012);
    const cracks = 1 + Math.floor(severity * 7);
    for (let i = 0; i < cracks; i++) {
      const sx = x + w * (0.15 + (((b.id * 17 + i * 31) % 67) / 100));
      const sy = y + w * (0.28 + (((b.id * 29 + i * 19) % 48) / 100));
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + w * (0.025 + (i % 3) * 0.015), sy + w * 0.07);
      ctx.lineTo(sx - w * (0.015 + (i % 2) * 0.02), sy + w * 0.12);
      if (severity > 0.45) ctx.lineTo(sx + w * 0.03, sy + w * 0.18);
      ctx.stroke();
    }

    // Heavy damage exposes timber and drops rubble around the footprint.
    if (frac < 0.55) {
      const heavy = (0.55 - frac) / 0.55;
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = "#5b4028";
      ctx.lineWidth = Math.max(2, w * 0.025);
      for (let i = 0; i < 2 + Math.floor(heavy * 4); i++) {
        const bx = x + w * (0.18 + (((b.id + i * 13) % 61) / 100));
        const by = y + w * (0.32 + (((b.id * 7 + i * 23) % 47) / 100));
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + w * (i % 2 ? 0.09 : -0.07), by + w * 0.16);
        ctx.stroke();
      }
      ctx.fillStyle = "#6d665d";
      const rubble = 3 + Math.floor(heavy * 8);
      for (let i = 0; i < rubble; i++) {
        const rx = x + w * (0.04 + (((b.id * 11 + i * 37) % 91) / 100));
        const ry = y + w * (0.82 + (((b.id * 5 + i * 17) % 15) / 100));
        const rw = w * (0.025 + (i % 3) * 0.012);
        ctx.fillRect(rx, ry, rw, rw * 0.65);
      }
    }

    // Near collapse: dark broken voids imply missing roof/wall sections.
    if (frac < 0.28) {
      const collapse = (0.28 - frac) / 0.28;
      ctx.globalAlpha = 0.35 + collapse * 0.35;
      ctx.fillStyle = "#171516";
      ctx.beginPath();
      ctx.moveTo(x + w * 0.14, y + w * 0.22);
      ctx.lineTo(x + w * (0.35 + collapse * 0.08), y + w * 0.18);
      ctx.lineTo(x + w * 0.31, y + w * (0.42 + collapse * 0.08));
      ctx.lineTo(x + w * 0.11, y + w * 0.38);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  private drawGhost(g: Ghost): void {
    const ctx = this.ctx;
    const s = this.cam.zoom;
    const d = BUILDINGS[g.def]!;
    const p = this.cam.toScreen(g.tx * SUB, g.ty * SUB);
    const w = d.size * s;
    ctx.globalAlpha = 0.55;
    const faction = this.world.players.get(g.owner)!.faction;
    artFor(faction, g.def)?.({ ctx, faction, def: g.def, x: p.x, y: p.y, w, color: g.ok ? "#9cff9c" : "#ff6b6b", progress: 1, tick: this.world.tick, level: 1 });
    ctx.globalAlpha = 1;
    // Per-tile validity overlay.
    for (let y = 0; y < d.size; y++)
      for (let x = 0; x < d.size; x++) {
        const ok = this.world.map.isBuildable(g.tx + x, g.ty + y);
        ctx.fillStyle = ok ? "rgba(80,255,80,0.25)" : "rgba(255,60,60,0.45)";
        ctx.fillRect(p.x + x * s, p.y + y * s, s, s);
      }
    ctx.strokeStyle = g.ok ? "#9cff9c" : "#ff6b6b";
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x, p.y, w, w);
  }

  // ───────────────────────────── units ─────────────────────────────

  /**
   * Whether this unit is currently inside something and should not be drawn.
   *
   * A man at a gold seam is down the shaft, and a man delivering a load has
   * walked in through the door. Leaving him standing on the roof of the Town
   * Hall with a sack, or hovering in the mouth of the mine, is the sort of
   * thing you stop noticing while you are making the game and everybody
   * notices the moment they play it.
   *
   * Purely a drawing decision. He is still there, still selectable, still doing
   * the work -- the simulation has no idea any of this is happening, which is
   * how it has to be, because two machines running a network game must agree
   * about the world and they are allowed to disagree about the picture.
   */
  private indoors(u: Unit): boolean {
    const t = u.task;
    if (t.kind !== "gather") return false;
    // Down the shaft, or through the door with a load.
    return (t.phase === "harvest" && t.resource === "gold") || t.phase === "deposit";
  }

  private drawUnit(u: Unit, alpha: number, selected: boolean): void {
    const ctx = this.ctx;
    const person = UNITS[u.def]!.domain === "land" && !UNITS[u.def]!.skittish
      && (UNITS[u.def]!.canGather || UNITS[u.def]!.royal);
    const s = this.cam.zoom * (person ? 1.18 : 1);
    if (this.indoors(u)) {
      // A ring stays where he went in, so a selected worker is not simply lost.
      if (selected) {
        const pv = this.prev.get(u.id) ?? u.pos;
        const q = this.cam.toScreen(pv.x, pv.y);
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = "#9cff9c";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(q.x, q.y + s * 0.42, s * 0.4, s * 0.17, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }
    const pv = this.prev.get(u.id) ?? u.pos;
    const wx = pv.x + (u.pos.x - pv.x) * alpha;
    const wy = pv.y + (u.pos.y - pv.y) * alpha;
    const p = this.cam.toScreen(wx, wy);
    if (p.x < -s || p.y < -s || p.x > this.cam.viewW + s || p.y > this.cam.viewH + s) return;
    // Lean into a swing and settle back. Purely cosmetic: the blow already landed
    // in the sim on the tick the lunge started.
    if (settings.animations) {
      const off = this.fx.lungeOffset(u.id, this.world.tick + alpha, s);
      p.x += off.x;
      p.y += off.y;
    }
    const player = this.world.players.get(u.owner)!;
    const def = UNITS[u.def]!;
    const h = s * (def.domain === "sea" ? 1.2 : def.domain === "air" ? 1.15 : 1.1);
    const moving = pv.x !== u.pos.x || pv.y !== u.pos.y;
    // Walk cycle: ~0.5 s per stride, offset per unit so crowds don't march in lockstep.
    const phase = settings.animations ? (((this.world.tick + alpha) / 10 + u.id * 0.37) % 1 + 1) % 1 : 0;
    const state = stateFor(u, moving);
    const seconds = (this.world.tick + alpha) / 20;
    const elapsed = this.animationClock.elapsed(u, state, seconds);

    if (selected || (person && u.owner === this.viewer)) {
      ctx.save();
      ctx.strokeStyle = selected ? "#b9ff9c" : def.royal ? "rgba(242,193,78,0.8)" : "rgba(189,215,172,0.6)";
      ctx.lineWidth = selected ? 2 : 1;
      ctx.fillStyle = "rgba(12,18,12,0.3)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + h * 0.42, h * 0.4, h * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    const draw = unitArtFor(player.faction, u.def);
    const afloat = this.world.isAfloat(u);
    // A struck sprite lights up for a few ticks. Real frame clips own their body
    // motion; procedural/still art receives the universal fallback pose.
    const flash = settings.animations ? this.fx.flashAt(u.id, this.world.tick + alpha) : 0;
    const sheet = anySheets() ? sheetFor(player.faction, u.def) : null;
    const hasClip = sheet ? clipFor(sheet, state) !== null : false;
    const pose = settings.animations && !hasClip
      ? motionFor(u, state, seconds, flash)
      : { dx: 0, dy: 0, rotate: 0, sx: 1, sy: 1, pulse: 0 };
    const ax = p.x + pose.dx * h;
    const ay = p.y + pose.dy * h;

    if (flash > 0) {
      ctx.save();
      ctx.filter = `brightness(${1 + flash * 0.55}) saturate(${1 - flash * 0.25})`;
    }
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(pose.rotate);
    ctx.scale(pose.sx, pose.sy);
    ctx.translate(-ax, -ay);

    // How tall the thing that was actually drawn turned out to be. The painted
    // sprites are half again as tall as the fallback figure, and hanging a crown
    // off the fallback's height put it through the King's head.
    let drawnH = h;
    const framed = anySheets() ? this.drawUnitFrames(u, ax, ay, s, player.faction, state, elapsed) : null;
    const painted = framed === null ? this.drawUnitSprite(u, ax, ay, s, player.color, moving, phase) : null;
    const peasant = framed === null && painted === null && player.faction === "human" && u.def === "worker"
      ? this.drawPeasant(u, ax, ay, s, player.color, moving, phase, afloat)
      : null;
    if (framed !== null) {
      drawnH = framed;
    } else if (painted !== null) {
      drawnH = painted;
    } else if (peasant !== null) {
      drawnH = peasant;
    } else if (draw) {
      draw({ ctx, x: ax, y: ay, h, color: player.color, facing: u.facing, phase, moving, carrying: u.carrying?.resource ?? null, seed: u.id });
    } else {
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(ax, ay, h * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (flash > 0) ctx.restore();
    // A crown, so the King is never lost in a crowd of his own footmen. Gold for
    // the King, a thinner silver circlet for an heir.
    if (def.royal) {
      const king = u.def === "king";
      const cy = ay + s * 0.45 - drawnH - s * 0.1;
      const cw = s * (king ? 0.26 : 0.2);
      ctx.save();
      ctx.strokeStyle = "rgba(20,14,4,0.85)";
      ctx.lineWidth = Math.max(1, s * 0.025);
      ctx.fillStyle = king ? "#f2c14e" : "#cfd6e0";
      ctx.beginPath();
      ctx.moveTo(ax - cw, cy);
      ctx.lineTo(ax - cw, cy - s * 0.1);
      ctx.lineTo(ax - cw * 0.5, cy - s * 0.04);
      ctx.lineTo(ax, cy - s * (king ? 0.14 : 0.11));
      ctx.lineTo(ax + cw * 0.5, cy - s * 0.04);
      ctx.lineTo(ax + cw, cy - s * 0.1);
      ctx.lineTo(ax + cw, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    if (this.wantsBar(u.hp / u.maxHp, selected)) {
      // Above the head of whatever was drawn, and above the crown if there is
      // one, rather than across the chest of a tall sprite.
      const barY = ay + s * 0.45 - drawnH - (def.royal ? s * 0.3 : s * 0.12);
      this.bar(ax - drawnH * 0.22, barY, drawnH * 0.44, u.hp / u.maxHp, "#4ce04c");
    }
  }

  /**
   * The dead, mid-fall. The entity is gone from the sim the instant it dies, so
   * everything needed to draw it -- what it was, whose it was, which way it faced
   * -- travelled in the death event.
   */
  private drawCorpses(): void {
    const ctx = this.ctx;
    const s = this.cam.zoom;
    const now = this.world.tick;
    for (const c of this.fx.corpses) {
      const k = this.fx.fallProgress(c, now);
      if (k === null) continue;
      const p = this.cam.toScreen(c.x, c.y);
      if (p.x < -s * 6 || p.y < -s * 6 || p.x > this.cam.viewW + s * 6 || p.y > this.cam.viewH + s * 6) continue;
      const player = this.world.players.get(c.owner);
      if (!player) continue;

      if (c.building) {
        const size = BUILDINGS[c.def]?.size ?? 2;
        const w = size * s;
        const collapse = Math.min(1, k / 0.2);
        const fade = k < 0.78 ? 1 : Math.max(0, (1 - k) / 0.22);
        ctx.save();
        ctx.globalAlpha = fade;

        // The footprint remains as charred rubble after the vertical collapse.
        ctx.fillStyle = "rgba(42,38,35,0.78)";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + w * 0.2, w * 0.48, w * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();

        // Chunks fall outward during the first second, then stay where they land.
        const seed = c.def.length * 97 + c.t0;
        for (let i = 0; i < 12; i++) {
          const a = ((seed + i * 43) % 360) * Math.PI / 180;
          const dist = w * (0.08 + ((seed + i * 17) % 23) / 100) * collapse;
          const bx = p.x + Math.cos(a) * dist;
          const by = p.y + w * 0.1 + Math.sin(a) * dist * 0.45 + collapse * w * 0.12;
          const bw = w * (0.045 + (i % 4) * 0.012);
          ctx.save();
          ctx.translate(bx, by);
          ctx.rotate(a + collapse * (i % 2 ? 0.8 : -0.6));
          ctx.fillStyle = i % 3 === 0 ? player.color : i % 2 === 0 ? "#6f6860" : "#4f4438";
          ctx.fillRect(-bw / 2, -bw * 0.35, bw, bw * 0.7);
          ctx.restore();
        }

        // A shrinking upright silhouette sells the actual collapse rather than
        // making the building pop straight into a rubble decal.
        if (collapse < 1) {
          ctx.globalAlpha = fade * (1 - collapse) * 0.75;
          ctx.fillStyle = "#514942";
          ctx.save();
          ctx.translate(p.x, p.y + w * 0.16);
          ctx.scale(1 + collapse * 0.25, 1 - collapse * 0.85);
          ctx.fillRect(-w * 0.32, -w * 0.8, w * 0.64, w * 0.8);
          ctx.restore();
        }

        // Dust rolls outward while the walls are coming down.
        if (collapse < 1) {
          ctx.globalAlpha = (1 - collapse) * 0.32;
          ctx.strokeStyle = "#c9bda8";
          ctx.lineWidth = Math.max(2, s * 0.06);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + w * 0.16, w * (0.28 + collapse * 0.35), w * (0.1 + collapse * 0.14), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }

      const view = unitViewSprite(c.def, c.facing, player.color);
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      ctx.translate(p.x, p.y + s * 0.45 + k * s * 0.12);
      // Topple in the direction it was facing, and sink as it fades.
      ctx.rotate((c.facing >= 4 ? -1 : 1) * k * (Math.PI / 2) * 0.85);
      if (view) {
        const h = s * (UNIT_VIEW_HEIGHT[c.def] ?? 1.5);
        const w = (view.img.width / view.img.height) * h;
        if (view.mirror) ctx.scale(-1, 1);
        ctx.drawImage(view.img, -w / 2, -h, w, h);
      } else {
        // No painted view for this unit: a fading disc still marks the loss.
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.ellipse(0, -s * 0.2, s * 0.3, s * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** Whether to draw a health bar for something at this fraction of full health. */
  private wantsBar(frac: number, selected: boolean): boolean {
    if (settings.healthBars === "never") return selected;
    if (settings.healthBars === "always") return true;
    return selected || frac < 1;
  }

  /**
   * Painted building sprites. The art is isometric and taller than its tile
   * footprint, so it is anchored to the FRONT-BOTTOM of the footprint and allowed
   * to overhang upward — higher Town Hall tiers visibly sprawl past their base.
   */
  private drawPaintedBuilding(b: Building, x: number, y: number, w: number, color: string): boolean {
    const faction = this.world.players.get(b.owner)!.faction;
    const sprite = tierSprite(b.def, b.level, color, faction);
    if (!sprite) return false;
    // A building with no tier table (the Gold Depot) still has painted art.
    const scale = LEVELLED[b.def] ? levelDef(b.def, b.level).scale : 1;
    const dw = w * scale;
    const dh = (sprite.height / sprite.width) * dw;
    // Bottom of the sprite sits slightly below the footprint's bottom edge.
    this.ctx.drawImage(sprite, x + (w - dw) / 2, y + w + w * 0.06 - dh, dw, dh);
    return true;
  }

  /** Painted units drawn from front/side/back views, chosen by facing. */
  private drawUnitSprite(u: Unit, x: number, y: number, s: number, color: string, moving: boolean, phase: number): number | null {
    const view = unitViewSprite(u.def, u.facing, color);
    if (!view) return null;
    const ctx = this.ctx;
    const h = s * (UNIT_VIEW_HEIGHT[u.def] ?? (UNITS[u.def]!.royal ? 1.4 : 1.5));
    const w = (view.img.width / view.img.height) * h;
    // Wheeled things roll rather than step, so they get the sway and no bounce.
    const heavy = UNIT_VIEW_HEIGHT[u.def] !== undefined;
    const g = settings.animations ? gait(phase, moving, s, heavy) : NO_GAIT;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.42, s * 0.32 * g.shadow, s * 0.13 * g.shadow, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y + s * 0.45 - g.lift);
    if (view.mirror) ctx.scale(-1, 1);
    ctx.rotate(g.lean);
    // Squash about the feet, not the middle: scaling around the centre would
    // sink the sprite into the ground on every step.
    ctx.scale(g.sx, g.sy);
    if (moving && settings.animations && !heavy) {
      drawWalk(ctx, view.img, view.img.width, view.img.height, w, h, phase, LEG_SWING);
    } else {
      ctx.drawImage(view.img, -w / 2, -h, w, h);
    }
    ctx.restore();
    // Men carry their owner's colour on their tabards, but a machine is all
    // timber and steel, so a red ballista and a blue one would be identical.
    // A crew pennant on a staff gives it an owner at a glance.
    if (UNIT_VIEW_HEIGHT[u.def] !== undefined) {
      const px = x - w * 0.34;
      const py = y + s * 0.45 - h;
      ctx.strokeStyle = "rgba(30,22,14,0.9)";
      ctx.lineWidth = Math.max(1, s * 0.035);
      ctx.beginPath();
      ctx.moveTo(px, py + s * 0.1);
      ctx.lineTo(px, py - s * 0.45);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(px, py - s * 0.45);
      ctx.lineTo(px + s * 0.3, py - s * 0.34);
      ctx.lineTo(px, py - s * 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = Math.max(1, s * 0.02);
      ctx.stroke();
    }
    return h;
  }

  /** Painted peasant sprites: the variant follows the worker's current task. */
  private drawPeasant(u: Unit, x: number, y: number, s: number, color: string, moving: boolean, phase: number, afloat = false): number | null {
    const t = u.task;
    let kind: PeasantKind = "classic";
    if (t.kind === "build" || t.kind === "repair") kind = "builder";
    else if (t.kind === "gather") {
      if (t.phase === "toDrop" || t.phase === "deposit" || u.carrying) kind = "cartpusher";
      else kind = t.resource === "lumber" ? "woodcutter" : "farmhand";
    } else if (t.kind === "move") kind = "villager";
    const back = u.facing >= 1 && u.facing <= 3 && moving;
    const sprite = peasantSprite(kind, back, color);
    if (!sprite) return null;
    const h = s * 1.35;
    const w = (sprite.width / sprite.height) * h;
    const ctx = this.ctx;
    const g = settings.animations ? gait(phase, moving, s) : NO_GAIT;
    // A worker mid-stroke winds back and drives through; the sim tells us when.
    const stroke = settings.animations ? this.fx.strokeAt(u.id, this.world.tick) : null;
    if (afloat) {
      // Wake trailing behind, and a ripple ring at the waterline.
      ctx.strokeStyle = "rgba(235,245,255,0.5)";
      ctx.lineWidth = Math.max(1, s * 0.04);
      const spread = 0.55 + 0.25 * Math.sin(phase * Math.PI * 2);
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.3, s * 0.34 * spread + s * 0.2, s * 0.13, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.42, s * 0.34 * g.shadow, s * 0.13 * g.shadow, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(x, y + s * 0.45 - g.lift);
    // Source art faces slightly left; mirror when heading right.
    if (u.facing >= 3 && u.facing <= 5) ctx.scale(-1, 1);
    ctx.rotate(g.lean + (stroke === null ? 0 : swingLean(stroke)));
    ctx.scale(g.sx, g.sy);
    if (afloat) {
      // Clip at the waterline so the swimmer is submerged to the chest, and bob.
      ctx.translate(0, Math.sin(phase * Math.PI * 2 + 1) * s * 0.03);
      ctx.beginPath();
      ctx.rect(-w, -h, w * 2, h - s * 0.34);
      ctx.clip();
    }
    // Swimmers keep their legs still: they are clipped at the waterline anyway,
    // and a peasant kicking above the surface looks wrong.
    if (moving && settings.animations && !afloat) {
      drawWalk(ctx, sprite, sprite.width, sprite.height, w, h, phase, LEG_SWING * 0.85);
    } else {
      ctx.drawImage(sprite, -w / 2, -h, w, h);
    }
    ctx.restore();
    return h;
  }

  private bar(x: number, y: number, w: number, frac: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), 4);
  }

  /** Minimap: whole map scaled to a square. */
  /**
   * `target` lets the minimap be drawn into a canvas of its own rather than
   * into the main one. It lives in a DOM panel now, so it has its own surface.
   */
  drawMinimap(x: number, y: number, size: number, viewport: boolean, target?: CanvasRenderingContext2D): void {
    const ctx = target ?? this.ctx;
    const map = this.world.map;
    const sx = size / map.width;
    const sy = size / map.height;
    // The coarse whole-map bake is exactly what a minimap wants, and it is
    // already in hand whenever the player has been zoomed out.
    // Through bakeFar, not bakeRegion: the coarse canvas is shared with the
    // zoomed-out view, and baking it here without the forest left the map bare
    // the moment the player opened a game and looked at the minimap first.
    // The minimap is now the first thing that wants the coarse bake, because it
    // is on screen from the first frame while the zoomed-out view may never be.
    // Waiting for the terrain pass to agree about versions left it black.
    if (!this.terrainFar || (this.farStale && this.terrainVersion === map.version)) {
      this.terrainFar = this.bakeFar(map, grassTexture());
    }
    if (this.terrainFar) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.terrainFar, x, y, size, size);
    }
    // The minimap has to obey the fog too, or it becomes a perfect radar that
    // makes scouting pointless -- the exact bug fog of war exists to prevent.
    const v = this.world.fogEnabled ? this.world.vision.get(this.viewer) : null;
    if (v) {
      // Baked to a one-pixel-per-tile bitmap and stretched, rather than drawn as
      // thousands of little rectangles every frame. On a 64x64 board the naive
      // version is 4096 fillRects per frame; at the map sizes we want next it is
      // 25,000, sixty times a second, for a picture that only changes every
      // fourth tick.
      const fog = this.bakeFogTile(v, map.width, map.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(fog, x, y, size, size);
      ctx.imageSmoothingEnabled = true;
    }
    for (const b of this.world.buildings()) {
      // Buildings are remembered: explored ground is enough.
      if (v && b.owner !== this.viewer && v.at(b.tx, b.ty) === UNEXPLORED) continue;
      ctx.fillStyle = this.world.players.get(b.owner)!.color;
      ctx.fillRect(x + b.tx * sx, y + b.ty * sy, Math.max(2, b.size * sx), Math.max(2, b.size * sy));
    }
    for (const u of this.world.units()) {
      // Units are not: an enemy shows only while something of yours watches him.
      if (v && u.owner !== this.viewer && !v.seesPoint(u.pos.x, u.pos.y)) continue;
      ctx.fillStyle = this.world.players.get(u.owner)!.color;
      ctx.fillRect(x + (u.pos.x / SUB) * sx - 1, y + (u.pos.y / SUB) * sy - 1, 2, 2);
    }
    // Your own weapon is marked, always, fog or no fog. He is walking to his
    // own destiny: the game is waiting on him reaching it, and a player who
    // cannot find the thing the game is waiting on has no game at all. Where it
    // lies is knowledge his own people would have; what is between him and it is
    // not, and that stays dark.
    for (const r of this.world.relics) {
      if (r.taken || r.owner !== this.viewer) continue;
      const pulse = 0.6 + 0.4 * Math.sin(this.world.tick * 0.09);
      ctx.fillStyle = `rgba(255,226,140,${pulse})`;
      ctx.beginPath();
      ctx.arc(x + (r.x + 0.5) * sx, y + (r.y + 0.5) * sy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(90,60,10,0.9)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (viewport) {
      const vx = (this.cam.x / SUB) * sx;
      const vy = (this.cam.y / SUB) * sy;
      const vw = (this.cam.viewW / this.cam.scale / SUB) * sx;
      const vh = (this.cam.viewH / this.cam.scale / SUB) * sy;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + vx + 0.5, y + vy + 0.5, vw, vh);
    }
    ctx.strokeStyle = "#777";
    ctx.strokeRect(x + 0.5, y + 0.5, size, size);
  }
}
