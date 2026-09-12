/**
 * The settings panel, and the gear that opens it.
 *
 * This is the one part of the interface built from DOM rather than painted into
 * the canvas. Everything else is drawn because it sits in the game world or has
 * to line up with it; a settings dialog is a form, and sliders, checkboxes and
 * focus rings are things the browser already does properly. Building it on the
 * canvas would mean hand-rolling hit testing and keyboard focus for no gain.
 */

import { resetSettings, setSetting, settings, type Settings } from "../game/settings";
import { KIND_BLURB, MAPS, MAP_BY_ID } from "../data/maps";

export interface SettingsPanel {
  toggle(): void;
  close(): void;
  readonly open: boolean;
}

const CSS = `
.rts-gear {
  position: fixed; top: 6px; right: 12px; z-index: 30;
  width: 30px; height: 30px; padding: 0;
  border: 1px solid #4a5568; border-radius: 6px;
  background: rgba(12,16,22,0.85); color: #cbd5e0;
  font: 16px/1 system-ui, sans-serif; cursor: pointer;
}
.rts-gear:hover { background: rgba(30,40,52,0.95); color: #fff; }
.rts-scrim {
  position: fixed; inset: 0; z-index: 40;
  background: rgba(4,6,9,0.68);
  display: flex; align-items: center; justify-content: center;
}
/* display:flex outranks the [hidden] attribute, so a hidden scrim would stay
   laid out and swallow every click on the game behind it. */
.rts-scrim[hidden] { display: none; }
.rts-panel {
  width: min(440px, calc(100vw - 32px));
  max-height: calc(100vh - 48px); overflow-y: auto;
  background: #12161d; color: #e2e8f0;
  border: 1px solid #2d3748; border-radius: 10px;
  box-shadow: 0 18px 50px rgba(0,0,0,0.6);
  font: 13px/1.45 system-ui, sans-serif;
  padding: 18px 20px 14px;
}
.rts-panel h2 { margin: 0 0 2px; font-size: 17px; letter-spacing: 0.02em; }
.rts-panel .rts-hint { margin: 0 0 16px; color: #94a3b8; font-size: 12px; }
.rts-group { margin: 0 0 6px; padding: 10px 0 4px; border-top: 1px solid #232a34; }
.rts-group:first-of-type { border-top: 0; padding-top: 0; }
.rts-group > h3 {
  margin: 0 0 8px; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.09em; color: #7f8ea3; font-weight: 600;
}
.rts-row { display: flex; align-items: center; gap: 12px; padding: 5px 0; }
.rts-row > label { flex: 1; }
.rts-row .rts-val { width: 42px; text-align: right; color: #94a3b8; font-variant-numeric: tabular-nums; }
.rts-row input[type=range] { width: 150px; accent-color: #4c7fd6; }
.rts-row select {
  background: #1b212b; color: #e2e8f0; border: 1px solid #2d3748;
  border-radius: 5px; padding: 3px 6px; font: inherit;
}
.rts-row input[type=checkbox] { width: 15px; height: 15px; accent-color: #4c7fd6; }
.rts-note { color: #7f8ea3; font-size: 11.5px; margin: 2px 0 0; }
.rts-foot { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
.rts-foot button {
  border: 1px solid #2d3748; border-radius: 6px; padding: 6px 14px;
  background: #1b212b; color: #e2e8f0; font: inherit; cursor: pointer;
}
.rts-foot button:hover { background: #253040; }
.rts-foot button.rts-primary { background: #3b62a8; border-color: #4c7fd6; }
.rts-foot button.rts-primary:hover { background: #4c7fd6; }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/**
 * Build the panel and wire it to `settings`.
 *
 * `onChange` fires after any edit; the game uses it to keep the canvas in step
 * while the panel is open, so a slider shows its effect as it is dragged.
 */
export function createSettingsPanel(onChange: (s: Settings) => void = () => {}): SettingsPanel {
  const style = el("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const gear = el("button", "rts-gear", "⚙");
  gear.title = "Settings";
  gear.setAttribute("aria-label", "Settings");
  document.body.appendChild(gear);

  const scrim = el("div", "rts-scrim");
  scrim.hidden = true;
  const panel = el("div", "rts-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  scrim.appendChild(panel);
  document.body.appendChild(scrim);

  panel.appendChild(el("h2", undefined, "Settings"));
  panel.appendChild(el("p", "rts-hint", "The game is paused while this is open."));

  const group = (title: string): HTMLDivElement => {
    const g = el("div", "rts-group");
    g.appendChild(el("h3", undefined, title));
    panel.appendChild(g);
    return g;
  };

  const row = (parent: HTMLElement, label: string): HTMLDivElement => {
    const r = el("div", "rts-row");
    r.appendChild(el("label", undefined, label));
    parent.appendChild(r);
    return r;
  };

  /** A 0..1-ish slider shown as a percentage or a multiplier. */
  const slider = (
    parent: HTMLElement,
    label: string,
    key: "volume" | "sfxVolume" | "gameSpeed" | "scrollSpeed",
    min: number,
    max: number,
    step: number,
    fmt: (v: number) => string,
  ): (() => void) => {
    const r = row(parent, label);
    const input = el("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const val = el("span", "rts-val");
    r.appendChild(input);
    r.appendChild(val);
    const sync = () => {
      input.value = String(settings[key]);
      val.textContent = fmt(settings[key]);
    };
    input.addEventListener("input", () => {
      setSetting(key, Number(input.value));
      val.textContent = fmt(settings[key]);
      onChange(settings);
    });
    sync();
    return sync;
  };

  const check = (parent: HTMLElement, label: string, key: "muted" | "animations" | "edgeScroll" | "damageNumbers" | "nomad" | "stockade" | "crowning" | "wildlife", note?: string): (() => void) => {
    const r = row(parent, label);
    const input = el("input");
    input.type = "checkbox";
    r.appendChild(input);
    if (note) parent.appendChild(el("p", "rts-note", note));
    const sync = () => (input.checked = settings[key]);
    input.addEventListener("change", () => {
      setSetting(key, input.checked);
      onChange(settings);
    });
    sync();
    return sync;
  };

  const syncs: Array<() => void> = [];

  const audio = group("Audio");
  syncs.push(check(audio, "Mute", "muted"));
  syncs.push(slider(audio, "Master volume", "volume", 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`));
  syncs.push(slider(audio, "Effects", "sfxVolume", 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`));
  audio.appendChild(el("p", "rts-note", "Sound starts on your first click. Off-screen fighting is quieter than what is in front of you."));

  const gfx = group("Display");
  syncs.push(check(gfx, "Unit animation", "animations", "Bob, lean and idle motion. Turn off for a steadier picture on a slow machine."));
  {
    const r = row(gfx, "Health bars");
    const sel = el("select");
    for (const [v, t] of [["always", "Always"], ["damaged", "When damaged"], ["never", "Never"]] as const) {
      const o = el("option", undefined, t);
      o.value = v;
      sel.appendChild(o);
    }
    r.appendChild(sel);
    const sync = () => (sel.value = settings.healthBars);
    sel.addEventListener("change", () => {
      setSetting("healthBars", sel.value as Settings["healthBars"]);
      onChange(settings);
    });
    sync();
    syncs.push(sync);
  }

  syncs.push(check(gfx, "Damage numbers", "damageNumbers", "Every blow rolls a different amount; this shows what landed."));

  const ctrl = group("Controls");
  syncs.push(check(ctrl, "Edge scrolling", "edgeScroll"));
  syncs.push(slider(ctrl, "Scroll speed", "scrollSpeed", 0.4, 2.5, 0.1, (v) => `${v.toFixed(1)}x`));

  const play = group("Game");
  {
    const r = row(play, "Map");
    const sel = el("select");
    sel.style.maxWidth = "230px";
    const rand = el("option", undefined, "Random — a new one each match");
    rand.value = "random";
    sel.appendChild(rand);
    // Grouped by layout: a hundred names in one flat list is a wall, and the
    // layout is what actually changes how a map plays.
    const byKind = new Map<string, HTMLOptGroupElement>();
    for (const m of MAPS) {
      let g = byKind.get(m.kind);
      if (!g) {
        g = document.createElement("optgroup");
        g.label = m.kind[0]!.toUpperCase() + m.kind.slice(1);
        sel.appendChild(g);
        byKind.set(m.kind, g);
      }
      const o = el("option", undefined, m.name);
      o.value = m.id;
      g.appendChild(o);
    }
    r.appendChild(sel);
    const blurb = el("p", "rts-note");
    play.appendChild(blurb);
    const describe = () => {
      const m = MAP_BY_ID.get(settings.mapId);
      blurb.textContent = m
        ? `${KIND_BLURB[m.kind]} ${Math.round(m.open * 100)}% open ground.`
        : `${MAPS.length} maps, every one checked for a land route between the starts, timber, gold and a shoreline.`;
    };
    const sync = () => {
      sel.value = MAP_BY_ID.has(settings.mapId) ? settings.mapId : "random";
      describe();
    };
    sel.addEventListener("change", () => {
      setSetting("mapId", sel.value);
      describe();
      onChange(settings);
    });
    sync();
    syncs.push(sync);
  }
  syncs.push(slider(play, "Game speed", "gameSpeed", 0.5, 3, 0.25, (v) => `${v.toFixed(2)}x`));
  {
    const r = row(play, "Opponent");
    const sel = el("select");
    for (const [v, t] of [
      ["easy", "Easy"],
      ["normal", "Normal"],
      ["hard", "Hard"],
      ["peaceful", "Peaceful — builds, never attacks"],
      ["none", "Sandbox — they never act"],
    ] as const) {
      const o = el("option", undefined, t);
      o.value = v;
      sel.appendChild(o);
    }
    r.appendChild(sel);
    const sync = () => (sel.value = settings.difficulty);
    sel.addEventListener("change", () => {
      setSetting("difficulty", sel.value as Settings["difficulty"]);
      onChange(settings);
    });
    sync();
    syncs.push(sync);
  {
    const r = row(play, "Length");
    const sel = el("select");
    for (const [v, t] of [
      ["1", "Skirmish — about 20 minutes"],
      ["2", "Long — about an hour"],
      ["4", "Campaign — a few hours"],
      ["8", "Epic — an afternoon"],
    ] as const) {
      const o = el("option", undefined, t);
      o.value = v;
      sel.appendChild(o);
    }
    r.appendChild(sel);
    const sync = () => (sel.value = String(settings.pace));
    sel.addEventListener("change", () => {
      setSetting("pace", Number(sel.value));
      onChange(settings);
    });
    sync();
    syncs.push(sync);
    play.appendChild(
      el(
        "p",
        "rts-note",
        "Stretches training, building, research and gathering alike. Armies stay small for longer, and losing one costs an hour rather than a minute.",
      ),
    );
  }

    syncs.push(
      check(play, "Nomad start", "nomad", "Begin as your King alone, and put your Town Hall where you like."),
      check(play, "The King is not born a King", "crowning", "Start as one peasant. Find your clan's weapon out in the dark and he is crowned; until then you cannot found a hall."),
      check(play, "Bears in the woods", "wildlife", "Wild country between you and everywhere else. A bear will kill a lone man, and pays sixty gold in hide."),
      check(play, "Walled in by forest", "stockade", "Every base starts ringed by woodland. Nothing gets in or out until you cut a gate."),
    );
    play.appendChild(el("p", "rts-note", "Map, opponent and start all apply to the next game you start, not this one."));
  }

  const foot = el("div", "rts-foot");
  const reset = el("button", undefined, "Reset to defaults");
  const done = el("button", "rts-primary", "Done");
  foot.appendChild(reset);
  foot.appendChild(done);
  panel.appendChild(foot);

  let open = false;
  const api: SettingsPanel = {
    get open() {
      return open;
    },
    toggle() {
      open = !open;
      scrim.hidden = !open;
      if (open) {
        for (const s of syncs) s();
        done.focus();
      }
      onChange(settings);
    },
    close() {
      if (!open) return;
      open = false;
      scrim.hidden = true;
      onChange(settings);
    },
  };

  gear.addEventListener("click", () => api.toggle());
  done.addEventListener("click", () => api.close());
  reset.addEventListener("click", () => {
    resetSettings();
    for (const s of syncs) s();
    onChange(settings);
  });
  // Clicking the backdrop closes; clicking inside the panel must not.
  scrim.addEventListener("mousedown", (e) => {
    if (e.target === scrim) api.close();
  });
  // Escape closes the panel before the game sees it.
  window.addEventListener(
    "keydown",
    (e) => {
      if (open && e.key === "Escape") {
        e.stopPropagation();
        api.close();
      }
    },
    true,
  );

  return api;
}
