/**
 * Player settings: everything that changes how the game looks, sounds and
 * handles, and nothing that changes what the simulation computes.
 *
 * That line matters. The sim is deterministic so it can later run in lockstep
 * across a network, which means two players must reach identical state from
 * identical commands. A setting that reached into `sim/` would break that the
 * moment two people played with different settings. So everything here is
 * rendering, audio, input or wall-clock pacing -- `gameSpeed` changes how often
 * real time asks the sim to tick, never what a tick does -- and `difficulty` is
 * read once when a game starts rather than during one.
 */

export type HealthBars = "always" | "damaged" | "never";

export interface Settings {
  /** Master gain, 0..1. Audio is not wired up yet; these are the dials for it. */
  volume: number;
  /** Effects gain relative to master, 0..1. */
  sfxVolume: number;
  /** Score gain relative to master, 0..1. */
  musicVolume: number;
  /** The ambient score. Off leaves the effects alone. */
  music: boolean;
  muted: boolean;
  voices: boolean;
  /** Ticks are asked for this many times faster than real time. */
  gameSpeed: number;
  /** Bob, lean and other idle motion. Off is a static, cheaper picture. */
  animations: boolean;
  healthBars: HealthBars;
  /** Floating numbers over anything that takes a blow. */
  damageNumbers: boolean;
  /** Push the camera when the pointer touches the screen edge. */
  edgeScroll: boolean;
  /** Multiplier on keyboard and edge scrolling. */
  scrollSpeed: number;
  /** Applies to the next game started, not the one in progress. */
  difficulty: "easy" | "normal" | "hard" | "none" | "peaceful";
  /** Map id from the catalogue, or "random" for a fresh one every match. */
  mapId: string;
  /** Start with workers and no buildings, and site the Town Hall yourself. */
  nomad: boolean;
  /** Ring every base in forest, so the first job is cutting a way out. */
  stockade: boolean;
  /**
   * Begin as one peasant with no king and no hall. He cannot found anything
   * until he has walked out and found his clan's weapon; taking it up crowns
   * him. Implies the nomad start, because there is nobody to build a hall.
   */
  crowning: boolean;
  /** Bears in the country between you and everywhere else. */
  wildlife: boolean;
  /**
   * How long everything takes. 1 is brisk; 6 turns a twenty-minute skirmish
   * into an afternoon. Not the same as gameSpeed -- that changes how fast real
   * time runs, this changes how much work a thing is.
   */
  pace: number;
}

export const DEFAULTS: Settings = {
  volume: 0.7,
  sfxVolume: 0.8,
  // The score sits well under the effects on purpose: it is weather, not a
  // soundtrack, and it should never be the reason you miss a building going up.
  musicVolume: 0.45,
  music: true,
  muted: false,
  voices: true,
  gameSpeed: 1,
  animations: true,
  healthBars: "damaged",
  damageNumbers: true,
  edgeScroll: true,
  scrollSpeed: 1,
  difficulty: "normal",
  mapId: "random",
  nomad: false,
  stockade: true,
  crowning: true,
  wildlife: true,
  // Brisk construction and training for new players. Saved pace remains respected.
  pace: 1,
};

const KEY = "openrts.settings.v1";

/**
 * The live settings. Read this directly -- it is mutated in place, so anything
 * holding a reference sees changes immediately and there is nothing to re-wire.
 */
export const settings: Settings = { ...DEFAULTS };

const listeners = new Set<(s: Settings) => void>();

/** Called after any change, so the renderer and audio can react. */
export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Load saved settings. Storage can be missing, full, or throw outright (private
 * windows, embedded frames, browsers set to block site data), and a saved blob
 * can be from an older build, so every field is validated rather than trusted
 * and any failure quietly leaves the defaults in place.
 */
export function loadSettings(): void {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const o = JSON.parse(raw) as Partial<Settings>;
    settings.volume = clamp(o.volume, 0, 1, DEFAULTS.volume);
    settings.sfxVolume = clamp(o.sfxVolume, 0, 1, DEFAULTS.sfxVolume);
    settings.musicVolume = clamp(o.musicVolume, 0, 1, DEFAULTS.musicVolume);
    settings.music = o.music !== false;
    settings.muted = o.muted === true;
    settings.voices = o.voices !== false;
    settings.gameSpeed = clamp(o.gameSpeed, 0.5, 3, DEFAULTS.gameSpeed);
    settings.animations = o.animations !== false;
    settings.healthBars = o.healthBars === "always" || o.healthBars === "never" ? o.healthBars : DEFAULTS.healthBars;
    settings.damageNumbers = o.damageNumbers !== false;
    settings.edgeScroll = o.edgeScroll !== false;
    settings.scrollSpeed = clamp(o.scrollSpeed, 0.4, 2.5, DEFAULTS.scrollSpeed);
    const d = o.difficulty;
    settings.difficulty = d === "easy" || d === "hard" || d === "none" || d === "peaceful" ? d : DEFAULTS.difficulty;
    settings.mapId = typeof o.mapId === "string" ? o.mapId : DEFAULTS.mapId;
    settings.nomad = o.nomad === true;
    settings.stockade = o.stockade !== false;
    settings.crowning = o.crowning !== false;
    settings.wildlife = o.wildlife !== false;
    settings.pace = clamp(o.pace, 1, 12, DEFAULTS.pace);
  } catch {
    Object.assign(settings, DEFAULTS);
  }
}

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Nothing to do: the game runs fine unsaved.
  }
}

/** Change one setting, persist, and tell everyone. */
export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  settings[key] = value;
  saveSettings();
  for (const fn of listeners) fn(settings);
}

export function resetSettings(): void {
  Object.assign(settings, DEFAULTS);
  saveSettings();
  for (const fn of listeners) fn(settings);
}

/** Effective gain for a sound effect, once master, effects and mute are applied. */
export function sfxGain(): number {
  return settings.muted ? 0 : settings.volume * settings.sfxVolume;
}

/** The same, for the score. */
export function musicGain(): number {
  return settings.muted || !settings.music ? 0 : settings.volume * settings.musicVolume;
}
