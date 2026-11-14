import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const WEB='http://localhost:5173';
const browser=await chromium.launchPersistentContext(resolve('.verificacion/perfil-estados'),{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,viewport:{width:390,height:844}});
const page=await browser.newPage();let postFinales=0;let cuerpoFinal;
page.on('request',r=>{if(r.method()==='POST' && r.url().endsWith('/api/partidas')){postFinales++;cuerpoFinal=r.postDataJSON()}});
const entrar=async(p,usuario='tomas')=>{await p.goto(WEB+'/alumno/ingreso');await p.getByLabel('Usuario',{exact:true}).fill(usuario);await p.getByLabel('Contraseña',{exact:true}).fill('alumno123');await p.getByRole('button',{name:'Entrar',exact:true}).click();await expect(p.getByRole('heading',{name:/Hola,/})).toBeVisible()};
try {
 await page.goto(WEB+'/alumno/ingreso');await page.evaluate(()=>localStorage.clear());
 for(const ruta of ['/alumno','/alumno/jugar','/alumno/partida','/alumno/resultado','/alumno/ranking','/alumno/progreso','/docente/cursos','/docente/cursos/bio-2b/analitica','/docente/cursos/bio-2b/conceptos/mitosis']){await page.goto(WEB+ruta);await expect(page).toHaveURL(WEB+'/alumno/ingreso')}
 await page.route('**/api/auth/login',r=>r.abort('connectionrefused'));
 await page.getByLabel('Usuario',{exact:true}).fill('tomas');await page.getByLabel('Contraseña',{exact:true}).fill('alumno123');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('alert')).toContainText('No pudimos conectar');await page.unroute('**/api/auth/login');
 await entrar(page,'alu-21');
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});if(await page.locator('.alumno-marco').evaluate(e=>e.getBoundingClientRect().width)>390)throw Error('Marco alumno mayor de 390');if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Desborde alumno')}
 await page.setViewportSize({width:390,height:844});
 await page.goto(WEB+'/alumno/jugar?curso=bio-2b');const p=page.waitForResponse(r=>r.url().includes('partida-nueva?'));await page.getByRole('button',{name:'¡Empezar!'}).click();const {preguntas}=await (await p).json();
 // Una pregunta vence realmente; debe registrarse null/20000 y mostrar A7.
 await expect(page.getByRole('button',{name:'Entendido, seguir',exact:true})).toBeVisible({timeout:23000});await page.screenshot({path:'.verificacion/A7-final.png',fullPage:true});await page.getByRole('button',{name:'Entendido, seguir',exact:true}).click();
 const soluciones=JSON.parse(execFileSync('docker',['compose','exec','-T','postgres','sh','-c',`psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT jsonb_object_agg(id,respuesta) FROM preguntas WHERE minijuego='trivia'"`],{encoding:'utf8'}));
 await page.route('**/api/partidas/*/ranking',r=>r.fulfill({status:200,contentType:'application/json',body:'{"estado":"pendiente"}'}));
 for(let i=1;i<preguntas.length;i++){
  await page.locator('.opcion').filter({hasText:soluciones[preguntas[i].pregunta_id]}).click();const boton=page.getByRole('button',{name:i===preguntas.length-1?'Ver resultado':'Siguiente',exact:true});await expect(boton).toBeVisible();if(i===1)await page.screenshot({path:'.verificacion/A6-final.png',fullPage:true});if(i===preguntas.length-1)await boton.dblclick();else await boton.click();
 }
 await expect(page.getByText('Actualizando tu posición…',{exact:true})).toBeVisible();await page.screenshot({path:'.verificacion/A12-final.png',fullPage:true});
 await expect(page.getByRole('alert')).toContainText('El ranking está tardando',{timeout:12000});await page.unroute('**/api/partidas/*/ranking');await page.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(page.locator('[data-ranking-visible]')).toBeVisible();
 if(postFinales!==1 || cuerpoFinal.respuestas[0].respuesta_dada!==null || cuerpoFinal.respuestas[0].tiempo_ms!==20000)throw Error('Envío duplicado o timeout incorrecto');
 await page.getByRole('link',{name:'Ver ranking',exact:true}).click();let consultas=0;page.on('request',r=>{if(/\/partidas\/[^/]+\/ranking$/.test(r.url()))consultas++});await page.waitForTimeout(1200);if(consultas)throw Error('Polling siguió tras desmontar');
 await page.goto(WEB+'/docente/cursos');await expect(page).toHaveURL(WEB+'/alumno');
 // JWT firmado de vida breve para probar vencimiento mientras la pantalla está abierta.
 const token=execFileSync('docker',['compose','exec','-T','api','node','--input-type=module','-e',`import {createHmac} from 'node:crypto';const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const p=Buffer.from(JSON.stringify({id:'alu-21',rol:'alumno',exp:Math.floor(Date.now()/1000)+5})).toString('base64url');console.log(h+'.'+p+'.'+createHmac('sha256',process.env.JWT_SECRET).update(h+'.'+p).digest('base64url'));`],{encoding:'utf8'}).trim();
 await page.evaluate(t=>localStorage.setItem('studyleague.sesion',JSON.stringify({token:t,rol:'alumno',id:'alu-21',nombre:'Alumno de prueba'})),token);await page.reload();await expect(page.getByRole('heading',{name:/Hola,/})).toBeVisible();await expect(page).toHaveURL(WEB+'/alumno/ingreso',{timeout:7000});
 const privada=await browser.newPage();await privada.addInitScript(()=>{for(const metodo of ['getItem','setItem','removeItem'])Object.defineProperty(Storage.prototype,metodo,{value(){throw Error('Storage bloqueado')}})});await entrar(privada,'alu-22');await privada.close();
 console.log('OK: rutas sin token, roles, API caída, marcos 390/768/1440, tiempo agotado null/20000, un POST ante doble clic, A12 timeout/reintento, polling cancelado, JWT vencido y localStorage bloqueado.');
}finally{await browser.close()}
