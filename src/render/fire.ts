/** Small, translucent combustion particles, anchored to the damaged roof.
 * Simulation time keeps the effect steady when paused and reproducible. */
export const BURN_AT = .65;
function noise(seed:number,index:number):number {
 let n=Math.imul(seed+17,374761393)^Math.imul(index+31,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;
}
export function drawFire(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,frac:number,tick:number,seed:number):void {
 if(frac>=BURN_AT||w<=0)return;
 const heat=Math.min(1,Math.max(0,(BURN_AT-frac)/BURN_AT));
 const count=heat<.2?1:heat<.65?2:3;
 const anchors=[[.28,.56],[.67,.43],[.46,.32]];
 ctx.save();ctx.globalCompositeOperation='source-over';
 for(let site=0;site<count;site++){
  const anchor=anchors[site]!,baseX=x+w*anchor[0]!,baseY=y+w*anchor[1]!;
  const rise=w*(.09+heat*.15),spread=w*(.016+heat*.018);
  // Diffuse grey wisps, behind the fire and never a hard-edged smoke disk.
  for(let puff=0;puff<5;puff++){
   const age=(tick*.007+noise(seed,site*50+puff))%1;
   const px=baseX+age*w*.1+Math.sin(age*6+site)*spread,py=baseY-rise*.5-age*w*.34;
   const radius=w*(.025+age*.065),opacity=Math.sin(age*Math.PI)*(.07+heat*.09);
   const smoke=ctx.createRadialGradient(px,py,0,px,py,radius);
   smoke.addColorStop(0,`rgba(47,43,39,${opacity})`);smoke.addColorStop(1,'rgba(47,43,39,0)');
   ctx.fillStyle=smoke;ctx.fillRect(px-radius,py-radius,radius*2,radius*2);
  }
  if(heat<.06)continue;
  // Many narrow streaks form a ragged flame; no solid yellow heart or cone.
  for(let particle=0;particle<22;particle++){
   const key=site*100+particle,age=(tick*(.018+noise(seed,key+300)*.018)+noise(seed,key+700))%1;
   const dx=(noise(seed,key+900)-.5)*spread*2;
   const px=baseX+dx*(1-age*.5)+Math.sin(age*8+key)*spread*.38;
   const py=baseY-age*rise;
   const radius=Math.max(.65,w*.012)*(1-age*.8),length=radius*(2.1+noise(seed,key)*1.7);
   const opacity=Math.sin(age*Math.PI)*(.45+heat*.25);
   const fire=ctx.createRadialGradient(px,py,0,px,py,radius*2);
   const green=Math.round(178-age*112);
   fire.addColorStop(0,`rgba(255,${green},24,${opacity})`);
   fire.addColorStop(.4,`rgba(244,${Math.round(green*.65)},9,${opacity*.65})`);
   fire.addColorStop(1,'rgba(195,48,4,0)');
   ctx.save();ctx.translate(px,py);ctx.scale(1,length/(radius*2));ctx.translate(-px,-py);ctx.fillStyle=fire;ctx.fillRect(px-radius*2,py-radius*2,radius*4,radius*4);ctx.restore();
  }
  for(let ember=0;ember<3;ember++){
   const age=(tick*.011+noise(seed,site*10+ember+1500))%1;
   const px=baseX+Math.sin(age*7+ember)*spread+age*w*.06,py=baseY-age*rise*1.7;
   ctx.fillStyle=`rgba(255,180,75,${(1-age)*heat*.7})`;
   ctx.fillRect(px,py,Math.max(.7,w*.004),Math.max(1,w*.008));
  }
 }
 ctx.restore();
}
