import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {const page=await browser.newPage();for(const name of process.argv.slice(2)){
const frames=await page.evaluate(async ({b64,name})=>{
 const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();
 const sw=Math.floor(img.width/5),cells=[]; const rows=({refinery:[0,290,620,860,1122],magetower:[0,310,650,890,1122],oilrig:[0,295,690,900,1122],stables:[0,300,640,870,1122],foundry:[0,280,590,850,1122]})[name] ?? [0,img.height/4,img.height/2,img.height*3/4,img.height];
 for(let i=0;i<20;i++){const row=Math.floor(i/5),sh=rows[row+1]-rows[row];const c=document.createElement('canvas');c.width=sw;c.height=sh;const ctx=c.getContext('2d');ctx.drawImage(img,(i%5)*img.width/5,rows[row],img.width/5,sh,0,0,sw,sh);const d=ctx.getImageData(0,0,sw,sh).data;let l=sw,t=sh,r=0,b=0;for(let y=0;y<sh;y++)for(let x=0;x<sw;x++)if(d[(y*sw+x)*4+3]>24){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}cells.push({c,l,t,r,b});}
 const cw=Math.max(...cells.slice(10).map(f=>f.r-f.l+1))+4,ch=Math.max(...cells.slice(10).map(f=>f.b-f.t+1))+4;
 return cells.map((f,i)=>{const c=document.createElement('canvas'),w=f.r-f.l+1,h=f.b-f.t+1;c.width=i<10?w+4:cw;c.height=i<10?h+4:ch;c.getContext('2d').drawImage(f.c,f.l,f.t,w,h,(c.width-w)/2,c.height-h-2,w,h);return c.toDataURL('image/webp',.94).split(',')[1];});
},{b64:readFileSync(`src/assets/redesign/${name}.png`).toString('base64'),name});
mkdirSync(`src/assets/redesign/${name}`,{recursive:true});frames.forEach((f,i)=>writeFileSync(`src/assets/redesign/${name}/${i<10?'level':'build'}-${i%10+1}.webp`,Buffer.from(f,'base64')));console.log(name,frames.length);
}}finally{await browser.close();}
