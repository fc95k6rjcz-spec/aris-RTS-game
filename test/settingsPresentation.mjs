import {chromium} from 'playwright';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{const p=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setContent(readFileSync('dist/index.html','utf8'));await p.waitForFunction(()=>window.game);await p.evaluate(()=>document.querySelector('.rts-gear').click());
const dialog=p.getByRole('dialog');await dialog.waitFor();
await p.getByRole('button',{name:'Game',exact:true}).click();assert.equal(await p.locator('.rts-group:visible').count(),1);
const bears=p.getByLabel('Bears in the woods'),was=await bears.isChecked();await bears.setChecked(!was);await p.getByRole('button',{name:'Done',exact:true}).click();await p.evaluate(()=>document.querySelector('.rts-gear').click());assert.equal(await bears.isChecked(),!was);await bears.setChecked(was);
await p.locator('.rts-settings-body').evaluate(e=>e.scrollTop=0);await p.screenshot({path:'test/artifacts/settings-game.png'});
await p.getByRole('button',{name:'Audio',exact:true}).click();await p.getByLabel('Master volume',{exact:true}).fill('0.45');await p.getByLabel('Master volume',{exact:true}).dispatchEvent('input');assert(await dialog.getByText('45%',{exact:true}).count());await p.screenshot({path:'test/artifacts/settings-audio.png'});
await p.setViewportSize({width:390,height:740});await p.getByRole('button',{name:'Game',exact:true}).click();await p.screenshot({path:'test/artifacts/settings-mobile.png'});const bounds=await dialog.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.height<=740);
await p.keyboard.press('Escape');assert(await dialog.isHidden());assert.deepEqual(errors,[]);console.log('PASS: settings categories, toggles, volume, reopen state, Escape and mobile bounds');}finally{await browser.close();}

