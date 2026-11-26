import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
const browser=await chromium.launchPersistentContext(resolve('.verificacion/perfil-alerta'),{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,viewport:{width:1440,height:900}});
const sql=q=>execFileSync('docker',['compose','exec','-T','postgres','sh','-c','psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA'],{input:q,encoding:'utf8'}).trim();
try {
 execFileSync('npm',['run','demo:reset'],{stdio:'pipe',timeout:180000});
 const page=await browser.newPage();await page.goto('http://localhost:5173/docente/ingreso');
 await page.getByLabel('Usuario o email institucional').fill('laura.gomez');await page.getByLabel('Contraseña',{exact:true}).fill('docente123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Mis cursos',exact:true})).toBeVisible();
 await page.goto('http://localhost:5173/docente/cursos?notificaciones=1');await expect(page.locator('.aviso')).toHaveCount(1);
 execFileSync('docker',['compose','run','--rm','-T','simulador','--alumnos','4','--segundos','0','--bajo-dominio','organelas'],{stdio:'pipe',timeout:120000});
 await expect(page.locator('.aviso').filter({hasText:'Organelas'})).toHaveCount(1,{timeout:12000});
 const visible=Date.now();
 // El umbral se cruza al acumular dos respuestas incorrectas sobre las 31 iniciales (13/33).
 const condicion=Number(sql(`WITH por_partida AS (SELECT p.id,p.finalizada_en,count(*)::int AS n FROM partidas p JOIN respuestas r ON r.partida_id=p.id JOIN preguntas q ON q.id=r.pregunta_id WHERE q.concepto_id='organelas' GROUP BY p.id), acumulado AS (SELECT finalizada_en,sum(n) OVER(ORDER BY finalizada_en,id) AS n FROM por_partida) SELECT extract(epoch FROM min(finalizada_en))*1000 FROM acumulado WHERE n>=2;`));
 const latencia=visible-condicion;
 await page.screenshot({path:'.verificacion/D8-final.png',fullPage:true});
 execFileSync('docker',['compose','run','--rm','-T','simulador','--alumnos','2','--segundos','0','--bajo-dominio','organelas'],{stdio:'pipe',timeout:120000});
 if(sql("SELECT count(*) FROM notificaciones WHERE concepto_id='organelas';")!=='1')throw Error('Organelas volvió a avisar');
 if(sql("SELECT count(*) FROM notificaciones WHERE concepto_id='mitosis';")!=='1')throw Error('Mitosis volvió a avisar');
 if(sql("SELECT count(*) FROM analitica_concepto WHERE curso_id<>'bio-2b';")!=='0')throw Error('Se alteró otro curso');
 const datos=JSON.parse(await readFile('docs/mediciones-fase2.json','utf8'));datos.alerta_condicion_a_ui_ms=Math.round(latencia);datos.alertas_organelas=1;datos.alertas_mitosis=1;datos.segunda_tanda_sin_duplicados=true;
 await writeFile('docs/mediciones-fase2.json',JSON.stringify(datos,null,2)+'\n');console.log('OK: umbral → notificación visible:',Math.round(latencia),'ms; dos tandas sin duplicar ni alertar otros cursos.');
} finally {await browser.close()}
