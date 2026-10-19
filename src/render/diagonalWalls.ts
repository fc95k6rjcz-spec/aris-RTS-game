/** Extruded masonry: ground direction changes, but stone courses stay upright. */
export function drawDiagonalWall(ctx: CanvasRenderingContext2D,x:number,y:number,w:number,mask:number,texture?:CanvasImageSource,level=1):void {
  ctx.save();ctx.translate(x+w*.5,y+w*.5);ctx.scale(w,w);ctx.lineJoin='round';
  const arms=[[1,0,-1],[2,1,0],[4,0,1],[8,-1,0],[16,1,-1],[32,1,1],[64,-1,1],[128,-1,-1]];
  const segments=arms.filter(([bit])=>(mask||10)&bit!).sort((a,b)=>a[2]!-b[2]!);
  const h=.46+Math.min(10,Math.max(1,level))*.014,half=.13;
  const polygon=(points:number[][],fill:string)=>{
    ctx.beginPath();points.forEach(([px,py],i)=>i?ctx.lineTo(px!,py!):ctx.moveTo(px!,py!));ctx.closePath();ctx.fillStyle=fill;ctx.fill();
  };
  for(const [,dx,dy] of segments){
    const length=Math.hypot(dx!,dy!);const nx=-dy!/length*half,ny=dx!/length*half;
    // Slight overlap at centres and tile boundaries prevents subpixel seams.
    const ax=-dx!*.018,ay=-dy!*.018,bx=dx!*.515,by=dy!*.515;
    const corners=[[ax+nx,ay+ny],[bx+nx,by+ny],[bx-nx,by-ny],[ax-nx,ay-ny]];
    // Draw the exposed lengthwise face, never a cap at a connected tile edge.
    const sign=ny>=0?1:-1;
    const sx=ax+nx*sign,sy=ay+ny*sign,ex=bx+nx*sign,ey=by+ny*sign;
    const face=[[sx,sy],[ex,ey],[ex,ey-h],[sx,sy-h]];
    const shade=dy===dx?'#77786d':'#969585';
    polygon(face,shade);
    ctx.save();ctx.beginPath();face.forEach(([px,py],i)=>i?ctx.lineTo(px!,py!):ctx.moveTo(px!,py!));ctx.closePath();ctx.clip();
    if(texture){
      const image=texture as HTMLImageElement|HTMLCanvasElement;
      const iw='naturalWidth' in image?image.naturalWidth:image.width,ih='naturalHeight' in image?image.naturalHeight:image.height;
      // Only map the approved wall's front masonry panel, keeping its face upright.
      ctx.save();ctx.transform(ex-sx,ey-sy,0,1,sx,sy);ctx.drawImage(image,iw*.31,ih*.58,iw*.38,ih*.27,0,-h,1,h);ctx.restore();
    }
    ctx.globalAlpha=texture ? 0 : .65;
    for(let course=0;course<6;course++){
      const z=course*.1;
      ctx.strokeStyle=course%2?'#625f51':'#6d695b';ctx.lineWidth=.012;
      ctx.beginPath();ctx.moveTo(sx,sy-z);ctx.lineTo(ex,ey-z);ctx.stroke();
      // Vertical joints follow each stone course, rather than slanting with the wall.
      for(let j=0;j<4;j++){
        const t=(j+(course%2)*.5)/3;if(t>1)continue;
        const px=sx+(ex-sx)*t,py=sy+(ey-sy)*t-z;
        ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px,py-.1);ctx.stroke();
      }
    }
    ctx.restore();
    polygon(corners.map(([px,py])=>[px!,py!-h]),level<4?'#ac8455':'#b8b19a');
    // Shared spacing puts a merlon at each tile centre and each connection.
    for(const t of [0,.5,1]){
      const px=ax+(bx-ax)*t,py=ay+(by-ay)*t;
      const ux=dx!/length*.055,uy=dy!/length*.055;
      const base=[[px-ux+nx,py-uy+ny-h],[px+ux+nx,py+uy+ny-h],[px+ux-nx,py+uy-ny-h],[px-ux-nx,py-uy-ny-h]];
      const front=ny>=0?[base[0]!,base[1]!]:[base[3]!,base[2]!];
      polygon([front[0]!,front[1]!,[front[1]![0]!,front[1]![1]!-.10],[front[0]![0]!,front[0]![1]!-.10]],shade);
      polygon(base.map(([xx,yy])=>[xx!,yy!-.10]),'#c9c0a5');
    }
  }
  ctx.restore();
}
