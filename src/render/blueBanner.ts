const assets=import.meta.glob('../assets/blue-banner/*.webp',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
/** One finished design per building; upgrades retain their gameplay effects. */
export function blueBannerArt(def:string):string|null {
 return assets[`../assets/blue-banner/${def}.webp`]??null;
}

