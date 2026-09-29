// Cuts art-src/barracks/sheet-barracks.png (5 columns x 2 rows, transparent background)
// into src/assets/redesign/barracks/level-1.webp .. level-10.webp (the human barracks tiers), trimmed to their alpha bounds.
// Columns and rows are found from empty gutters, not an equal grid, because the painted
// sprites grow unevenly from tier to tier.
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
  const page=await browser.newPage();
  const input=readFileSync('art-src/barracks/sheet-barracks.png').toString('base64');
  const out=await page.evaluate(async input=>{
    const img=new Image();img.src='data:image/png;base64,'+input;await img.decode();
    const W=img.width,H=img.height,c=document.createElement('canvas');c.width=W;c.height=H;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
    const d=ctx.getImageData(0,0,W,H).data,solid=(x,y)=>d[(y*W+x)*4+3]>24;
    // Split a 1-D occupancy profile into exactly n runs by merging across the smallest gaps.
    const runs=(prof,n)=>{let r=[],s=-1;prof.forEach((v,i)=>{if(v&&s<0)s=i;if(!v&&s>=0){r.push([s,i-1]);s=-1;}});if(s>=0)r.push([s,prof.length-1]);
      while(r.length>n){let k=0;for(let i=1;i<r.length-1;i++)if(r[i+1][0]-r[i][1]<r[k+1][0]-r[k][1])k=i;r.splice(k,2,[r[k][0],r[k+1][1]]);}return r;};
    let opaque=0;for(let i=3;i<d.length;i+=4)if(d[i]>24)opaque++;
    const rowProf=Array.from({length:H},(_,y)=>{let n=0;for(let x=0;x<W;x++)if(solid(x,y))n++;return n>2;});
    const cells=[];
    for(const [y0,y1] of runs(rowProf,2)){
      const colProf=Array.from({length:W},(_,x)=>{let n=0;for(let y=y0;y<=y1;y++)if(solid(x,y))n++;return n>2;});
      for(const [x0,x1] of runs(colProf,5)){
        let t=y1,b=y0;for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(solid(x,y)){if(y<t)t=y;if(y>b)b=y;}
        const o=document.createElement('canvas');o.width=x1-x0+1;o.height=b-t+1;
        o.getContext('2d').drawImage(c,x0,t,o.width,o.height,0,0,o.width,o.height);
        cells.push({box:[x0,t,o.width,o.height],data:o.toDataURL('image/webp',.94).split(',')[1]});
      }
    }
    return {W,H,opaqueFraction:opaque/(W*H),cells};
  },input);
  console.log(`sheet ${out.W}x${out.H}, ${(out.opaqueFraction*100).toFixed(1)}% opaque`);
  mkdirSync('src/assets/redesign/barracks',{recursive:true});
  out.cells.forEach((cell,i)=>{writeFileSync(`src/assets/redesign/barracks/level-${i+1}.webp`,Buffer.from(cell.data,'base64'));console.log(`level-${i+1}`,cell.box.join(' '));});
}finally{await browser.close();}
