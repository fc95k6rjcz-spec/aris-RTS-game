import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const result=await page.evaluate(async b64=>{
  const img=new Image();img.src='data:image/jpeg;base64,'+b64;await img.decode();
  const c=document.createElement('canvas');c.width=1280;c.height=720;document.body.append(c);const ctx=c.getContext('2d');
  const ac=new AudioContext();await ac.resume();const dest=ac.createMediaStreamDestination(),master=ac.createGain();master.gain.value=.55;master.connect(dest);
  const note=(midi,at,duration,volume,type='triangle')=>{const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.value=440*2**((midi-69)/12);g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(volume,at+.08);g.gain.exponentialRampToValueAtTime(.0001,at+duration);o.connect(g).connect(master);o.start(at);o.stop(at+duration+.05);};
  const base=ac.currentTime+.15,melody=[62,65,69,72,69,67,65,62,60,64,67,70,69,67,64,60,58,62,65,69,67,65,62,58,57,61,64,69,73,76,74,69];
  melody.forEach((n,i)=>note(n,base+i*.5,1.1,.13));
  [50,48,46,45].forEach((n,i)=>{note(n,base+i*4,4.3,.18,'sine');note(n+7,base+i*4,4,.07,'sine');});
  [50,57,62,65,69,74].forEach(n=>note(n,base+16,1.8,.065,'sine'));
  const stream=c.captureStream(30);dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
  const rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:3500000});const chunks=[];rec.ondataavailable=e=>chunks.push(e.data);const done=new Promise(r=>rec.onstop=r);
  const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  function paint(t){
   ctx.fillStyle='#050709';ctx.fillRect(0,0,1280,720);
   // Move through separate details in the existing key art, then reveal its title.
   const scene=t<6?0:t<12?1:2,local=t-scene*6,p=smooth(local/6);
   let crop=scene===0?[80+80*p,390+10*p,760,428]:scene===1?[1040-20*p,70+90*p,496,279]:[0,0,1536,864];
   ctx.globalAlpha=smooth(local/.7)*(scene<2?1-smooth((local-5.3)/.7):1);
   ctx.drawImage(img,...crop,0,0,1280,720);
   const shade=ctx.createLinearGradient(0,0,0,720);shade.addColorStop(0,'rgba(0,0,0,.15)');shade.addColorStop(.65,'rgba(0,0,0,0)');shade.addColorStop(1,'rgba(0,0,0,.8)');ctx.fillStyle=shade;ctx.fillRect(0,0,1280,720);
   for(let i=0;i<45;i++){const x=(i*179+t*(5+i%7))%1280,y=(720+i*113-t*(9+i%11))%720;ctx.fillStyle=scene===1?'rgba(255,138,55,.35)':'rgba(245,219,158,.25)';ctx.beginPath();ctx.arc(x,y,1+i%2,0,Math.PI*2);ctx.fill();}
   if(scene<2){ctx.textAlign='center';ctx.font='24px Georgia';ctx.fillStyle='#f2dfb5';ctx.fillText(scene===0?'A KINGDOM WORTH BUILDING':'A REALM WORTH DEFENDING',640,625);}
   ctx.globalAlpha=1;ctx.fillStyle='#050709';ctx.fillRect(0,0,1280,42);ctx.fillRect(0,678,1280,42);
   if(t>17){ctx.globalAlpha=smooth((t-17)/1);ctx.fillRect(0,0,1280,720);ctx.globalAlpha=1;}
  }
  paint(0);rec.start();const began=performance.now();await new Promise(resolve=>{function frame(){const t=(performance.now()-began)/1000;paint(Math.min(t,18));if(t<18)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});rec.stop();await done;await ac.close();stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:'video/webm'});return await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(blob);});
 },readFileSync('src/assets/menu.jpg').toString('base64'));
 mkdirSync('public/video',{recursive:true});writeFileSync('public/video/realms-intro.webm',Buffer.from(result,'base64'));console.log('Saved intro video',Buffer.from(result,'base64').length,'bytes');
}finally{await browser.close();}

