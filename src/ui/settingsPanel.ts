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
import royalHall from '../assets/royal/hall-10.webp';

export interface SettingsPanel {
  toggle(): void;
  close(): void;
  readonly open: boolean;
}

const CSS = `
.rts-gear{position:fixed;top:6px;right:12px;z-index:30;width:32px;height:32px;border:1px solid #967744;border-radius:6px;background:#12201e;color:#e7cc91;cursor:pointer}
.rts-scrim{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:#030909cc;backdrop-filter:blur(10px)}
.rts-scrim[hidden],.rts-group[hidden]{display:none}
.rts-panel{width:min(880px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #9e8050;border-radius:12px;background:radial-gradient(ellipse at top left,#233b34,transparent 65%),#101917;color:#ece9db;box-shadow:0 30px 100px #000c,0 0 0 5px #a7894720,inset 0 0 0 1px #dfc68e14;font:14px/1.5 system-ui,sans-serif}
.rts-settings-hero{position:relative;isolation:isolate;flex:none;padding:30px 34px 24px;min-height:125px;overflow:hidden;background:linear-gradient(110deg,#203a32,#122520);border-bottom:1px solid #b9944b55}
.rts-settings-hero::after{content:'';position:absolute;z-index:-1;inset:-40px -20px -70px 44%;background:linear-gradient(90deg,#1a3029,transparent 60%),url('${royalHall}') right 48%/auto 310px no-repeat;opacity:.75;filter:drop-shadow(0 0 22px #dab77322)}
.rts-kicker{margin:0 0 12px;color:#d5b977;font:10px/1.4 system-ui,sans-serif;letter-spacing:.25em;font-weight:700}
.rts-panel h2{margin:0;color:#f3e6c6;font:42px/1.12 Georgia,serif;letter-spacing:-.02em;text-shadow:0 2px 20px #0008}
.rts-panel .rts-hint{margin:13px 0 0;color:#b3c5b8;font-size:12px;max-width:65%}
.rts-hint::before{content:'Ⅱ';display:inline-grid;place-items:center;width:20px;height:20px;margin-right:8px;border:1px solid #ac995455;border-radius:50%;color:#d7be80;font-size:9px}
.rts-navigation{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:16px 26px;background:#0c1614}
.rts-navigation button{display:flex;align-items:center;justify-content:center;gap:10px;padding:13px 8px;border:1px solid transparent;border-radius:6px;background:transparent;color:#aab8ac;font:14px Georgia,serif;cursor:pointer;transition:background .15s,color .15s}
.rts-navigation button:hover{background:#24352c;color:#f6e3b3}
.rts-navigation button[aria-pressed=true]{color:#ffe4a6;background:linear-gradient(135deg,#4b462b,#2a3326);border-color:#9c8247;box-shadow:inset 0 1px #e0c47e33,0 3px 9px #0004}
.rts-category-symbol{font:22px/1 Georgia,serif;color:#c7ae73}
.rts-settings-body{overflow-y:auto;min-height:0;height:min(410px,48vh);padding:22px 34px 28px;scrollbar-width:thin;scrollbar-color:#6e7956 #101917}
.rts-group{margin:0;padding:0;border:0}
.rts-group>h3{margin:0 0 4px;color:#f0dfb7;font:24px/1.3 Georgia,serif}
.rts-category-intro{margin:0 0 21px;color:#97ac9e;font-size:12px}
.rts-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:15px 18px;margin:0 0 9px;border:1px solid #58664766;border-radius:7px;background:linear-gradient(115deg,#25382d66,#14211c88);transition:border-color .15s}
.rts-row:hover{border-color:#9a865e99}
.rts-row>label{flex:1;min-width:95px;cursor:pointer;font-weight:500;color:#eeeadd}
.rts-note{color:#a4b5a7;font-size:12px;line-height:1.6;margin:8px 0 16px}
.rts-row>.rts-note{flex-basis:100%;margin:-4px 0 0;padding-right:52px;font-weight:400;color:#99ac9f}
.rts-row select{max-width:58%;min-width:0;padding:9px 11px;background:#0e1c17;color:#e4dfca;border:1px solid #687350;border-radius:5px;font:inherit;color-scheme:dark}
.rts-row .rts-val{width:42px;text-align:right;color:#e3c780;font:12px monospace;font-variant-numeric:tabular-nums}
.rts-row input[type=range]{appearance:none;height:5px;border-radius:4px;background:#506444;width:180px;max-width:34%;accent-color:#e1c277;cursor:pointer}
.rts-row input[type=range]::-webkit-slider-thumb{appearance:none;width:17px;height:17px;border-radius:50%;background:#efdaa2;border:3px solid #9c834e;box-shadow:0 0 0 3px #bba86b22}
.rts-row input[type=checkbox]{appearance:none;flex:none;width:44px;height:25px;margin:0;border:1px solid #687553;border-radius:20px;background:#26332b;position:relative;cursor:pointer;transition:background .18s}
.rts-row input[type=checkbox]::before{content:'';position:absolute;width:17px;height:17px;top:3px;left:3px;border-radius:50%;background:#8e9d91;transition:transform .18s}
.rts-row input[type=checkbox]:checked{background:#8b773e;border-color:#e0c276;box-shadow:0 0 12px #cfb56720}
.rts-row input[type=checkbox]:checked::before{transform:translateX(19px);background:#fff1c6;box-shadow:0 1px 4px #0007}
.rts-foot{display:flex;flex:none;align-items:center;gap:10px;padding:19px 34px;border-top:1px solid #8b78404d;background:#0c1512}
.rts-foot::before{content:'✓  Changes saved automatically';margin-right:auto;color:#91aa94;font-size:11px}
.rts-foot button{padding:11px 17px;border:1px solid #6f7955;border-radius:5px;background:transparent;color:#c2c8b4;font:12px system-ui,sans-serif;cursor:pointer}
.rts-foot button:hover{background:#28382a;color:#fff0c7}
.rts-foot button.rts-primary{min-width:112px;color:#282313;font-weight:750;border-color:#e3c985;background:linear-gradient(#efdaa0,#bd9c51);box-shadow:inset 0 1px #fff2c7,0 3px 10px #0005}
.rts-foot button.rts-primary:hover{background:#f0dba5}
.rts-panel :focus-visible{outline:2px solid #f6d997;outline-offset:3px}
@media(max-width:560px){.rts-scrim{padding:10px}.rts-panel{max-height:calc(100dvh - 20px)}.rts-settings-hero{padding:24px 20px 20px;min-height:105px}.rts-panel h2{font-size:32px}.rts-settings-hero::after{opacity:.35;left:25%}.rts-panel .rts-hint{max-width:85%}.rts-navigation{gap:3px;padding:10px}.rts-navigation button{flex-direction:column;gap:5px;font-size:12px;padding:10px 3px}.rts-settings-body{padding:20px 16px;height:44vh}.rts-row{padding:13px 12px;gap:8px;font-size:12px}.rts-row>.rts-note{padding-right:0}.rts-foot{padding:14px 16px}.rts-foot::before{content:'✓ Saved';font-size:10px}.rts-foot button{padding:10px; font-size:11px}.rts-foot button.rts-primary{min-width:70px}}
@media(prefers-reduced-motion:reduce){.rts-panel *{transition:none!important}}
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

  const hero=el('header','rts-settings-hero');panel.appendChild(hero);
  hero.appendChild(el("p", "rts-kicker", "REALMS OF VALOR  /  OPTIONS"));
  const title=el("h2", undefined, "Shape your realm");title.id='rts-settings-title';hero.appendChild(title);
  panel.setAttribute('aria-labelledby',title.id);
  hero.appendChild(el("p", "rts-hint", "The game is paused while this is open."));
  const navigation=el('nav','rts-navigation');navigation.setAttribute('aria-label','Settings categories');panel.appendChild(navigation);
  const body=el('div','rts-settings-body');panel.appendChild(body);
  const groups:Array<{button:HTMLButtonElement;group:HTMLDivElement}>=[];

  const group = (title: string): HTMLDivElement => {
    const g = el("div", "rts-group");
    g.appendChild(el("h3", undefined, title));
    g.appendChild(el('p','rts-category-intro',({Audio:'Set the sound of your kingdom.',Display:'Bring every battle into focus.',Controls:'Command your realm with confidence.',Game:'Choose the story your kingdom will tell.'} as Record<string,string>)[title]));
    const button=el('button',undefined,title);button.type='button';button.setAttribute('aria-pressed',String(groups.length===0));
    const symbol=el('span','rts-category-symbol',({Audio:'♫',Display:'◈',Controls:'✥',Game:'♜'} as Record<string,string>)[title]);symbol.setAttribute('aria-hidden','true');button.prepend(symbol);
    g.hidden=groups.length>0;g.id='rts-settings-'+title.toLowerCase();button.setAttribute('aria-controls',g.id);
    button.addEventListener('click',()=>{for(const item of groups){item.group.hidden=item.group!==g;item.button.setAttribute('aria-pressed',String(item.group===g));}body.scrollTop=0;});
    groups.push({button,group:g});navigation.appendChild(button);body.appendChild(g);
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
    key: "volume" | "sfxVolume" | "musicVolume" | "gameSpeed" | "scrollSpeed",
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

  const check = (parent: HTMLElement, label: string, key: "clickToMove" | "voices" | "muted" | "music" | "animations" | "edgeScroll" | "damageNumbers" | "nomad" | "stockade" | "crowning" | "wildlife", note?: string): (() => void) => {
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
  syncs.push(check(audio, "Character voices", "voices", "Occasional short callouts. At least 45 seconds between lines."));
  syncs.push(slider(audio, "Master volume", "volume", 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`));
  syncs.push(slider(audio, "Effects", "sfxVolume", 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`));
  syncs.push(check(audio, "Score", "music"));
  syncs.push(slider(audio, "Score volume", "musicVolume", 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`));
  audio.appendChild(el("p", "rts-note", "Sound starts on your first click. Off-screen fighting is quieter than what is in front of you. The score is a drone and a few scattered notes — it is meant to sit under the game, not over it."));

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
  syncs.push(check(ctrl, "Left-click to move", "clickToMove", "Click a person to select them, then click the ground to move or a tree to gather. Right-click also works. Drag a box for a group; press Home to find your people."));
  syncs.push(check(ctrl, "Edge scrolling", "edgeScroll"));
  syncs.push(slider(ctrl, "Scroll speed", "scrollSpeed", 0.4, 2.5, 0.1, (v) => `${v.toFixed(1)}x`));

  const play = group("Game");
  {
    const r = row(play, "Map");
    const sel = el("select");
    sel.style.maxWidth = "230px";
    const rand = el("option", undefined, "Random each match");
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

  // Keep each explanation with its control, including at narrow widths.
  body.querySelectorAll('.rts-note').forEach(note => {
    const previous = note.previousElementSibling;
    if (previous?.classList.contains('rts-row')) previous.appendChild(note);
  });
  const foot = el("div", "rts-foot");
  const reset = el("button", undefined, "Reset to defaults");
  const done = el("button", "rts-primary", "Done");
  foot.appendChild(reset);
  foot.appendChild(done);
  panel.appendChild(foot);
  panel.querySelectorAll('.rts-row').forEach((r,i)=>{const input=r.querySelector('input,select');const label=r.querySelector('label');if(input&&label){input.id='rts-setting-'+i;label.htmlFor=input.id;}});

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
        groups.find(g=>!g.group.hidden)?.button.focus();
      }
      onChange(settings);
    },
    close() {
      if (!open) return;
      open = false;
      scrim.hidden = true;
      gear.focus();
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
      if(open&&e.key==='Tab'){
        const controls=Array.from(panel.querySelectorAll<HTMLElement>('button,input,select')).filter(n=>n.getClientRects().length>0);
        const first=controls[0],last=controls[controls.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
      if (open && e.key === "Escape") {
        e.stopPropagation();
        api.close();
      }
    },
    true,
  );

  return api;
}
