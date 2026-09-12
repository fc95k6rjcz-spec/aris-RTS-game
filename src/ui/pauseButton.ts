/**
 * The pause control, sitting beside the settings gear.
 *
 * DOM rather than canvas for the same reason the settings panel is: it is
 * chrome, not part of the world, and a real button gets focus, hover and
 * keyboard handling for free. The button only reflects and toggles state the
 * game owns -- it holds none of its own, so pausing from the keyboard and
 * pausing from the button can never disagree.
 */

export interface PauseButton {
  /** Repaint the label from the game's current state. */
  sync(paused: boolean): void;
}

const CSS = `
.rts-pause {
  position: fixed; top: 6px; right: 48px; z-index: 30;
  height: 30px; min-width: 30px; padding: 0 8px;
  border: 1px solid #4a5568; border-radius: 6px;
  background: rgba(12,16,22,0.85); color: #cbd5e0;
  font: 14px/1 system-ui, sans-serif; cursor: pointer;
}
.rts-pause:hover { background: rgba(30,40,52,0.95); color: #fff; }
.rts-pause[aria-pressed="true"] {
  background: #3b62a8; border-color: #4c7fd6; color: #fff;
}
`;

/**
 * @param toggle called when the button is pressed; the game flips its own
 *               `paused` and calls `sync` back.
 */
export function createPauseButton(toggle: () => void): PauseButton {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.className = "rts-pause";
  btn.title = "Pause (Space)";
  document.body.appendChild(btn);
  btn.addEventListener("click", () => {
    toggle();
    // Keep the space bar working as a pause key rather than re-pressing the
    // button it just left focused.
    btn.blur();
  });

  return {
    sync(paused: boolean): void {
      btn.textContent = paused ? "▶" : "❚❚";
      btn.setAttribute("aria-pressed", paused ? "true" : "false");
      btn.setAttribute("aria-label", paused ? "Resume" : "Pause");
      btn.title = paused ? "Resume (Space)" : "Pause (Space)";
    },
  };
}
