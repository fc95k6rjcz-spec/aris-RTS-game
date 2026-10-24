import { loadSettings, musicGain } from "../game/settings";

/** Play once per tab; ?intro=1 replays it and ?intro=0 opens the menu directly. */
export function showIntro(done: () => void): void {
  const query = new URLSearchParams(location.search);
  let seen = false;
  try { seen = sessionStorage.getItem('rov-intro-v1') === 'seen'; } catch { /* storage may be disabled */ }
  if (query.get('intro') === '0' || (seen && query.get('intro') !== '1') || (matchMedia('(prefers-reduced-motion: reduce)').matches && query.get('intro') !== '1')) { done(); return; }
  loadSettings();
  const overlay = document.createElement('div');
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','Realms of Valor opening film');overlay.setAttribute('aria-modal','true');
  overlay.style.cssText='position:fixed;inset:0;z-index:10000;background:#050709;display:flex;align-items:center;justify-content:center';
  const video=document.createElement('video');video.src='/video/realms-intro.webm';video.muted=true;video.playsInline=true;video.preload='auto';video.volume=musicGain();video.style.cssText='width:100%;height:100%;object-fit:contain';
  const controls=document.createElement('div');controls.style.cssText='position:absolute;bottom:24px;right:24px;display:flex;gap:12px';
  const sound=document.createElement('button'),skip=document.createElement('button');
  for(const b of [sound,skip])b.style.cssText='padding:12px 20px;border:1px solid #b29658;background:#101217;color:#efdcaf;font:16px Georgia;cursor:pointer;border-radius:3px';
  sound.textContent='Enable sound';sound.setAttribute('aria-pressed','false');skip.textContent='Skip intro';
  controls.append(sound,skip);overlay.append(video,controls);document.body.append(overlay);skip.focus();
  let closed=false;
  const loading=window.setTimeout(()=>finish(),15000);
  const safety=window.setTimeout(()=>finish(),45000);
  function finish():void {
    if(closed)return;closed=true;clearTimeout(loading);clearTimeout(safety);
    video.pause();video.removeAttribute('src');video.load();overlay.remove();window.removeEventListener('keydown',onKey,true);
    try {sessionStorage.setItem('rov-intro-v1','seen');}catch{/* optional */}
    done();
  }
  function onKey(e:KeyboardEvent):void {
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish();}
    if(e.key==='Tab'){e.preventDefault();(document.activeElement===skip?sound:skip).focus();}
  }
  window.addEventListener('keydown',onKey,true);
  skip.onclick=finish;video.onended=finish;video.onerror=finish;
  video.onplaying=()=>clearTimeout(loading);
  sound.onclick=()=>{video.muted=!video.muted;sound.textContent=video.muted?'Enable sound':'Mute';sound.setAttribute('aria-pressed',String(!video.muted));void video.play().catch(finish);};
  void video.play().catch(finish);
}
