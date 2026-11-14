import { chromium } from '@playwright/test';
import { readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
await mkdir('.verificacion/referencias',{recursive:true});
const browser=await chromium.launchPersistentContext(resolve('.verificacion/perfil-referencias'),{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 for(const file of await readdir('.tmp-mockups')) {
  if(!/^(A1 |A3 |A4 |A5 |A6 |A7 |A12 |A13 |A14 |D1 |D2 |D6 |D7 |D8 )/.test(file))continue;
  const docente=file.startsWith('D');const page=await browser.newPage();await page.setViewportSize({width:docente?1440:390,height:docente?900:844});
  await page.goto('file://'+resolve('.tmp-mockups',file));await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`.verificacion/referencias/${file.split(' ')[0]}.png`});await page.close();
 }
} finally {await browser.close()}
console.log('Referencias capturadas.');
