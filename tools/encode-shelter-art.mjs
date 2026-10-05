// Encode the generated atlases without changing their dimensions or alpha.
import {chromium} from 'playwright';
import {readFileSync,writeFileSync} from 'node:fs';
const names=['shelter-v2'];
const browser=await chromium.launch({executablePath:process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {const page=await browser.newPage();for(const name of names){
 const png=readFileSync(`src/assets/motion-v2/${name}.png`).toString('base64');
 const output=await page.evaluate(async png=>{const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;c.getContext('2d').drawImage(image,0,0);return c.toDataURL('image/webp',.92).split(',')[1];},png);
 writeFileSync(`src/assets/motion-v2/${name}.webp`,Buffer.from(output,'base64'));
}}finally{await browser.close();}

