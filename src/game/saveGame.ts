import { World } from '../sim/world';
import { GameMap } from '../sim/map';
import { Rng } from '../sim/rng';
import { Vision } from '../sim/vision';
import type { Difficulty, SkirmishAI } from '../ai/skirmish';
import type { MapDef } from '../data/maps';
import type { MatchSetup } from '../net/room';

const KEY = 'realms-of-valor-save-v1';
const classes = { World, GameMap, Rng, Vision };
export interface SavedGame {
  version: 1;
  world: World;
  map: MapDef;
  player: number;
  multiplayer: boolean;
  setup: MatchSetup | null;
  difficulty: Difficulty;
  ai: ReturnType<SkirmishAI['saveState']> | null;
  camera: { x: number; y: number; zoom: number };
  selected: number[];
}

/** Preserve simulation collections, typed arrays and class methods, including RNG state. */
export function encodeSave(save: SavedGame): string {
  return JSON.stringify(save, (_key, value) => {
    if (value instanceof Map) return { $save: 'Map', value: [...value] };
    if (value instanceof Set) return { $save: 'Set', value: [...value] };
    if (value instanceof Uint8Array) return { $save: 'Uint8Array', value: [...value] };
    if (value instanceof Int32Array) return { $save: 'Int32Array', value: [...value] };
    for (const [name, Class] of Object.entries(classes)) if (value instanceof Class) {
      const state = { ...value };
      // Rebuild terrain caches on demand; they are not simulation state.
      if (value instanceof GameMap) Object.assign(state, { regionCache: new Map(), seamCache: null });
      return { $save: name, value: state };
    }
    return value;
  });
}

export function decodeSave(json: string): SavedGame {
  if (json.length > 16000000) throw new Error('This saved game is too large.');
  const save = JSON.parse(json, (key, value) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('Invalid saved game.');
    if (!value || typeof value !== 'object' || !('$save' in value)) return value;
    switch (value.$save) {
      case 'Map': return new Map(value.value);
      case 'Set': return new Set(value.value);
      case 'Uint8Array': return Uint8Array.from(value.value);
      case 'Int32Array': return Int32Array.from(value.value);
      default: {
        if (!Object.hasOwn(classes, value.$save)) throw new Error('Unknown saved game format.');
        const Class = classes[value.$save as keyof typeof classes];
        return Object.assign(Object.create(Class.prototype), value.value);
      }
    }
  }) as SavedGame;
  if (save.version !== 1 || !(save.world instanceof World) || !(save.world.map instanceof GameMap) || !(save.world.rng instanceof Rng) || !(save.world.entities instanceof Map) || !(save.world.players instanceof Map) || !save.world.players.has(save.player) || !save.map || !Array.isArray(save.selected)) throw new Error('This saved game is damaged or incompatible.');
  const {width,height,tiles,occupant}=save.world.map;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width<16 || height<16 || width>256 || height>256 || tiles.length!==width*height || occupant.length!==width*height) throw new Error('Invalid saved map.');
  save.world.checksum();
  return save;
}

export async function packSave(json: string): Promise<string> {
  const bytes = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let text=''; for (const byte of bytes) text+=String.fromCharCode(byte);
  return btoa(text);
}
export async function unpackSave(packed: string): Promise<SavedGame> {
  if (packed.length>4000000) throw new Error('This saved game is too large.');
  const bytes=Uint8Array.from(atob(packed), c=>c.charCodeAt(0));
  const json=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return decodeSave(json);
}
export function hasSavedGame(): boolean { try { return !!localStorage.getItem(KEY); } catch { return false; } }
export function storeSave(packed: string): void { localStorage.setItem(KEY, packed); }
export function readSave(): string { const saved=localStorage.getItem(KEY); if (!saved) throw new Error('No saved game found in this browser.'); return saved; }
