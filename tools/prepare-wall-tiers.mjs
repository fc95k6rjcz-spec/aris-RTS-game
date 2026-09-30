// Cuts a square of stonework from the face of each of Justin's straight wall
// paintings (art-src/walls/straight-1..10.png) into src/assets/walls/tier-N.webp.
// The painted sections are drawn at a different angle from the game's grid, so
// they can't be tiled as walls; instead render/wallTiers.ts lays each tier's
// stone over the connecting wall pieces the game already joins in every direction.
import {chromium} from 'playwright';
import {readFileSync,writeFileSync} from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
  const page=await browser.newPage();
  for(let t=1;t<=10;t++){
    const input=readFileSync(`art-src/walls/straight-${t}.png`).toString('base64');
    const data=await page.evaluate(async input=>{
      const img=new Image();img.src='data:image/png;base64,'+input;await img.decode();
      // The lower middle of the face: below the battlements, above the plinth, clear of the end pillars.
      const sx=img.width*0.36,sw=img.width*0.28,sy=img.height*0.5,sh=Math.min(sw,img.height*0.34);
      const c=document.createElement('canvas');c.width=c.height=96;
      c.getContext('2d').drawImage(img,sx,sy,sw,sh,0,0,96,96);
      return c.toDataURL('image/webp',.92).split(',')[1];
    },input);
    writeFileSync(`src/assets/walls/tier-${t}.webp`,Buffer.from(data,'base64'));
  }
}finally{await browser.close();}
