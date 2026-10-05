import type { PlayerId } from "../sim/types";
import { WILD, type World } from "../sim/world";

export interface AlliancePanel {
  sync(): void;
}

/** Match relationships come from the simulation, including multiplayer teams. */
export function createAlliancePanel(parent: HTMLElement, state: () => { world: World; player: PlayerId; menu: boolean; names?: string[] }, change: (target: PlayerId, allied: boolean) => void): AlliancePanel {
  const hint = document.createElement('p');
  hint.className = 'rts-note';
  const roster = document.createElement('div');
  parent.append(hint, roster);
  let signature = "";
  const sync = () => {
    const { world, player, menu, names } = state();
    hint.textContent = menu ? 'Start a match to choose your allies.' : 'Tick a player to put them on your team. Untick to make them an enemy. Changes apply when play resumes.';


    const players = [...world.players.values()].filter(p => p.id !== WILD);
    const next = JSON.stringify([menu, world.winner, players.map(p => [p.id, p.color, p.faction, world.allied(player, p.id), names?.[p.id - 1], player])]);
    if (signature === next) return;
    signature = next;
    roster.replaceChildren();
    for (const p of players) {
      const row = document.createElement("div");
      row.className = "rts-row";
      const dot = document.createElement("span");
      dot.className = "rts-alliance-color";
      dot.style.cssText = `width:12px;height:12px;border-radius:50%;flex:none;background:${p.color}`;
      const name = document.createElement("span");
      name.textContent = names?.[p.id - 1] || `Player ${p.id}`;
      const status = document.createElement("span");
      status.className = "rts-alliance-status"; status.style.marginLeft = "auto";
      status.textContent = p.id === player ? "You" : world.allied(player, p.id) ? "Ally" : "Enemy";
      status.style.color = p.id === player ? "#e7cc91" : world.allied(player, p.id) ? "#9cdfa0" : "#f29b92";
      row.append(dot, name, status);
      if (p.id !== player) {
        const check = document.createElement("input");
        check.type = "checkbox";
        check.className = "rts-alliance-check";
        check.checked = world.allied(player, p.id);
        check.disabled = menu || world.winner !== null;
        check.setAttribute("aria-label", `On your team: ${name.textContent}`);
        check.addEventListener("change", () => {
          change(p.id, check.checked);
          status.textContent = "Pending";
        });
        row.appendChild(check);
      }
      roster.appendChild(row);
    }
  };
  sync();
  return { sync };
}
