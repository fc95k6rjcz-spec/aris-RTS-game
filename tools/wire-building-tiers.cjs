const fs=require('fs');
let p='src/render/blueBanner.ts';fs.writeFileSync(p,`const assets=import.meta.glob('../assets/blue-banner/*.webp',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const tiers=import.meta.glob('../assets/blue-banner-tiers/*/level-*.webp',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
/** Each completed tier has its own architecture; older art is a loading fallback. */
export function blueBannerArt(def:string,level=1):string|null {
 const tier=Math.max(1,Math.min(10,level));
 return tiers['../assets/blue-banner-tiers/'+def+'/level-'+tier+'.webp']??assets['../assets/blue-banner/'+def+'.webp']??null;
}
export function blueBannerHasTiers(def:string):boolean {
 return Array.from({length:10},(_,i)=>tiers['../assets/blue-banner-tiers/'+def+'/level-'+(i+1)+'.webp']).every(Boolean);
}
`);
p='src/render/redesign.ts';let s=fs.readFileSync(p,'utf8').replace("if(blueBannerArt(def))return stage==='level'?blueBannerArt(def):null;","if(blueBannerArt(def,level))return stage==='level'?blueBannerArt(def,level):null;");fs.writeFileSync(p,s);
p='src/render/renderer.ts';s=fs.readFileSync(p,'utf8').replace('import { blueBannerArt }','import { blueBannerArt, blueBannerHasTiers }').replace('if(b.upgrade && !blueBannerArt(b.def))','if(b.upgrade && (!blueBannerArt(b.def) || blueBannerHasTiers(b.def)))');fs.writeFileSync(p,s);
p='test/royalTowerTiers.mjs';s=fs.readFileSync(p,'utf8').replace('src/assets/redesign/tower/','src/assets/blue-banner-tiers/tower/').replace("await page.setContent(readFileSync('dist/index.html','utf8'));","if(process.env.GAME_URL)await page.goto(process.env.GAME_URL);else await page.setContent(readFileSync('dist/index.html','utf8'));");fs.writeFileSync(p,s);
