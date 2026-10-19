import {blueBannerArt} from './blueBanner';
import {drawDiagonalWall} from './diagonalWalls';
import {spriteImage,teamSprite} from './sprites';
/** Cardinal arms plus diagonals where no cardinal neighbour already fills the corner. */
export function wallMask(x:number,y:number,connected:(x:number,y:number)=>boolean):number {
 const n=connected(x,y-1),e=connected(x+1,y),s=connected(x,y+1),w=connected(x-1,y);
 return (n?1:0)|(e?2:0)|(s?4:0)|(w?8:0)
 |(!n&&!e&&connected(x+1,y-1)?16:0)|(!s&&!e&&connected(x+1,y+1)?32:0)
 |(!s&&!w&&connected(x-1,y+1)?64:0)|(!n&&!w&&connected(x-1,y-1)?128:0);
}
export function drawJoinedWall(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,mask:number,color?:string,level=1):boolean {
 const source=blueBannerArt('wall',level),image=source?spriteImage(source):null;
 drawDiagonalWall(ctx,x,y,w,mask,image?(color?teamSprite(image,color,false):image):undefined,level);
 return true;
}
