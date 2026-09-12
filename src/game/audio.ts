/**
 * Sound, synthesised rather than sampled.
 *
 * Every effect here is built from oscillators and filtered noise at play time.
 * That is a deliberate trade: synthesised sound is thinner than a good recording,
 * but it adds nothing to a bundle already carrying several megabytes of painted
 * art, needs no files to load or licence, and lets a sword clang be retuned by
 * editing two numbers instead of re-recording anything.
 *
 * Three rules keep a battle from becoming noise:
 *   - distance: sounds fade with how far off-screen centre they happen, and
 *     anything well outside the view is not played at all;
 *   - crowding: the same effect will not retrigger within a few tens of
 *     milliseconds, so twenty footmen swinging together make one clash, not
 *     twenty stacked ones;
 *   - a ceiling on how many voices may start in a single tick.
 *
 * Browsers refuse to start audio until the user has interacted with the page, so
 * the context is created lazily and resumed on the first click or key.
 */

import { musicGain, sfxGain } from "./settings";
import type { FxEvent } from "../sim/world";
import { SUB } from "../sim/types";

export type SoundName = "sword" | "bow" | "boom" | "impact" | "death" | "collapse" | "coin" | "chop" | "build";

/** Shortest gap between two plays of the same sound, in milliseconds. */
const CROWD_MS: Record<SoundName, number> = {
  sword: 55,
  bow: 70,
  boom: 180,
  impact: 60,
  death: 90,
  collapse: 250,
  coin: 120,
  chop: 110,
  build: 300,
};

/** Most voices allowed to start in one tick, whatever the battle is doing. */
const MAX_PER_TICK = 5;

/**
 * The scale the score draws on: D Phrygian, which is a natural minor with a
 * flattened second. That one interval -- D against Eb -- is most of why this
 * sounds wrong in the way it is meant to; the rest is tempo and a lot of space.
 */
