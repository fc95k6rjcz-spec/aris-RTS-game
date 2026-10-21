import { WALL_TIERS, wallTierCost } from '../sim/world';
import { BUILDINGS } from '../data/buildings';
import { LEVELLED } from '../data/levels';
import { blueBannerArt } from '../render/blueBanner';

const select=document.querySelector<HTMLSelectElement>('#building')!;
const gallery=document.querySelector<HTMLDivElement>('#gallery')!;
const order=['townhall','tower','farm','golddepot','lumbermill','barracks','shipyard','church','stables','magetower','gryphonaviary','foundry','oilrig','refinery','airfactory','torch','wall','gate','shelter'];
select.add(new Option('All buildings','all'));
for(const id of order)select.add(new Option(BUILDINGS[id]!.name,id));
select.value='townhall';
function render():void {
  gallery.replaceChildren();
  const ids=select.value==='all'?order:[select.value];
  for(const id of ids){
    const section=document.createElement('section');
    const title=document.createElement('h2');title.textContent=BUILDINGS[id]!.name;
    const grid=document.createElement('div');grid.className='tiers';
    const table=LEVELLED[id]??WALL_TIERS.map((name,i)=>({level:i+1,name,cost:i?wallTierCost(i+1):{gold:0,lumber:0},hp:BUILDINGS[id]!.hp*Math.pow(2,i)}));
    for(const lv of table){
      const card=document.createElement('article');card.dataset.level=String(lv.level);
      const label=document.createElement('div');label.className='level';label.textContent='Level '+lv.level;
      const img=document.createElement('img');img.src=blueBannerArt(id,lv.level)!;img.alt=BUILDINGS[id]!.name+' — level '+lv.level;img.loading='lazy';
      const name=document.createElement('div');name.className='name';name.textContent=lv.name;
      const stats=document.createElement('div');stats.className='stats';stats.textContent=lv.hp.toLocaleString()+' health'+(lv.level>1?' · '+lv.cost.gold.toLocaleString()+' gold · '+lv.cost.lumber.toLocaleString()+' wood':' · Starting tier');
      card.append(label,img,name,stats);grid.append(card);
    }
    section.append(title,grid);gallery.append(section);
  }
}
select.addEventListener('change',render);render();
