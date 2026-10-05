import type { ArtCtx } from './buildingArt';

/** Stone gatehouse with recessed oak doors, masonry arch and flanking piers. */
export function drawGate(a: ArtCtx): void {
  const {ctx,w,x,y}=a;
  ctx.save();ctx.translate(x,y);ctx.scale(w,w);
  const rect=(x:number,y:number,w:number,h:number,color:string)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
  const line=(x:number,y:number,xx:number,yy:number,color:string,width=.012)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.stroke();};
  const masonry=(x:number,y:number,width:number,height:number,seed:number)=>{
    rect(x,y,width,height,'#504a3c');
    const colors=['#a69b7d','#91876e','#b0a487','#857e67','#9d947b'];
    const rows=Math.ceil(height/.12);
    for(let r=0;r<rows;r++)for(let c=-1;c<Math.ceil(width/.18);c++){
      const sx=x+c*.18+(r%2)*.09,sy=y+r*.12;
      const left=Math.max(x,sx),right=Math.min(x+width,sx+.176);
      if(right<=left)continue;
      const h=Math.min(.115,y+height-sy);
      rect(left,sy,right-left,h,colors[(r*7+c*3+seed+100)%colors.length]!);
      line(left,sy+.009,right,sy+.009,'#c8b99a',.006);
      line(left,sy+h,right,sy+h,'#625a49',.008);
    }
  };
  ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.ellipse(.54,.99,.73,.14,0,0,Math.PI*2);ctx.fill();
  // Raised rear face and shadowed right return establish the wall's depth.
  ctx.fillStyle='#b9ad8e';ctx.beginPath();ctx.moveTo(-.09,-.16);ctx.lineTo(.05,-.29);ctx.lineTo(1.15,-.29);ctx.lineTo(1.01,-.16);ctx.closePath();ctx.fill();
  ctx.fillStyle='#625d4d';ctx.beginPath();ctx.moveTo(1.01,-.16);ctx.lineTo(1.15,-.29);ctx.lineTo(1.15,.85);ctx.lineTo(1.01,.99);ctx.closePath();ctx.fill();
  masonry(-.09,-.16,1.10,1.15,2);
  const arch=(radius:number)=>{
    ctx.beginPath();ctx.moveTo(.5-radius,1);ctx.lineTo(.5-radius,.60);
    ctx.arc(.5,.60,radius,Math.PI,Math.PI*2);ctx.lineTo(.5+radius,1);ctx.closePath();
  };
  // Deep passage, with a lit stone threshold and dark jambs.
  arch(.33);ctx.fillStyle='#211e18';ctx.fill();
  rect(.20,.91,.60,.09,'#756b54');line(.20,.925,.80,.925,'#b5a583',.012);
  const opening=Math.max(0,Math.min(1,a.openAmount??(a.open?1:0)));
  ctx.save();arch(.30);ctx.clip();
  const oak=ctx.createLinearGradient(.2,.3,.8,1);oak.addColorStop(0,'#a2753c');oak.addColorStop(.48,'#765026');oak.addColorStop(1,'#432e1c');
  for(const side of [-1,1]){
    const width=.30*(1-opening*.89),start=side<0?.20:.80-width;
    ctx.fillStyle=oak;ctx.fillRect(start,.27,width,.72);
    for(let i=1;i<5;i++){const px=start+width*i/5;line(px,.28,px,.99,'#3c2a19',.009);line(px+.012,.3,px+.012,.98,'#b18246',.004);}
    for(const height of [.56,.79]){
      rect(start,height,width,.035,'#282b29');line(start,height,start+width,height,'#747267',.006);
      for(let i=0;i<3;i++){ctx.fillStyle='#b5a786';ctx.beginPath();ctx.arc(start+width*(i+.5)/3,height+.017,.006,0,Math.PI*2);ctx.fill();}
    }
    line(start+.015,.91,start+width-.015,.64,'#2b2c29',.025);
  }
  if(opening<.2){line(.5,.32,.5,.99,'#261d15',.016);for(const px of [.465,.535]){ctx.strokeStyle='#aba28a';ctx.lineWidth=.01;ctx.beginPath();ctx.arc(px,.70,.018,0,Math.PI*2);ctx.stroke();}}
  ctx.restore();
  // Wedge-shaped arch stones read as real masonry rather than a drawn outline.
  for(let i=0;i<11;i++){
    const start=Math.PI+i*Math.PI/11+.012,end=Math.PI+(i+1)*Math.PI/11-.012;
    ctx.beginPath();ctx.arc(.5,.60,.43,start,end);ctx.arc(.5,.60,.33,end,start,true);ctx.closePath();
    ctx.fillStyle=i%3===0?'#c1b291':i%3===1?'#a7987b':'#b6a787';ctx.fill();ctx.strokeStyle='#625947';ctx.lineWidth=.009;ctx.stroke();
  }
  for(const px of [.07,.82]){masonry(px,.60,.11,.39,3);line(px,.60,px,.98,'#c7b997',.009);}
  // Buttressed piers, capstones and crenels frame the opening.
  for(const px of [-.13,.91]){
    masonry(px,-.23,.22,1.22,4);rect(px-.025,.84,.27,.15,'#82765d');line(px-.025,.84,px+.245,.84,'#c5b38d',.015);
    rect(px-.025,-.25,.27,.07,'#c0b18d');line(px-.025,-.18,px+.245,-.18,'#655b47',.014);
    for(let i=0;i<2;i++){masonry(px+i*.13,-.39,.095,.14,i);rect(px+i*.13,-.40,.095,.025,'#d0c19e');}
    rect(px+.075,.18,.055,.19,'#34342c');line(px+.07,.17,px+.07,.38,'#c1b08c',.009);
  }
  for(let i=0;i<4;i++){const px=.13+i*.205;masonry(px,-.27,.12,.13,i);rect(px,-.28,.12,.025,'#c8ba98');}
  // Small hanging heraldry, leaving the gate's silhouette unobstructed.
  rect(.443,-.13,.114,.24,'#3f392a');rect(.45,-.13,.10,.21,a.color);
  ctx.fillStyle=a.color;ctx.beginPath();ctx.moveTo(.45,.08);ctx.lineTo(.50,.14);ctx.lineTo(.55,.08);ctx.closePath();ctx.fill();
  line(.45,-.13,.55,-.13,'#d9c186',.018);line(.50,-.08,.50,.055,'#ddc688',.009);line(.47,-.025,.53,-.025,'#ddc688',.009);
  ctx.restore();
}
