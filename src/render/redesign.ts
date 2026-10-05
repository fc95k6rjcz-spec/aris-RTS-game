const assets=import.meta.glob('../assets/redesign/*/*.webp',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
export function redesignedArt(def:string,stage:'level'|'build',level:number):string|null {
 return assets[`../assets/redesign/${def}/${stage}-${Math.max(1,Math.min(10,level))}.webp`]??null;
}
export function redesignedTiers(def:string):string[]|null {
 const tiers=Array.from({length:10},(_,i)=>redesignedArt(def,'level',i+1));
 return tiers.every(Boolean)?tiers as string[]:null;
}
