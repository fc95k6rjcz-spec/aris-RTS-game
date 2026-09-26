/** Construction contact sheets sometimes leave a disconnected strip from the
 * previous row. Draw only the principal structure, preserving frame dimensions
 * and its ground anchor so construction does not jump between stages. */
const frames = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
export function constructionFrame(image: HTMLImageElement): HTMLCanvasElement {
  const cached=frames.get(image); if(cached)return cached;
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height), data=pixels.data;
  const width=canvas.width,count=width*canvas.height,labels=new Int32Array(count),queue=new Int32Array(count);
  let component=0,best=0,bestSize=0;
  for(let i=0;i<count;i++){
    if(labels[i] || data[i*4+3]!<24)continue;
    component++;let head=0,tail=1;queue[0]=i;labels[i]=component;
    while(head<tail){const at=queue[head++]!,x=at%width,y=Math.floor(at/width);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=canvas.height)continue;
        const next=ny*width+nx;if(labels[next]||data[next*4+3]!<24)continue;
        labels[next]=component;queue[tail++]=next;
      }
    }
    if(tail>bestSize){bestSize=tail;best=component;}
  }
  for(let i=0;i<count;i++){
    if(labels[i]===best)continue;
    // Preserve a one-pixel translucent fringe around the retained structure.
    let fringe=false;const x=i%width,y=Math.floor(i/width);
    if(data[i*4+3]!<24)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<canvas.height&&labels[(y+dy)*width+x+dx]===best)fringe=true;
    }
    if(!fringe)data[i*4+3]=0;
  }
  ctx.putImageData(pixels,0,0);frames.set(image,canvas);return canvas;
}
