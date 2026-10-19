// The Exit button: asks first, saves a skirmish and goes to the menu; a Wars battle goes back to the campaign map.
import {chromium} from 'playwright';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
const exe=process.env.CHROME??(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/opt/pw-browsers/chromium-1194/chrome-linux/chrome');
const browser=await chromium.launch({executablePath:exe});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(resolve(process.env.DIST??'dist/index.html')).href);await page.waitForFunction(()=>window.game);
  await page.evaluate(()=>{localStorage.clear();const g=window.game;Object.assign(g.settingsForTest,{crowning:false,nomad:false,stockade:false,wildlife:false});g.start('normal');g.world.players.get(1).gold=4321;});
  await page.waitForTimeout(200);
  const exit=page.getByRole('button',{name:'Save and exit to menu',exact:true});
  await exit.click();
  await page.getByText('LEAVE THE GAME?').waitFor();
  await page.getByRole('button',{name:'Stay',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.game.menu),false,'Stay keeps playing');
  await exit.click();await page.screenshot({path:process.env.SHOT??'test/artifacts/exit-confirm.png'});
  await page.getByRole('button',{name:'Save & Exit',exact:true}).click();
  await page.waitForFunction(()=>window.game.menu===true);
  assert(await page.evaluate(()=>!!localStorage.getItem('realms-of-valor-save-v1')&&window.game.front.saveAvailable),'saved on exit');
  await page.evaluate(async()=>{await window.game.loadGame();});
  assert.equal(await page.evaluate(()=>window.game.world.players.get(1).gold),4321,'save resumes');
  // Wars: Exit returns to the campaign map
  await page.evaluate(()=>{window.game.openWars();});
  await page.getByRole('button',{name:/1\. First Stones/}).click();await page.getByRole('button',{name:'To Battle',exact:true}).click();
  await page.waitForFunction(()=>window.game.menu===false);
  await exit.click();await page.getByRole('button',{name:'Exit',exact:true}).click();
  await page.getByRole('dialog',{name:'Campaign atlas'}).waitFor();
  assert.equal(await page.evaluate(()=>window.game.menu),true);
  // Esc: with nothing selected it opens the Leave box; Esc again closes it.
  await page.getByRole('button',{name:'To Battle',exact:true}).count();
  await page.evaluate(()=>{const g=window.game;g.warsBox?.remove();g.warsBox=null;g.start('normal');g.selected.clear();});
  await page.keyboard.press('Escape');await page.getByText('LEAVE THE GAME?').waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.getByText('LEAVE THE GAME?').count(),0,'Esc closes the Leave box');
  assert.equal(await page.evaluate(()=>window.game.menu),false,'still playing');
  assert.deepEqual(errors,[]);
  console.log('PASS: Exit asks first, Save & Exit saves and returns to the menu, Wars exits to the campaign map, Esc opens and closes it');
}finally{await browser.close();}
