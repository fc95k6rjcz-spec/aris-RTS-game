import { spriteImage } from './sprites';
const sources=import.meta.glob('../assets/terrain-v2/*.webp',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
export function natureSource(id:string):string {return sources[`../assets/terrain-v2/${id}.webp`]!;}
export function natureReady():boolean {return Object.values(sources).every(src=>!!spriteImage(src));}
