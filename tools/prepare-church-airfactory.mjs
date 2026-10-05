import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
 const page=await browser.newPage();
 for(const name of ['church','airfactory']) {
  const frames=await page.evaluate(async b64=>{
   const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();
   return Array.from({length:10},(_,i)=>{
    const x=Math.round(i%5*img.width/5),y=Math.round(Math.floor(i/5)*img.height/2);
    const w=Math.round((i%5+1)*img.width/5)-x,h=Math.round((Math.floor(i/5)+1)*img.height/2)-y;
    const cell=document.createElement('canvas');cell.width=w;cell.height=h;
    const ctx=cell.getContext('2d');ctx.drawImage(img,x,y,w,h,0,0,w,h);
    const data=ctx.getImageData(0,0,w,h).data;let l=w,t=h,r=-1,b=-1,transparent=0;
    for(let py=0;py<h;py++)for(let px=0;px<w;px++){
     if(data[(py*w+px)*4+3]>24){l=Math.min(l,px);r=Math.max(r,px);t=Math.min(t,py);b=Math.max(b,py);}else transparent++;
    }
    if(r<l||transparent<w*h*.05)throw Error('Missing sprite or transparency');
    const out=document.createElement('canvas');out.width=r-l+5;out.height=b-t+5;
    out.getContext('2d').drawImage(cell,l,t,r-l+1,b-t+1,2,2,r-l+1,b-t+1);
    return out.toDataURL('image/webp',.94).split(',')[1];
   });
  },readFileSync(`src/assets/redesign/${name}.png`).toString('base64'));
  mkdirSync(`src/assets/redesign/${name}`,{recursive:true});
  frames.forEach((f,i)=>writeFileSync(`src/assets/redesign/${name}/level-${i+1}.webp`,Buffer.from(f,'base64')));
  console.log(name,frames.length,'transparent tier sprites');
 }
} finally {await browser.close();}
