import { settings, sfxGain, onSettingsChange } from "./settings";
import type { World } from "../sim/world";
import type { Unit } from "../sim/entities";

/** One short line at most every 45 seconds; each topic waits three minutes. */
export class Callouts {
  private next = 0;
  private topics = new Map<string, number>();
  constructor() {
    onSettingsChange(() => { if (!settings.voices || sfxGain() === 0) window.speechSynthesis?.cancel(); });
  }
  update(world: World, player: number, visible: Unit[]): string | null {
    const now = performance.now();
    if (!settings.voices || sfxGain() === 0 || now < this.next || !visible.length) return null;
    let topic = "", text = "";
    if (world.fx.some(e => e.kind === "battleRally" && e.owner === player)) { topic="rally"; text="Stand with me! For the realm!"; }
    else if (world.fx.some(e => e.kind === "buildStart")) { topic="build"; text="Right then. Let's get this built."; }
    else if (world.tick % 200 !== 0) return null;
    else if ((world.players.get(player)?.food ?? 400) < 40) { topic="food"; text="Could do with a hot meal, my lord."; }
    else if (world.rain > .5 && visible.some(u => !world.isSheltered(u))) { topic="rain"; text="Soaked through. A roof would be welcome."; }
    else if (visible.some(u => u.hp < u.maxHp * .35)) { topic="wounded"; text="Still standing. Could use a healer."; }
    if (!text || now < (this.topics.get(topic) ?? 0)) return null;
    this.next=now+45000; this.topics.set(topic,now+180000);
    if (window.speechSynthesis && !window.speechSynthesis.speaking) {
      const line=new SpeechSynthesisUtterance(text); line.lang="en-GB"; line.rate=.94; line.pitch=.85; line.volume=Math.min(.5,sfxGain());
      window.speechSynthesis.speak(line);
    }
    return text;
  }
}

