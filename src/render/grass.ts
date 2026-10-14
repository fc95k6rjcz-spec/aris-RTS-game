import { natureSource, natureReady } from './nature';

/** A continuous muted meadow texture; wear and dirt are layered separately. */
export function grassVariantFor(_x: number, _y: number): string {
  return natureSource('grass');
}
export function grassVariantCount(): number { return 1; }

/** Rebuild cached terrain once the replacement textures have loaded. */
export function grassReady(): boolean { return natureReady(); }
