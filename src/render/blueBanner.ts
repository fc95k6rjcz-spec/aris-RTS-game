const assets=import.meta.glob('../assets/blue-banner/*.webp',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const tiers=import.meta.glob('../assets/blue-banner-tiers/*/level-*.webp',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
/** Each completed tier has its own architecture; older art is a loading fallback. */
export function blueBannerArt(def:string,level=1):string|null {
 const tier=Math.max(1,Math.min(10,level));
 return tiers['../assets/blue-banner-tiers/'+def+'/level-'+tier+'.webp']??assets['../assets/blue-banner/'+def+'.webp']??null;
}
export function blueBannerHasTiers(def:string):boolean {
 return Array.from({length:10},(_,i)=>tiers['../assets/blue-banner-tiers/'+def+'/level-'+(i+1)+'.webp']).every(Boolean);
}
