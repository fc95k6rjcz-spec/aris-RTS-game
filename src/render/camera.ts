import { SUB } from "../sim/types";

/** Camera in world sub-tile units. `zoom` = screen pixels per tile. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 40;
  viewW = 0;
  viewH = 0;

  constructor(
    private readonly mapW: number,
    private readonly mapH: number,
  ) {}

  get scale(): number {
    return this.zoom / SUB;
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.clamp();
  }

  pan(dx: number, dy: number): void {
    this.x += dx / this.scale;
    this.y += dy / this.scale;
    this.clamp();
  }

  centerOn(wx: number, wy: number): void {
    this.x = wx - this.viewW / 2 / this.scale;
    this.y = wy - this.viewH / 2 / this.scale;
    this.clamp();
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.toWorld(sx, sy);
    this.zoom = Math.max(16, Math.min(64, this.zoom * factor));
    const after = this.toWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  clamp(): void {
    const maxX = this.mapW * SUB - this.viewW / this.scale;
    const maxY = this.mapH * SUB - this.viewH / this.scale;
    this.x = Math.max(0, Math.min(maxX, this.x));
    this.y = Math.max(0, Math.min(maxY, this.y));
  }

  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: sx / this.scale + this.x, y: sy / this.scale + this.y };
  }
  toScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.x) * this.scale, y: (wy - this.y) * this.scale };
  }
}
