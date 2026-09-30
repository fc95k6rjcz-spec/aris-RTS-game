import {spriteImage} from './sprites';
import {tierWallPiece, wallTierHeight} from './wallTiers';
const sources=import.meta.glob('../assets/walls/*.webp',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
/** Each tier's piece, built once from the joined piece and that tier's stone. */
const tiered=new Map<string,HTMLCanvasElement>();
/** North/east/south/west arms. Shared by placed walls and placement previews. */
export function wallMask(x:number,y:number,connected:(x:number,y:number)=>boolean):number {
 return (connected(x,y-1)?1:0)|(connected(x+1,y)?2:0)|(connected(x,y+1)?4:0)|(connected(x-1,y)?8:0);
}
export function drawJoinedWall(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,mask:number,tier=1):boolean {
 const m=mask&15,t=Math.max(1,Math.min(10,tier));
 const src=sources[`../assets/walls/${m}.webp`];if(!src)return false;const image=spriteImage(src);if(!image)return false;
 let piece:HTMLImageElement|HTMLCanvasElement=image;
 const stoneSrc=sources[`../assets/walls/tier-${t}.webp`],stone=stoneSrc?spriteImage(stoneSrc):null;
 if(stone){const key=`${m}|${t}`;let c=tiered.get(key);if(!c){c=tierWallPiece(image,stone,t,m);tiered.set(key,c);}piece=c;}
 // Arms finish on the same grid edges, regardless of the source sprite's padding.
 // Higher tiers stand taller: the top rises, the footing stays on the grid.
 const left=mask&8?-.015:.27,right=mask&2?1.015:.73;
 const top=(mask&1?0:.27)-.60*wallTierHeight(t),bottom=mask&4?1.015:.73;
 ctx.drawImage(piece,x+left*w,y+top*w,(right-left)*w,(bottom-top)*w);return true;
}
