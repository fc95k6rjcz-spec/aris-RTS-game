import { registerSheet, type Clip } from './anim';
const sources=import.meta.glob('../assets/wildlife-v2/*.webp',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
export function registerWildlife(){for(const def of ['bear','deer','cow']){
 const clip=(row:number,fps:number,loop=true):Clip=>({srcs:Array.from({length:4},(_,i)=>sources[`../assets/wildlife-v2/${def}-${row*4+i}.webp`]!),fps,loop});
 const idle=clip(0,3),walk=clip(1,7),action=clip(2,8),die=clip(3,6,false);
 registerSheet('*',def,{height:def==='deer'?1.25:1.05,clips:{idle,walk,run:walk,flee:def==='deer'?action:walk,attack:def==='bear'?action:idle,gather:def==='cow'?action:idle,hurt:idle,die}});
}}

