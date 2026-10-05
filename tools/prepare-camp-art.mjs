import {chromium} from 'playwright';import {readFileSync,writeFileSync} from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{const p=await browser.newPage();const png=readFileSync('C:/Users/Mollie Lenthall/.codex/generated_images/01a0bb48-fb66-7cc3-942d-56f07fe684c0/exec-567ef458-bbb1-497b-9d0a-5f29dc701b00.png').toString('base64');
for(const [name,box] of [['campfire',[0,180,450,650]],['wall',[430,170,550,650]],['shelter',[965,180,571,670]]]){const result=await p.evaluate(async({png,box})=>{const i=new Image();i.src='data:image/png;base64,'+png;await i.decode();const c=document.createElement('canvas');c.width=box[2];c.height=box[3];c.getContext('2d').drawImage(i,...box,0,0,c.width,c.height);return c.toDataURL().split(',')[1];},{png,box});writeFileSync('src/assets/motion-v2/'+name+'.png',Buffer.from(result,'base64'));}}
finally{await browser.close();}

