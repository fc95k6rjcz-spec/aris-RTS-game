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


// ───────────────────────────── camp fires ─────────────────────────────

/**
 * A flame, on its own, standing on the ground.
 *
 * The building fire above draws a cluster of plumes scaled to a roofline; this
 * is one tongue of the same shape scaled to a ring of stones, plus the stones.
 * Kept separate rather than generalised because the two want different things:
 * a burning barracks should look out of control, and a camp fire should look
 * like somebody is sitting at it.
 *
 * @param x,y  where the fire meets the ground, on screen
 * @param s    tile size in pixels, so the fire scales with the zoom
 * @param heat 0 for cold ash through 1 for a fire freshly fed
 * @param tick sim tick plus interpolation, for the flicker
 * @param seed per-fire variation
 */
export function drawCampfire(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  heat: number,
  tick: number,
  seed: number,
): void {
  const r = s * 0.34;

  // The ring of stones. Always there, lit or not -- a cold camp is a landmark.
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.15, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + noise(seed, i) * 0.4;
    const sx = x + Math.cos(a) * r;
    const sy = y + Math.sin(a) * r * 0.46;
    const sz = s * (0.055 + noise(seed, i + 30) * 0.035);
    ctx.fillStyle = i % 2 === 0 ? "#8b8b86" : "#6f6f6b";
    ctx.beginPath();
    ctx.ellipse(sx, sy, sz, sz * 0.72, a, 0, Math.PI * 2);
    ctx.fill();
  }

  // Two logs across the middle.
  ctx.strokeStyle = heat > 0.15 ? "#3a2a1c" : "#4a3a2c";
  ctx.lineWidth = Math.max(1, s * 0.07);
  ctx.lineCap = "round";
  for (const a of [-0.5, 0.7]) {
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * r * 0.7, y - Math.sin(a) * r * 0.34);
    ctx.lineTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.34);
    ctx.stroke();
  }

  // Embers. Present whenever there is any heat at all, and all there is by day.
  if (heat > 0.02) {
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(255,110,30,${0.25 + heat * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.02, r * 0.55, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (heat > 0.12) {
    // The flame itself: the same tongue the buildings burn with, one of it.
    const phase = tick * 0.26 + noise(seed, 3) * 6.3;
    const lick = 0.78 + Math.sin(phase) * 0.22 + Math.sin(phase * 2.9) * 0.09;
    const h = s * (0.34 + heat * 0.5) * lick;
    const w = s * 0.2 * (0.8 + heat * 0.4);
    ctx.globalCompositeOperation = "lighter";
    const grad = ctx.createLinearGradient(x, y, x, y - h);
    grad.addColorStop(0, `rgba(255,88,12,${0.85 * heat})`);
    grad.addColorStop(0.45, `rgba(255,170,44,${0.62 * heat})`);
    grad.addColorStop(1, "rgba(255,238,160,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w * 1.1, y - h * 0.55, x + Math.sin(phase * 1.7) * w * 0.7, y - h);
    ctx.quadraticCurveTo(x + w * 1.1, y - h * 0.55, x + w, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255,236,168,${0.45 * heat})`;
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.22, w * 0.35, h * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sparks going up. Three is plenty: this is a camp fire, not a forge.
    for (let i = 0; i < 3; i++) {
      const k = ((tick * 0.012 + noise(seed, i + 60)) % 1 + 1) % 1;
      ctx.globalAlpha = (1 - k) * heat * 0.8;
      ctx.fillStyle = "#ffcf7a";
      ctx.beginPath();
      ctx.arc(x + Math.sin(phase * 0.7 + i * 2) * s * 0.12 * k, y - h * 0.6 - k * s * 0.9, Math.max(0.6, s * 0.018), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/**
 * The pool of light a fire throws, laid over the finished picture.
 *
 * This has to happen AFTER the daylight wash, and that is the entire reason it
 * is a separate function. The wash is a multiply over everything on screen, so
 * a glow drawn with the world gets multiplied by night-blue along with the
 * grass it is lighting and comes out as a slightly-less-dark patch of blue.
 * Drawn afterwards, in `lighter`, it adds warmth back on top -- which is what a
 * fire in the dark actually does to a photograph of a field.
 *
 * @param strength 0 by day, 1 in the dead of night
 */
export function drawFireGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  strength: number,
  tick: number,
  seed: number,
): void {
  if (strength <= 0.01 || radius <= 0) return;
  // The pool breathes with the flame, or it reads as a decal.
  const flicker = 0.9 + Math.sin(tick * 0.24 + noise(seed, 11) * 6.3) * 0.07 + Math.sin(tick * 0.61) * 0.03;
  const r = radius * flicker;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,176,86,${0.5 * strength})`);
  g.addColorStop(0.35, `rgba(255,140,58,${0.26 * strength})`);
  g.addColorStop(0.7, `rgba(190,92,40,${0.09 * strength})`);
  g.addColorStop(1, "rgba(120,50,20,0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