const SCALE = [146.83, 155.56, 174.61, 196.0, 220.0, 233.08, 261.63, 293.66];

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last: Partial<Record<SoundName, number>> = {};
  private startedThisTick = 0;
  /** Set once the browser has let us start; until then nothing plays. */
  private ready = false;
  /** Everything the score owns, so it can be torn down in one go. */
  private music: { gain: GainNode; nodes: AudioScheduledSourceNode[]; timer: number; lcg: number } | null = null;

  /**
   * Wire the first user gesture to starting audio. Safe to call more than once;
   * the listeners remove themselves.
   */
  install(target: EventTarget = window): void {
    const kick = () => {
      void this.resume();
      target.removeEventListener("pointerdown", kick);
      target.removeEventListener("keydown", kick);
    };
    target.addEventListener("pointerdown", kick);
    target.addEventListener("keydown", kick);
  }

  async resume(): Promise<void> {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 1;
        this.master.connect(this.ctx.destination);
        this.noise = this.makeNoise(this.ctx);
      }
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.ready = this.ctx.state === "running";
      // The gesture that let us start audio at all is also the cue for the
      // score: it is the first moment in the page's life when it can be heard.
      if (this.ready) this.startMusic();
    } catch {
      // No audio available. Everything else carries on.
      this.ready = false;
    }
  }

  /** Two seconds of white noise, reused by every percussive sound. */
  private makeNoise(ctx: AudioContext): AudioBuffer {
    const n = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // Deterministic: a fixed LCG rather than Math.random, so the texture is the
    // same every session and any tuning is reproducible.
    let seed = 22222;
    for (let i = 0; i < n; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      d[i] = (seed / 0xffffffff) * 2 - 1;
    }
    return buf;
  }

  private burst(dur: number, gain: number, type: BiquadFilterType, freq: number, q: number, sweepTo?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    if (sweepTo !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start();
    src.stop(ctx.currentTime + dur + 0.02);
  }

  private tone(type: OscillatorType, from: number, to: number, dur: number, gain: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /**
   * Play one effect at a given volume, 0..1, already scaled for distance.
   * Silently does nothing when audio is unavailable, muted, or crowded out.
   */
  play(name: SoundName, volume = 1): void {
    if (!this.ready || !this.ctx || !this.master) return;
    const base = sfxGain();
    const vol = base * volume;
    if (vol <= 0.002) return;
    if (this.startedThisTick >= MAX_PER_TICK) return;
    const now = performance.now();
    if (now - (this.last[name] ?? -1e9) < CROWD_MS[name]) return;
    this.last[name] = now;
    this.startedThisTick++;
    this.master.gain.value = vol;

    switch (name) {
      case "sword":
        // Edge on edge: a bright noise scrape with a metallic ring behind it.
        this.burst(0.1, 0.5, "bandpass", 2600, 1.4, 1400);
        this.tone("triangle", 1750, 1180, 0.13, 0.16);
        this.tone("triangle", 2310, 1560, 0.1, 0.09, 0.008);
        break;
      case "bow":
        // Draw and release: a short low thrum, then the shaft's hiss.
        this.tone("sine", 240, 90, 0.09, 0.2);
        this.burst(0.13, 0.22, "highpass", 1800, 0.7, 5200);
        break;
      case "boom":
        // Powder, not string: a hard crack over a long low thump.
        this.burst(0.5, 0.6, "lowpass", 1800, 0.6, 110);
        this.tone("sine", 150, 42, 0.42, 0.34);
        this.tone("sawtooth", 90, 34, 0.3, 0.14, 0.01);
        break;
      case "impact":
        this.tone("sine", 180, 70, 0.1, 0.28);
        this.burst(0.06, 0.3, "lowpass", 900, 0.9);
        break;
      case "death":
        this.tone("sawtooth", 260, 70, 0.3, 0.13);
        this.burst(0.22, 0.2, "lowpass", 1200, 0.8, 260);
        break;
      case "collapse":
        // A building coming down: long, low, and mostly rubble.
        this.burst(0.75, 0.5, "lowpass", 900, 0.6, 90);
        this.tone("sine", 110, 38, 0.5, 0.3);
        break;
      case "coin":
        this.tone("sine", 1180, 1180, 0.07, 0.16);
        this.tone("sine", 1760, 1760, 0.1, 0.13, 0.055);
        break;
      case "chop":
        // A wooden knock: dense low band, gone almost at once.
        this.burst(0.09, 0.45, "bandpass", 320, 3.2, 190);
        this.tone("triangle", 190, 120, 0.09, 0.1);
        break;
      case "build":
        this.tone("sine", 320, 480, 0.16, 0.2);
        this.tone("sine", 480, 640, 0.2, 0.16, 0.11);
        this.burst(0.2, 0.22, "lowpass", 700, 0.7, 200);
        break;
    }
  }


  // ───────────────────────────── the score ─────────────────────────────

  /**
   * Weather, not a soundtrack.
   *
   * Synthesised like everything else here, so it costs no bundle and no licence.
   * Three layers, and the space between them is the point:
   *
   *   - a drone, two detuned oscillators a hair apart, low and filtered almost
   *     to nothing. Two voices at 0.3 Hz apart beat against each other roughly
   *     once every three seconds, which is what makes a held note sound like it
   *     is breathing rather than like a synthesiser left switched on;
   *   - single notes out of a Phrygian scale, struck rarely, with a long attack
   *     so none of them has an edge you can point at;
   *   - and now and then a swell of filtered noise, or a high partial two
   *     octaves up, quiet enough that you are not certain you heard it.
   *
   * Nothing is on a grid. The gaps are randomised, because a pulse you can count
   * stops being unsettling about four bars in.
   */
  startMusic(): void {
    if (!this.ready || !this.ctx || !this.master || this.music) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    // Two seconds to arrive. Music that snaps on announces itself.
    gain.gain.linearRampToValueAtTime(musicGain(), ctx.currentTime + 2);

    const nodes: AudioScheduledSourceNode[] = [];
    const drone = ctx.createBiquadFilter();
    drone.type = "lowpass";
    drone.frequency.value = 210;
    drone.Q.value = 3;
    drone.connect(gain);

    // The bed: root, a hair-sharp root, and the fifth underneath.
    for (const [hz, type, level] of [
      [73.42, "triangle", 0.5],
      [73.72, "triangle", 0.42],
      [48.99, "sine", 0.6],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = level * 0.22;
      o.connect(g).connect(drone);
      o.start();
      nodes.push(o);
    }

    // A very slow sweep on the filter, so the drone opens and closes.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.045;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 90;
    lfo.connect(lfoAmt).connect(drone.frequency);
    lfo.start();
    nodes.push(lfo);

    this.music = { gain, nodes, timer: 0, lcg: 99991, };
    const step = (): void => {
      if (!this.music) return;
      this.voice();
      // Four to eleven seconds. Never the same gap twice running.
      this.music.timer = window.setTimeout(step, 4000 + this.mrand() * 7000);
    };
    this.music.timer = window.setTimeout(step, 2500);
  }

  stopMusic(): void {
    const m = this.music;
    if (!m || !this.ctx) return;
    this.music = null;
    clearTimeout(m.timer);
    const t = this.ctx.currentTime;
    m.gain.gain.cancelScheduledValues(t);
    m.gain.gain.setValueAtTime(m.gain.gain.value, t);
    m.gain.gain.linearRampToValueAtTime(0, t + 1.2);
    for (const n of m.nodes) {
      try {
        n.stop(t + 1.4);
      } catch {
        // Already stopped; nothing to do.
      }
    }
  }

  /** Follow the volume sliders while the score is playing. */
  syncMusic(): void {
    if (!this.music || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.gain.cancelScheduledValues(t);
    this.music.gain.gain.setValueAtTime(this.music.gain.gain.value, t);
    this.music.gain.gain.linearRampToValueAtTime(musicGain(), t + 0.4);
  }

  /** Test hooks: whether audio started, and whether the score is running. */
  get readyForTest(): boolean {
    return this.ready;
  }
  get musicPlayingForTest(): boolean {
    return this.music !== null;
  }

  /** The score's own random source, so it never touches Math.random. */
  private mrand(): number {
    const m = this.music;
    if (!m) return 0.5;
    m.lcg = (m.lcg * 1664525 + 1013904223) >>> 0;
    return m.lcg / 0xffffffff;
  }

  /** One event: a note, a breath, or a high partial. */
  private voice(): void {
    if (!this.ctx || !this.music) return;
    const ctx = this.ctx;
    const r = this.mrand();

    if (r < 0.18) {
      // A breath. Noise swelling through a narrow band and away again.
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 300 + this.mrand() * 900;
      f.Q.value = 6;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      const dur = 4 + this.mrand() * 3;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(this.music.gain);
      src.start(t);
      src.stop(t + dur + 0.1);
      return;
    }

    // A note, low in the scale most of the time.
    const pick = Math.floor(this.mrand() ** 1.7 * SCALE.length);
    const base = SCALE[Math.min(SCALE.length - 1, pick)]!;
    const high = r > 0.86;
    const hz = high ? base * 4 : base;
    const t = ctx.currentTime;
    const dur = high ? 3.5 + this.mrand() * 2 : 5 + this.mrand() * 4;
    const peak = high ? 0.035 : 0.075;

    const o = ctx.createOscillator();
    o.type = high ? "sine" : "triangle";
    o.frequency.value = hz;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = high ? 3000 : 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    // Slow in, slower out: no attack for the ear to latch on to.
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.music.gain);
    o.start(t);
    o.stop(t + dur + 0.1);

    // Every so often the note is joined a semitone up and left to grind
    // against it. This is the sound doing the actual work.
    if (!high && this.mrand() < 0.3) {
      const o2 = ctx.createOscillator();
      o2.type = "triangle";
      o2.frequency.value = hz * 1.0595;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t + 0.6);
      g2.gain.exponentialRampToValueAtTime(peak * 0.55, t + dur * 0.5);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o2.connect(f).connect(g2).connect(this.music.gain);
      o2.start(t + 0.6);
      o2.stop(t + dur + 0.1);
    }
  }

  /**
   * Turn one tick's sim events into sound.
   *
   * `view` is the camera's world-space centre and half-extent; anything more than
   * a screen and a half away is dropped outright, and what remains fades with
   * distance so an off-screen skirmish sits behind the one in front of you.
   */
  fromEvents(events: readonly FxEvent[], view: { x: number; y: number; r: number }): void {
    this.startedThisTick = 0;
    if (!this.ready) return;
    for (const e of events) {
      const at = "x" in e ? e : null;
      if (!at) continue;
      const d = Math.hypot(at.x - view.x, at.y - view.y) / Math.max(SUB, view.r);
      if (d > 1.5) continue;
      const vol = Math.max(0, 1 - d / 1.5) ** 1.6;
      switch (e.kind) {
        case "attack":
          this.play(e.def === "cannon" ? "boom" : e.ranged ? "bow" : "sword", vol);
          break;
        case "hit":
          if (e.building) this.play("impact", vol * 0.8);
          break;
        case "death":
          this.play(e.building ? "collapse" : "death", vol);
          break;
        case "built":
          this.play("build", vol);
          break;
        case "deposit":
          this.play("coin", vol * (e.resource === "gold" ? 1 : 0.7));
          break;
        case "chop":
          this.play("chop", vol * 0.8);
          break;
      }
    }
  }
}
