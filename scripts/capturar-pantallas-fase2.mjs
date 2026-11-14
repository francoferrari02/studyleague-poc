import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';
const browser=await chromium.launchPersistentContext(resolve('.verificacion/perfil-capturas'),{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,viewport:{width:390,height:844}});
try {
 const page=await browser.newPage();await page.goto('http://localhost:5173/alumno/ingreso');await page.evaluate(()=>localStorage.clear());await page.reload();await page.screenshot({path:'.verificacion/A1-final.png',fullPage:true});
 await page.getByLabel('Usuario',{exact:true}).fill('tomas');await page.getByLabel('Contraseña',{exact:true}).fill('alumno123');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('heading',{name:'Hola, Tomás'})).toBeVisible();await page.screenshot({path:'.verificacion/A3-final.png',fullPage:true});
 await page.goto('http://localhost:5173/alumno/jugar?curso=bio-2b');await expect(page.getByRole('button',{name:'¡Empezar!'})).toBeVisible();await page.screenshot({path:'.verificacion/A4-final.png',fullPage:true});
 await page.goto('http://localhost:5173/alumno/ranking?curso=bio-2b');await expect(page.locator('.podio')).toBeVisible();await page.screenshot({path:'.verificacion/A14-final.png',fullPage:true});
 await page.locator('.ranking-lista .propia').scrollIntoViewIfNeeded();await expect(page.locator('.ranking-fija')).toHaveCount(0);
 await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await expect(page.locator('.ranking-fija')).toHaveCount(1);
 await page.goto('http://localhost:5173/alumno');await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.goto('http://localhost:5173/docente/ingreso');await page.setViewportSize({width:1440,height:900});await page.screenshot({path:'.verificacion/D1-final.png',fullPage:true});
 await page.getByLabel('Usuario o email institucional').fill('laura.gomez');await page.getByLabel('Contraseña',{exact:true}).fill('docente123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page.getByRole('heading',{name:'Mis cursos',exact:true})).toBeVisible();await page.screenshot({path:'.verificacion/D2-final.png',fullPage:true});
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:900});await page.goto('http://localhost:5173/docente/cursos/bio-2b/analitica');await expect(page.getByRole('heading',{name:/Analítica/})).toBeVisible();if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Desborde docente '+width);await page.screenshot({path:`.verificacion/D6-final-${width}.png`,fullPage:true});}
 await page.setViewportSize({width:1440,height:900});await page.goto('http://localhost:5173/docente/cursos/bio-2b/conceptos/mitosis');await expect(page.getByRole('heading',{name:'Mitosis',exact:true})).toBeVisible();await page.screenshot({path:'.verificacion/D7-final.png',fullPage:true});
 console.log('OK: capturas finales A1/A3/A4/A14/D1/D2/D6/D7; fila propia sticky; docente sin desbordes a 1440/768/390.');
} finally {await browser.close()}
