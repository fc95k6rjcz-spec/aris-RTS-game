import grunt from "../assets/motion-v2/grunt.webp";
import wolf from "../assets/motion-v2/direwolf.webp";
import dragon from "../assets/motion-v2/dragon.webp";
import cow from "../assets/motion-v2/cow.webp";
import walk from "../assets/motion-v2/worker-walk.webp";
import chop from "../assets/motion-v2/worker-chop.webp";
import soldier from "../assets/motion-v2/soldier-walk.webp";
import { spriteImage } from "./sprites";
import type { Unit } from "../sim/entities";
import type { AnimState } from "./anim";
const prepared=new Map<string,HTMLCanvasElement>();
/** Key only neutral backdrop connected to cell borders; never erase enclosed axe metal. */
function atlas(src:string,key:boolean,rows=3):HTMLCanvasElement|null {
 if(prepared.has(src))return prepared.get(src)!;
 const img=spriteImage(src);if(!img)return null;
 const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;
 const ctx=c.getContext("2d",{willReadFrequently:true})!;ctx.drawImage(img,0,0);
 if(key){const pixels=ctx.getImageData(0,0,c.width,c.height),d=pixels.data;const seen=new Uint8Array(c.width*c.height),q=new Int32Array(seen.length);let head=0,tail=0;
 const visit=(i:number)=>{if(i<0||i>=seen.length||seen[i])return;seen[i]=1;const n=i*4,hi=Math.max(d[n]!,d[n+1]!,d[n+2]!),lo=Math.min(d[n]!,d[n+1]!,d[n+2]!);if(hi-lo>24||lo<140)return;d[n+3]=0;q[tail++]=i;};
 for(let y=0;y<c.height;y++)for(let col=0;col<=6;col++)visit(y*c.width+Math.min(c.width-1,Math.floor(col*c.width/6)));
 for(let x=0;x<c.width;x++)for(let row=0;row<=rows;row++)visit(Math.min(c.height-1,Math.floor(row*c.height/rows))*c.width+x);
 while(head<tail){const i=q[head++]!,x=i%c.width;if(x>0)visit(i-1);if(x<c.width-1)visit(i+1);visit(i-c.width);visit(i+c.width);}ctx.putImageData(pixels,0,0);}
 prepared.set(src,c);return c;
}
export function directionRow(facing:number):{row:number;mirror:boolean} {
 return {row:facing===2?1:facing===6?2:0,mirror:facing===0||facing===1||facing===7};
}
export function hasDirectional(def:string,state:AnimState):boolean {
 if(["grunt","direwolf","dragon","cow"].includes(def))return true;
 return def==="worker" ? ["idle","walk","run","carry","flee","chop"].includes(state)
 : ["king","prince","footman"].includes(def)&&["idle","walk","run"].includes(state);
}
export function drawDirectional(ctx:CanvasRenderingContext2D,u:Unit,state:AnimState,x:number,y:number,s:number,phase:number,tick:number,enabled:boolean):number|null {
 if(!hasDirectional(u.def,state))return null;
 if(["grunt","direwolf","dragon","cow"].includes(u.def))return drawCreature(ctx,u.def,u.facing,state,x,y,s,phase,tick,enabled);
 const cutting=state==="chop",worker=u.def==="worker",src=worker?(cutting?chop:walk):soldier;
 const img=atlas(src,worker);if(!img)return null;
 const {row,mirror}=directionRow(u.facing),sw=img.width/6,sh=img.height/3;
 const cycle=cutting ? ((tick%20)+20)%20/20 : phase;
 const index=!enabled||state==="idle"?0:Math.min(5,Math.floor(cycle*6));
 const scale=s*1.4/(worker?(cutting?265:300):325),dw=sw*scale,dh=sh*scale;
 const baseline=(worker?(row===0?326:row===1?cutting?334:327:cutting?311:307):330)/341;
 ctx.save();ctx.translate(x,y+s*.45);if(mirror)ctx.scale(-1,1);
 ctx.drawImage(img,index*sw,row*sh,sw,sh,-dw/2,-dh*baseline,dw,dh);ctx.restore();return s*1.4;
}

export function drawCreature(ctx:CanvasRenderingContext2D,def:string,facing:number,state:AnimState,x:number,y:number,s:number,phase:number,tick:number,enabled:boolean):number|null {
 const src=def==="grunt"?grunt:def==="direwolf"?wolf:def==="dragon"?dragon:def==="cow"?cow:null;if(!src)return null;
 const img=atlas(src,def==="direwolf"||def==="dragon",def==="cow"?3:4);if(!img)return null;
 const moving=["walk","run","fly","flee"].includes(state),dead=state==="die",attacking=state==="attack"||state==="cast";
 const row=def==="cow"?(moving?(facing===6?2:1):0):dead?3:attacking?2:moving?1:0;
 const index=!enabled?0:dead?Math.min(5,Math.floor(tick/4)):attacking?Math.min(5,Math.floor(tick/4)):Math.floor((moving?phase:tick/50)%1*6);
 let sx=0,sy=0,sw=img.width/6,sh=img.height/3,baseline=.94;
 if(def==="dragon"){sx=110+(Math.min(5,index))*222;sy=[0,265,533,795][row]!;sw=222;sh=260;baseline=.94;}
 else if(def==="grunt"||def==="direwolf"){sx=35+Math.min(5,index)*232;sy=[85,342,564,825][row]!;sw=232;sh=[245,220,253,205][row]!;baseline=.97;
   if(def==="direwolf"){sx=[40,305,535,770,990,1215][index]!;sw=[265,230,235,220,225,233][index]!;}
 }
 else{sx=Math.min(5,index)*sw;sy=row*sh;baseline=row===0?.85:row===1?.78:.83;}
 const height=s*(def==="dragon"?2.5:def==="cow"?1.4:def==="grunt"?1.65:1.25);
 const scale=height/(def==="cow"?220:def==="dragon"?230:220),dw=sw*scale,dh=sh*scale;
 ctx.save();ctx.translate(x,y+s*.45);if(facing===0||facing===1||facing===7)ctx.scale(-1,1);
 ctx.drawImage(img,sx,sy,sw,sh,-dw/2,-dh*baseline,dw,dh);ctx.restore();return height;
}

