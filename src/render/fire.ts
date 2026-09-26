/** Render-only damage fire. All motion follows simulation time, including pause. */
export const BURN_AT = 0.65;
function noise(a:number,b:number):number {
  let t=(a*374761393+b*668265263)>>>0;t=Math.imul(t^(t>>>13),1274126177)>>>0;
  return ((t^(t>>>16))>>>0)/4294967296;
}
export function drawFire(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,frac:number,tick:number,seed:number):void {
  if(frac>=BURN_AT)return;
  const heat=Math.min(1,(BURN_AT-frac)/BURN_AT),fires=1+Math.floor(heat*4);
  ctx.save();ctx.globalCompositeOperation='source-over';
  for(let i=0;i<fires;i++){
    const fx=x+w*(.2+noise(seed,i)*.6),fy=y+w*(.34+noise(seed,i+90)*.24);
    const size=w*(.032+heat*.045),phase=tick*.3+i*2.4;
    // Soft drifting smoke appears behind the flames, without solid circle edges.
    for(let puff=0;puff<5;puff++){
      const k=(tick*.008+noise(seed,i*19+puff+200))%1;
      const px=fx+w*k*.12+Math.sin(k*5+i)*size*.4,py=fy-size*2-k*w*.38;
      const radius=size*(.8+k*2.6),alpha=Math.sin(k*Math.PI)*(.1+heat*.1);
      const smoke=ctx.createRadialGradient(px,py,0,px,py,radius);
      smoke.addColorStop(0,`rgba(45,39,33,${alpha})`);smoke.addColorStop(.5,`rgba(64,59,51,${alpha*.65})`);smoke.addColorStop(1,'rgba(64,59,51,0)');
      ctx.fillStyle=smoke;ctx.fillRect(px-radius,py-radius,radius*2,radius*2);
    }
    const glow=ctx.createRadialGradient(fx,fy-size*.4,0,fx,fy-size*.4,size*2.2);
    glow.addColorStop(0,'rgba(246,97,14,.22)');glow.addColorStop(1,'rgba(246,97,14,0)');
    ctx.fillStyle=glow;ctx.fillRect(fx-size*2.2,fy-size*2.6,size*4.4,size*4.4);
    if(heat>.06)for(let tongue=0;tongue<3;tongue++){
      const base=fx+(tongue-1)*size*.48,t=phase+tongue*2.1;
      const height=size*(1.7+.8*Math.sin(t)+.3*Math.sin(t*2.3));
      const width=size*(.3+.08*Math.cos(t*1.4)),tip=base+Math.sin(t*.8)*size*.5;
      const flame=ctx.createLinearGradient(base,fy,tip,fy-height);
      flame.addColorStop(0,'rgba(205,57,6,.8)');flame.addColorStop(.28,'rgba(255,126,15,.88)');flame.addColorStop(.62,'rgba(255,188,53,.78)');flame.addColorStop(1,'rgba(233,87,10,0)');
      ctx.fillStyle=flame;ctx.beginPath();ctx.moveTo(base-width,fy);
      ctx.bezierCurveTo(base-width*1.2,fy-height*.35,tip-width*.6,fy-height*.65,tip,fy-height);
      ctx.bezierCurveTo(tip+width*.3,fy-height*.55,base+width*1.4,fy-height*.28,base+width,fy);ctx.closePath();ctx.fill();
      const core=ctx.createLinearGradient(base,fy,base,fy-height*.55);
      core.addColorStop(0,'rgba(255,226,123,.9)');core.addColorStop(1,'rgba(255,194,62,0)');ctx.fillStyle=core;
      ctx.beginPath();ctx.moveTo(base-width*.35,fy);ctx.quadraticCurveTo(base-width*.2,fy-height*.3,tip,fy-height*.55);ctx.quadraticCurveTo(base+width*.35,fy-height*.2,base+width*.35,fy);ctx.fill();
    }
    // A few tiny embers rise separately; the whole roof never washes out yellow.
    for(let ember=0;ember<3;ember++){
      const k=(tick*.018+noise(seed,i*7+ember+450))%1;
      ctx.fillStyle=`rgba(255,171,51,${(1-k)*heat*.8})`;
      const ex=fx+Math.sin(k*5+ember)*size+k*w*.07,ey=fy-k*w*.34;
      ctx.fillRect(ex,ey,Math.max(1,w*.006),Math.max(1,w*.009)*(1-k));
    }
  }
  ctx.restore();
}
