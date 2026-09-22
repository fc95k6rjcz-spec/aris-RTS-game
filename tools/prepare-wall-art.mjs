import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{const page=await browser.newPage();const input=readFileSync('src/assets/motion-v2/wall-directions.png').toString('base64');
const results=await page.evaluate(async input=>{const image=new Image();image.src='data:image/png;base64,'+input;await image.decode();const results=[];
for(let mask=0;mask<16;mask++){const c=document.createElement('canvas');c.width=Math.floor(image.width/4);c.height=Math.floor(image.height/4);const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,(mask%4)*image.width/4,Math.floor(mask/4)*image.height/4,image.width/4,image.height/4,0,0,c.width,c.height);const d=ctx.getImageData(0,0,c.width,c.height).data;let left=c.width,right=0,top=c.height,bottom=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4+3]>20){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}const out=document.createElement('canvas');out.width=right-left+1;out.height=bottom-top+1;out.getContext('2d').drawImage(c,left,top,out.width,out.height,0,0,out.width,out.height);results.push(out.toDataURL('image/webp',.94).split(',')[1]);}return results;},input);
mkdirSync('src/assets/walls',{recursive:true});results.forEach((data,i)=>writeFileSync(`src/assets/walls/${i}.webp`,Buffer.from(data,'base64')));
}finally{await browser.close();}

