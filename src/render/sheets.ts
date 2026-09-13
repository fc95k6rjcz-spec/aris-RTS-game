/**
 * The cut animation frames, registered.
 *
 * One import per frame, because the bundler needs to see each one to hash it
 * and copy it out. The lists are short on purpose: only frames that came out of
 * tools/extract_frames.mjs cleanly are here.
 *
 * Three of the twelve movement frames on the worker sheet did not: they sit on
 * a backdrop a shade warmer than the rest of the band -- the ones carrying the
 * section label -- and the key left the whole rectangle behind. Rather than
 * ship a man with a grey box round him, they are simply absent, and a four
 * frame walk is a three frame walk. Nobody will count them.
 *
 * Everything the worker does with his hands -- chopping, mining, hammering,
 * hauling -- is still the painted sprite, and deliberately so: those frames are
 * painted into a scene, with the tree or the rock pile or the fence as part of
 * the picture, and cutting a man out of them reliably is a different and much
 * harder problem than cutting him off a flat ground. The existing woodcutter
 * and cartpusher are mid-action and read well; replacing them with a man
 * standing still would be a step backwards.
 */

import { registerSheet } from "./anim";

import idle0 from "../assets/anim/worker_idle_0.png";
import idle1 from "../assets/anim/worker_idle_1.png";
import idle2 from "../assets/anim/worker_idle_2.png";
import idle3 from "../assets/anim/worker_idle_3.png";
import idle4 from "../assets/anim/worker_idle_4.png";
import walk1 from "../assets/anim/worker_walk_1.png";
import walk2 from "../assets/anim/worker_walk_2.png";
import walk3 from "../assets/anim/worker_walk_3.png";
import run1 from "../assets/anim/worker_run_1.png";

export function registerSheets(): void {
  registerSheet("human", "worker", {
    // A shade taller than the painted peasant's 1.35, because these frames are
    // cropped to the figure rather than to a padded cell.
    height: 1.4,
    clips: {
      // Slow: it is a man shifting his weight and scratching his head, not a
      // cycle. Four a second is already faster than the drawing suggests.
      idle: { srcs: [idle0, idle1, idle2, idle3, idle4], fps: 3, loop: true },
      walk: { srcs: [walk1, walk2, walk3], fps: 7, loop: true },
      run: { srcs: [run1], fps: 10, loop: true },
    },
  });
}
