import { MAPS } from '../data/maps';
import { settings } from '../game/settings';
import type { MatchSetup } from '../net/room';

/** A host's draft stays local until Create room snapshots it for both players. */
export function createGamePanel(create: (setup: MatchSetup) => void): { open(): void; readonly visible: boolean } {
  const scrim=document.createElement('div');scrim.className='rts-scrim';scrim.hidden=true;
  const panel=document.createElement('form');panel.className='rts-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','create-game-title');
  panel.innerHTML=`<header class="rts-settings-hero"><p class="rts-kicker">MULTIPLAYER / HOST A MATCH</p><h2 id="create-game-title">Create your game</h2><p class="rts-hint">Your realm. Your rules. Invite a friend to battle.</p></header><div class="rts-settings-body"><section class="rts-group"><h3>Match setup</h3><p class="rts-category-intro">Fight an AI kingdom together with shared vision, or challenge your friend.</p></section></div><footer class="rts-foot"><button type="button" class="cancel-create">Back</button><button type="submit" class="rts-primary">Create room</button></footer>`;
  // Drafts are only applied on submit; the usual auto-save footer does not apply.
  const style=document.createElement('style');style.textContent='.rts-panel:has(#create-game-title) .rts-foot::before{content:"Private · 2 players"}.rts-panel:has(#create-game-title) .rts-hint::before{content:"♜"}';panel.append(style);
  scrim.append(panel);document.body.append(scrim);
  const group=panel.querySelector('section')!;
  function row(label:string,input:HTMLInputElement|HTMLSelectElement,note?:string){const r=document.createElement('div');r.className='rts-row';const l=document.createElement('label');l.textContent=label;input.id='match-'+label.toLowerCase().replaceAll(' ','-');l.htmlFor=input.id;r.append(l,input);if(note){const p=document.createElement('p');p.className='rts-note';p.textContent=note;r.append(p);}group.append(r);}
  function select(label:string,options:Array<[string,string]>){const s=document.createElement('select');for(const [value,text] of options)s.add(new Option(text,value));row(label,s);return s;}
  const mode=select('Game mode',[['coop','Team up against AI'],['versus','Battle your friend']]);
  const aiDifficulty=select('AI difficulty',[['easy','Easy'],['normal','Normal'],['hard','Hard']]);
  aiDifficulty.value='normal';
  mode.addEventListener('change',()=>{aiDifficulty.disabled=mode.value!=='coop';});
  const map=select('Map',[['random','Random map'],...MAPS.map(m=>[m.id,`${m.name} · ${m.kind}`] as [string,string])]);
  const pace=select('Match length',[['1','Skirmish'],['2','Long'],['4','Campaign'],['8','Epic']]);
  const start=select('Starting army',[['crowning','One peasant · find your crown'],['nomad','King · choose your settlement'],['settled','Town hall and workers']]);
  function check(label:string,note:string){const c=document.createElement('input');c.type='checkbox';row(label,c,note);return c;}
  const wildlife=check('Wildlife','Wild creatures roam the map.');
  const stockade=check('Forest walls','Begin surrounded by woodland. Cut a path to your opponent.');
  let previous:HTMLElement|null=null;
  function close(){scrim.hidden=true;previous?.focus();}
  panel.querySelector('.cancel-create')!.addEventListener('click',close);
  scrim.addEventListener('mousedown',e=>{if(e.target===scrim)close();});
  scrim.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const controls=Array.from(panel.querySelectorAll<HTMLElement>('button,input,select'));const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
  panel.addEventListener('submit',e=>{e.preventDefault();const chosen=MAPS.find(m=>m.id===map.value)??MAPS[Math.floor(Math.random()*MAPS.length)]!;const setup:MatchSetup={seed:Math.floor(Math.random()*0x7fffffff),mapId:chosen.id,pace:Number(pace.value),crowning:start.value==='crowning',nomad:start.value==='nomad',wildlife:wildlife.checked,stockade:stockade.checked,mode:mode.value as 'coop'|'versus',aiDifficulty:aiDifficulty.value as 'easy'|'normal'|'hard'};close();create(setup);});
  return {get visible(){return !scrim.hidden;},open(){previous=document.activeElement as HTMLElement;map.value=settings.mapId; if(!map.value)map.value='random';pace.value=String(settings.pace);start.value=settings.crowning?'crowning':settings.nomad?'nomad':'settled';wildlife.checked=settings.wildlife;stockade.checked=settings.stockade;scrim.hidden=false;map.focus();}};
}
