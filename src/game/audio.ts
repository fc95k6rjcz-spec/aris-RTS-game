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

export type SoundName =
  | "sword"
  | "bow"
  | "boom"
  | "impact"
  | "death"
  | "collapse"
  | "coin"
  | "chop"
  | "build"
  | "workstart"
  /** A wolf, at length. */
  | "howl"
  /** A bear, briefly, and close enough to be a problem. */
  | "growl"
  | "moo"
  | "bleat"
  /** A deer's alarm bark: the sound of one noticing you first. */
  | "snort";

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
  workstart: 400,
  // Animals are ambience, and ambience that stacks is a farmyard. A pack of six
  // wolves rolling a howl in the same second should be heard as one wolf
  // answered by another, not as six.
  howl: 1400,
  growl: 900,
  moo: 1100,
  bleat: 700,
  snort: 800,
};

/** Which noise each animal makes. */
const CALL_OF: Record<string, SoundName> = {
  wolf: "howl",
  bear: "growl",
  cow: "moo",
  sheep: "bleat",
  deer: "snort",
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
  private music: { gain: GainNode; wet: GainNode; nodes: AudioScheduledSourceNode[]; timer: number; lcg: number } | null = null;

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

  /**
   * `delay` lets a caller place two strikes apart rather than on top of each
   * other; `dest` lets one escape the master gain -- see `callBus`.
   */
  private burst(dur: number, gain: number, type: BiquadFilterType, freq: number, q: number, sweepTo?: number, delay = 0, dest?: AudioNode): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    if (sweepTo !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(dest ?? this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private tone(type: OscillatorType, from: number, to: number, dur: number, gain: number, delay = 0, dest?: AudioNode): void {
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
    o.connect(g).connect(dest ?? this.master!);
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
      case "workstart":
        // Ground broken. A horn note to call them over, then two mallet strikes
        // on a peg -- the sound of a site being set out rather than finished.
        // Deliberately unlike "build": that one is a thing completed and rings
        // upward; this one is flatter and ends on the wood.
        this.tone("triangle", 196, 262, 0.42, 0.16);
        this.tone("triangle", 147, 196, 0.42, 0.12, 0.02);
        this.burst(0.1, 0.3, "bandpass", 900, 1.4, 380);
        this.burst(0.1, 0.26, "bandpass", 820, 1.4, 340, 0.17);
        break;
      case "build":
        this.tone("sine", 320, 480, 0.16, 0.2);
        this.tone("sine", 480, 640, 0.2, 0.16, 0.11);
        this.burst(0.2, 0.22, "lowpass", 700, 0.7, 200);
        break;

      // ── animals ──
      //
      // Every one of these is the same two ingredients as a sword stroke: a
      // pitched oscillator and a band of filtered noise. What makes an animal
      // rather than an instrument is the ENVELOPE. A howl is defined by taking
      // most of a second to arrive and twice that to leave; a bark is defined
      // by doing neither. Get the shape right and a sawtooth is a wolf.
      case "howl": {
        // Up onto the note, hold, and a long fall off the back of it. Two
        // voices a few cents apart, which is what stops it sounding like a
        // theremin -- a real howl is never quite one pitch.
        const bus = this.callBus(vol);
        this.cry(bus, "sawtooth", [300, 470, 500, 380], 2.0, 0.11, 900, 1.6);
        this.cry(bus, "sawtooth", [296, 462, 494, 372], 2.1, 0.07, 780, 1.5, 0.09);
        // A breath under it.
        this.burst(1.4, 0.05, "bandpass", 620, 0.9, 380, 0.18, bus);
        break;
      }
      case "growl": {
        // Low, and modulated hard enough to be heard as a rasp rather than a
        // note: that amplitude wobble is the whole character of the sound.
        const bus = this.callBus(vol);
        this.rasp(bus, 62, 0.75, 0.3, 24);
        this.burst(0.62, 0.16, "lowpass", 420, 0.8, 180, 0, bus);
        break;
      }
      case "moo": {
        // Two-part, the way a cow actually does it: a short push, then the
        // long fall. One continuous glide sounds like a foghorn.
        const bus = this.callBus(vol);
        this.cry(bus, "sawtooth", [168, 196, 188], 0.34, 0.13, 700, 1.2);
        this.cry(bus, "sawtooth", [190, 150, 122], 0.85, 0.14, 620, 1.1, 0.3);
        this.burst(0.5, 0.06, "lowpass", 700, 0.7, 260, 0.3, bus);
        break;
      }
      case "bleat": {
        // A sheep is a cow an octave up with a fast tremolo on it. The tremolo
        // is not a flourish -- without it this is a kazoo.
        const bus = this.callBus(vol);
        this.rasp(bus, 430, 0.42, 0.1, 17, "square", 1500);
        this.burst(0.2, 0.06, "bandpass", 1700, 1.1, 900, 0.04, bus);
        break;
      }
      case "snort": {
        // A chuff of air with almost no pitch in it, and gone at once.
        const bus = this.callBus(vol);
        this.burst(0.12, 0.3, "bandpass", 780, 1.0, 320, 0, bus);
        this.tone("triangle", 220, 130, 0.1, 0.07, 0, bus);
        break;
      }
    }
  }

  /**
   * A private output at a fixed volume, for a sound that lasts.
   *
   * Everything else here leans on a shortcut: `play` writes the volume it wants
   * straight onto the master gain and the effect rides it. That is fine for a
   * sword, which is over in a tenth of a second, and wrong for a two-second
   * howl -- the next sword swung anywhere on the map would rewrite the master
   * gain underneath it and the wolf would jump in volume mid-breath. Anything
   * long enough to overlap something else gets its own node instead.
   */
  private callBus(vol: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = vol;
    g.connect(this.ctx!.destination);
    return g;
  }

  /**
   * A pitched call that moves through a set of frequencies.
   *
   * `pts` are joined with exponential ramps spread evenly over `dur`, and the
   * envelope opens over the first third and closes across the rest -- slow in,
   * slower out, which is what a called note does and a struck one does not.
   */
  private cry(dest: AudioNode, type: OscillatorType, pts: number[], dur: number, gain: number, cut: number, q: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(pts[0]!, t);
    for (let i = 1; i < pts.length; i++) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, pts[i]!), t + (dur * i) / (pts.length - 1));
    }
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cut;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.32);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(f).connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /**
   * A note with its amplitude chewed up by a fast low-frequency oscillator.
   *
   * A growl and a bleat are the same trick at two ends of the register: a
   * steady tone is an instrument, and the same tone with 20 Hz of tremolo on it
   * is an animal.
   */
  private rasp(dest: AudioNode, hz: number, dur: number, gain: number, wobble: number, type: OscillatorType = "sawtooth", cut = 700): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(hz, t);
    o.frequency.exponentialRampToValueAtTime(hz * 0.82, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cut;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.18);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    // The wobble rides on the same gain node, so it cannot drift out of the
    // envelope's way.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = wobble;
    const amt = ctx.createGain();
    amt.gain.value = gain * 0.55;
    lfo.connect(amt).connect(g.gain);
    o.connect(f).connect(g).connect(dest);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }


  // ───────────────────────────── the score ─────────────────────────────

  /**
   * Weather, not a soundtrack.
   *
   * The first attempt at this sounded wrong, and it is worth writing down why,
   * because every one of the mistakes is the obvious thing to do:
   *
   *   - it used triangle waves for the drone. A triangle at 73 Hz has a stack
   *     of audible harmonics, and two of them tuned a third of a hertz apart
   *     beat against each other on every one of those harmonics at once. That
   *     is not a held breath, it is a wasps' nest. Sines now: one partial each,
   *     so the beating happens once, slowly, where you can hear it as movement
   *     rather than as buzz;
   *   - it leaned on minor seconds. A semitone held against its root is the
   *     textbook "unsettling" interval and it is also, at this volume and this
   *     duration, just sour. The notes now sit a fifth or a minor third apart,
   *     which is dark without being sore, and the semitone survives only as a
   *     rare, very quiet shadow under a note that is already fading;
   *   - it had no space. Every voice went straight to the output, so each note
   *     stopped dead the moment its envelope closed and the whole thing sounded
   *     like what it is, which is an oscillator in a browser. There is now a
   *     delay line with a damped feedback path -- a cheap reverb tail -- and
   *     everything goes through it. That one change does most of the work of
   *     making this sound like a room rather than a signal generator;
   *   - and the noise layer was a bandpass, which is a hiss with a whistle in
   *     it. It is a lowpass now, and quieter: wind under a door, not static.
   *
   * What is kept is the shape. A drone, notes struck rarely with a long attack
   * so none of them has an edge, and nothing on a grid -- a pulse you can count
   * stops being unsettling about four bars in.
   */
  startMusic(): void {
    if (!this.ready || !this.ctx || !this.master || this.music) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    gain.gain.linearRampToValueAtTime(musicGain(), ctx.currentTime + 3);

    // The room. Everything voiced below is fed into this as well as to the dry
    // output, so notes leave a tail behind them instead of stopping dead.
    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    const delay = ctx.createDelay(3);
    delay.delayTime.value = 0.62;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.55;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 1400;
    // Each pass round the loop loses its top end, the way a real room does.
    wet.connect(delay).connect(damp).connect(feedback).connect(delay);
    damp.connect(gain);

    const nodes: AudioScheduledSourceNode[] = [];
    const droneOut = ctx.createBiquadFilter();
    droneOut.type = "lowpass";
    droneOut.frequency.value = 240;
    droneOut.Q.value = 0.9;
    droneOut.connect(gain);

    // Sines only. Root, root a third of a hertz sharp, and the fifth below.
    for (const [hz, level] of [
      [73.42, 0.5],
      [73.75, 0.44],
      [48.99, 0.42],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = level * 0.3;
      o.connect(g).connect(droneOut);
      o.start();
      nodes.push(o);
    }

    // A very slow open and close on the drone's filter.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.035;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 70;
    lfo.connect(lfoAmt).connect(droneOut.frequency);
    lfo.start();
    nodes.push(lfo);

    this.music = { gain, wet, nodes, timer: 0, lcg: 99991 };
    const step = (): void => {
      if (!this.music) return;
      this.voice();
      this.music.timer = window.setTimeout(step, 5000 + this.mrand() * 8000);
    };
    this.music.timer = window.setTimeout(step, 3000);
  }

  stopMusic(): void {
    const m = this.music;
    if (!m || !this.ctx) return;
    this.music = null;
    clearTimeout(m.timer);
    const t = this.ctx.currentTime;
    m.gain.gain.cancelScheduledValues(t);
    m.gain.gain.setValueAtTime(m.gain.gain.value, t);
    m.gain.gain.linearRampToValueAtTime(0, t + 1.5);
    for (const n of m.nodes) {
      try {
        n.stop(t + 1.7);
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

  /** The score's own random source, so it never touches Math.random. */
  private mrand(): number {
    const m = this.music;
    if (!m) return 0.5;
    m.lcg = (m.lcg * 1664525 + 1013904223) >>> 0;
    return m.lcg / 0xffffffff;
  }

  /** Send a voice to both the dry output and the room. */
  private out(node: AudioNode): void {
    if (!this.music) return;
    node.connect(this.music.gain);
    node.connect(this.music.wet);
  }

  /** One event: a note, or -- rarely -- a breath of wind. */
  private voice(): void {
    if (!this.ctx || !this.music) return;
    const ctx = this.ctx;
    const r = this.mrand();

    if (r < 0.14) {
      // Wind under a door. Lowpassed, not bandpassed: no whistle.
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 220 + this.mrand() * 260;
      f.Q.value = 0.7;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      const dur = 6 + this.mrand() * 4;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03, t + dur * 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g);
      this.out(g);
      src.start(t);
      src.stop(t + dur + 0.1);
      return;
    }

    // A note, low in the scale most of the time.
    const pick = Math.floor(this.mrand() ** 1.7 * SCALE.length);
    const base = SCALE[Math.min(SCALE.length - 1, pick)]!;
    const high = r > 0.88;
    const hz = high ? base * 4 : base * 2;
    const t = ctx.currentTime;
    const dur = high ? 4 + this.mrand() * 2 : 6 + this.mrand() * 4;
    const peak = high ? 0.03 : 0.06;

    // Two sines a whisker apart rather than one: the same trick as the drone,
    // and the reason a single held note sounds alive instead of flat.
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = high ? 2600 : 900;
    f.connect(g);
    this.out(g);
    for (const cents of [0, 4]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = hz * Math.pow(2, cents / 1200);
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.1);
    }

    // A companion, a fifth or a minor third below. Dark, and not sour.
    if (!high && this.mrand() < 0.42) {
      const ratio = this.mrand() < 0.5 ? 2 / 3 : 5 / 6;
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = hz * ratio;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t + 1.2);
      g2.gain.exponentialRampToValueAtTime(peak * 0.5, t + dur * 0.55);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o2.connect(g2);
      this.out(g2);
      o2.start(t + 1.2);
      o2.stop(t + dur + 0.1);
    }
  }

  // ───────────────────────────── weather ─────────────────────────────

  /**
   * Rain, as a sound.
   *
   * Filtered noise, like every percussive effect here, but held open instead of
   * struck: a lowpass for the body of it and a gentle highpass to take out the
   * rumble that would otherwise fight the score's drone. The cutoff opens as it
   * comes down harder, which is most of the difference between drizzle and a
   * downpour -- loudness alone just sounds like the same drizzle turned up.
   *
   * One voice for the whole match, started once and left running at zero gain,
   * because starting and stopping a noise source is audible and weather should
   * arrive rather than switch on.
   */
  private rain: { gain: GainNode; filter: BiquadFilterNode; src: AudioBufferSourceNode } | null = null;

  /** Follow the simulation's rainfall, 0 to 1. Called every frame; cheap. */
  setRain(amount: number): void {
    if (!this.ready || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    if (!this.rain) {
      if (amount <= 0) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 420;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1800;
      filter.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(hp).connect(filter).connect(gain).connect(this.master);
      src.start();
      this.rain = { gain, filter, src };
    }
    const r = this.rain;
    const t = ctx.currentTime;
    const want = sfxGain() * amount * 0.5;
    // Ramped, not set: at sixty frames a second a direct write on a parameter
    // that is also being read is a recipe for zipper noise.
    r.gain.gain.setTargetAtTime(want, t, 0.4);
    r.filter.frequency.setTargetAtTime(1300 + amount * 2600, t, 0.6);
  }

  /**
   * A fire, as a sound.
   *
   * The same construction as the rain: one noise source started once and left
   * running at zero gain, opened and closed by a filter. A fire differs from
   * rain in one way that matters, which is that it is not a steady hiss -- it
   * pops. So there is a second layer of short bursts fired off at irregular
   * intervals on top of the bed, and that is entirely what makes it read as
   * burning wood rather than as more weather.
   *
   * Driven from how much fire is near the camera, not from whether any exists:
   * a camp on the far side of the map should be silent, exactly like a battle
   * there is.
   */
  private fire: { gain: GainNode; filter: BiquadFilterNode; src: AudioBufferSourceNode; nextPop: number; lcg: number } | null = null;

  /** Follow how much fire is close by, 0 to 1. Called every frame; cheap. */
  setFire(amount: number): void {
    if (!this.ready || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    if (!this.fire) {
      if (amount <= 0) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      // Narrow and low: the body of a fire is a rush of air, and everything
      // above about a kilohertz in white noise is a hiss that sounds like a
      // broken speaker rather than like heat.
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 180;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      filter.Q.value = 0.5;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(hp).connect(filter).connect(gain).connect(ctx.destination);
      src.start();
      this.fire = { gain, filter, src, nextPop: 0, lcg: 7717 };
    }
    const f = this.fire;
    const t = ctx.currentTime;
    // Quieter than the rain at full tilt: a fire is something you notice, not
    // something you listen to.
    f.gain.gain.setTargetAtTime(sfxGain() * amount * 0.3, t, 0.5);
    f.filter.frequency.setTargetAtTime(700 + amount * 500, t, 0.6);

    // Crackle. Scheduled off the wall clock rather than the sim tick because
    // nothing about it is shared -- it is the one part of the soundscape that
    // is genuinely just decoration on this machine.
    if (amount <= 0.05) return;
    const now = performance.now();
    if (now < f.nextPop) return;
    f.lcg = (f.lcg * 1664525 + 1013904223) >>> 0;
    const r = f.lcg / 0xffffffff;
    f.nextPop = now + 90 + r * 520 / Math.max(0.2, amount);
    const bus = ctx.createGain();
    bus.gain.value = sfxGain() * amount * (0.1 + r * 0.22);
    bus.connect(ctx.destination);
    this.burst(0.02 + r * 0.05, 0.5, "bandpass", 700 + r * 2200, 2.2, 300, 0, bus);
  }

  /** Test hooks: whether audio started, and whether the score is running. */
  get readyForTest(): boolean {
    return this.ready;
  }
  get musicPlayingForTest(): boolean {
    return this.music !== null;
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
      // An animal carries further than a sword does. Two and a half screens for
      // a howl against one and a half for everything else, and the falloff is
      // gentler, so the wood off the edge of the view sounds occupied.
      const reach = e.kind === "call" ? 2.6 : 1.5;
      if (d > reach) continue;
      const vol = Math.max(0, 1 - d / reach) ** 1.6;
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
        case "buildStart":
          this.play("workstart", vol);
          break;
        case "deposit":
          this.play("coin", vol * (e.resource === "gold" ? 1 : 0.7));
          break;
        case "chop":
          this.play("chop", vol * 0.8);
          break;
        case "call":
          // Louder than its distance would suggest, and deliberately. A call is
          // the one sound in the game whose whole job is to come from somewhere
          // you cannot see; attenuated like a sword stroke it would be silent
          // exactly when it mattered.
          this.play(CALL_OF[e.def] ?? "snort", Math.min(1, vol * 1.6));
          break;
      }
    }
  }
}
