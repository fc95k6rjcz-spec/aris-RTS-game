import {spriteImage} from './sprites';
const sources=import.meta.glob('../assets/walls/*.webp',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
/** North/east/south/west arms. Shared by placed walls and placement previews. */
export function wallMask(x:number,y:number,connected:(x:number,y:number)=>boolean):number {
 return (connected(x,y-1)?1:0)|(connected(x+1,y)?2:0)|(connected(x,y+1)?4:0)|(connected(x-1,y)?8:0);
}
export function drawJoinedWall(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,mask:number):boolean {
 const src=sources[`../assets/walls/${mask&15}.webp`];if(!src)return false;const image=spriteImage(src);if(!image)return false;
 // Arms finish on the same grid edges, regardless of the source sprite's padding.
 const left=mask&8?-.015:.27,right=mask&2?1.015:.73;
 const top=(mask&1?0:.27)-.60,bottom=mask&4?1.015:.73;
 ctx.drawImage(image,x+left*w,y+top*w,(right-left)*w,(bottom-top)*w);return true;
}

