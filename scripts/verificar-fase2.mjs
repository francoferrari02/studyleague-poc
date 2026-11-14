/** Chrome usa perfiles/temporales dentro del proyecto. No instala navegadores. */
import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const WEB=process.env.WEB_URL ?? 'http://localhost:5173';
await mkdir('.verificacion/tmp',{recursive:true});
const errores=[];
const browser=await chromium.launchPersistentContext(resolve('.verificacion/perfil-fase2'),{executablePath:process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,viewport:{width:390,height:844}});
const page=await browser.newPage();
page.on('pageerror',e=>errores.push(e.message));
const peticion=async(ruta,cuerpo,token,metodo)=>{
 const res=await fetch('http://localhost:3000'+ruta,{method:metodo ?? (cuerpo ? 'POST':'GET'),headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:cuerpo?JSON.stringify(cuerpo):undefined});
 return {status:res.status,body:await res.json()};
};
const screenshot=async(name)=>page.screenshot({path:`.verificacion/${name}.png`,fullPage:true});
try {
 await page.goto(WEB+'/alumno/ingreso');
 await expect(page.getByRole('button',{name:'Entrar como Tomás',exact:true})).toHaveCount(0);
 await screenshot('A1');
 await page.getByLabel('Usuario',{exact:true}).fill('tomas');await page.getByLabel('Contraseña',{exact:true}).fill('incorrecta');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Usuario o clave incorrectos');
 await page.getByLabel('Contraseña',{exact:true}).fill('alumno123');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Hola, Tomás'})).toBeVisible();await screenshot('A3');
 await page.goto(WEB+'/docente/cursos');await expect(page).toHaveURL(WEB+'/alumno');
 const alumno=(await peticion('/auth/alumno',{usuario:'tomas',clave:'alumno123'})).body;
 // Soluciones exclusivamente internas de la prueba, fuera de la API de preguntas.
 const soluciones=JSON.parse(execFileSync('docker',['compose','exec','-T','postgres','sh','-c',`psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT jsonb_object_agg(id,respuesta) FROM preguntas WHERE minijuego='trivia'"`],{encoding:'utf8'}));
 const preguntas=(await peticion('/cursos/bio-2b/partida-nueva?minijuego=trivia',null,alumno.token)).body.preguntas;
 if(preguntas.some(p=>'respuesta_correcta' in p || 'respuesta' in p || 'explicacion' in p))throw Error('B2 revela soluciones');
 const fallar=p=>p.concepto_id==='organelas';
 const muestras=[];
 for(let partida=0;partida<20;partida++) {
  // Una partida por alumno evita que el benchmark de clics instantáneos agote el límite del feedback.
  if(partida>0) {
   await page.goto(WEB+'/alumno'); await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
   await page.getByLabel('Usuario',{exact:true}).fill(`alu-${String(partida+1).padStart(2,'0')}`);
   await page.getByLabel('Contraseña',{exact:true}).fill('alumno123');await page.getByRole('button',{name:'Entrar',exact:true}).click();
   await expect(page.getByRole('heading',{name:/Hola,/})).toBeVisible();
  }
  await page.goto(WEB+'/alumno/jugar?curso=bio-2b');await expect(page.getByRole('button',{name:'¡Empezar!'})).toBeVisible();if(!partida)await screenshot('A4');
  const reqPreguntas=page.waitForResponse(r=>r.url().includes('/partida-nueva?'));
  await page.getByRole('button',{name:'¡Empezar!'}).click();
  const {preguntas: lote}=await (await reqPreguntas).json();
  await expect(page.locator('.opcion').first()).toBeVisible();if(!partida)await screenshot('A5');
  for(let i=0;i<lote.length;i++) {
   const p=lote[i];const opcion=fallar(p) ? p.opciones.find(o=>o!==soluciones[p.pregunta_id]) : soluciones[p.pregunta_id];
   await page.locator('.opcion').filter({hasText:opcion}).click();
   const siguiente=page.getByRole('button',{name:i===lote.length-1?'Ver resultado':fallar(p)?'Entendido, seguir':'Siguiente',exact:true});
   await expect(siguiente).toBeVisible();if(!partida && (i===0 || fallar(p)))await screenshot(fallar(p)?'A7':'A6');
   if(i===lote.length-1) {
    const t0=performance.now();await siguiente.dblclick();
    await expect(page.locator('[data-ranking-visible]')).toBeVisible({timeout:10000});muestras.push(Math.round(performance.now()-t0));
   } else await siguiente.click();
  }
  if(!partida)await screenshot('A13');
  console.log('Partida',partida+1,'/20; puesto visible en',muestras.at(-1),'ms');
 }
 await page.getByRole('link',{name:'Ver ranking',exact:true}).click();await expect(page.locator('.podio')).toBeVisible();await screenshot('A14');
 if((await page.locator('body').innerText()).match(/alu-\d\d|doc-laura|bio-2b/))throw Error('Ids internos visibles');
 await page.evaluate(()=>localStorage.setItem('studyleague.sesion',JSON.stringify({token:'vencido',rol:'alumno',id:'alu-01',nombre:'Tomás R.'})));
 await page.reload();await expect(page).toHaveURL(/\/alumno\/ingreso$/);
 await page.goto(WEB+'/docente/ingreso');await page.setViewportSize({width:1440,height:900});await screenshot('D1');
 await page.getByLabel('Usuario o email institucional').fill('laura.gomez');await page.getByLabel('Contraseña',{exact:true}).fill('docente123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Mis cursos',exact:true})).toBeVisible();await screenshot('D2');
 await page.getByRole('link',{name:/Biología · 2.º B/}).click();await expect(page.getByRole('heading',{name:/Analítica/})).toBeVisible();await screenshot('D6');
 await page.getByRole('link',{name:'Mitosis',exact:true}).last().click();await expect(page.getByRole('heading',{name:'Mitosis',exact:true})).toBeVisible();await screenshot('D7');
 // Reset para medir únicamente la nueva alerta de Organelas en D8.
 execFileSync('npm',['run','demo:reset'],{stdio:'pipe',timeout:180000});
 await page.goto(WEB+'/docente/cursos?notificaciones=1');await expect(page.getByRole('heading',{name:'Notificaciones',exact:true})).toBeVisible();
 await expect(page.locator('.aviso')).toHaveCount(1);
 const inicioAlerta=performance.now();
 execFileSync('docker',['compose','run','--rm','-T','simulador','--alumnos','4','--segundos','0','--bajo-dominio','organelas'],{stdio:'pipe',timeout:120000});
 await expect(page.locator('.aviso').filter({hasText:'Organelas'})).toHaveCount(1,{timeout:15000});
 const alertaMs=Math.round(performance.now()-inicioAlerta);
 await screenshot('D8');
 const docente=(await peticion('/auth/docente',{usuario:'laura.gomez',clave:'docente123'})).body;
 const avisos=(await peticion('/docentes/yo/notificaciones',null,docente.token)).body;
 if(avisos.notificaciones.filter(n=>n.concepto_id==='mitosis').length!==1 || avisos.notificaciones.filter(n=>n.concepto_id==='organelas').length!==1)throw Error('Alertas duplicadas');
 await page.locator('.aviso').filter({hasText:'Organelas'}).click();await expect(page.getByRole('heading',{name:'Organelas',exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});await screenshot('D7-movil');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Desborde móvil');
 const n=(await peticion('/docentes/yo/notificaciones',null,docente.token)).body.notificaciones.find(n=>n.concepto_id==='organelas');if(!n.leida)throw Error('No se marcó leída');
 const ordenadas=[...muestras].sort((a,b)=>a-b);const resultados={muestras:muestras.length,p50_ms:ordenadas[Math.ceil(.5*ordenadas.length)-1],p95_ms:ordenadas[Math.ceil(.95*ordenadas.length)-1],max_ms:ordenadas.at(-1),valores_ms:muestras,alerta_desde_inicio_simulador_ms:alertaMs,errores_navegador:errores};
 await writeFile('docs/mediciones-fase2.json',JSON.stringify(resultados,null,2)+'\n');console.log(JSON.stringify(resultados));
 if(resultados.p95_ms>=3000 || errores.length)throw Error('SLO o errores de navegador');
} finally { await browser.close(); }
