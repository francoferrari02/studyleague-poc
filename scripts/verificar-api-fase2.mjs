import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const base='http://localhost:3000';
const pedir=async(ruta,{token,cuerpo,metodo}={})=>{
 const r=await fetch(base+ruta,{method:metodo??(cuerpo?'POST':'GET'),headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:cuerpo?JSON.stringify(cuerpo):undefined});return{status:r.status,headers:r.headers,body:await r.json()};
};
const login=async(usuario,clave='docente123',rol='docente')=>(await pedir('/auth/login',{cuerpo:{usuario,clave,rol}})).body;
const sql=q=>execFileSync('docker',['compose','exec','-T','postgres','sh','-c','psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA'],{input:q,encoding:'utf8'}).trim();
for(let i=0;;i++){try{if((await pedir('/salud')).status===200)break}catch(e){if(i===50)throw e}await new Promise(r=>setTimeout(r,200))}
const alumno=await login('tomas','alumno123','alumno');const laura=await login('laura.gomez');const otro=await login('docente.demo');
const firmaSeed=()=>sql("SELECT jsonb_agg(to_jsonb(a) ORDER BY concepto_id) FROM analitica_concepto a WHERE curso_id='bio-2b';");
const agregadosAntes=firmaSeed();const rankingAntes=(await pedir('/cursos/bio-2b/ranking',{token:alumno.token})).body.ranking;
for(let i=0;i<2;i++)sql(readFileSync('infra/postgres/init/003_demo_cursos.sql','utf8'));
assert.equal(firmaSeed(),agregadosAntes);assert.deepEqual((await pedir('/cursos/bio-2b/ranking',{token:alumno.token})).body.ranking,rankingAntes);
const cursosLaura=(await pedir('/docentes/yo/cursos',{token:laura.token})).body.cursos.map(c=>c.id).sort();
const cursosOtro=(await pedir('/docentes/yo/cursos',{token:otro.token})).body.cursos.map(c=>c.id).sort();
assert.deepEqual(cursosLaura,['bio-2b','bio-3a','naturales-1c']);assert.deepEqual(cursosOtro,['historia-2b','matematica-2b']);
for(const c of cursosLaura)assert.equal((await pedir(`/cursos/${c}/analitica`,{token:otro.token})).status,403);
for(const c of cursosOtro)assert.equal((await pedir(`/cursos/${c}/analitica`,{token:laura.token})).status,403);
for(const ruta of ['/alumnos/yo/inicio','/cursos/bio-2b/ranking','/docentes/yo/cursos','/docentes/yo/notificaciones','/cursos/bio-2b/conceptos/mitosis'])assert.equal((await pedir(ruta)).status,401);
for(const ruta of ['/docentes/yo/cursos','/docentes/yo/notificaciones','/cursos/bio-2b/analitica','/cursos/bio-2b/conceptos/mitosis'])assert.equal((await pedir(ruta,{token:alumno.token})).status,403);
const home=(await pedir('/alumnos/yo/inicio',{token:alumno.token})).body;
assert.deepEqual(home.cursos.map(c=>c.id).sort(),['bio-2b','historia-2b','matematica-2b']);
const listado=await pedir('/cursos/bio-2b/partida-nueva?minijuego=trivia',{token:alumno.token});assert.equal(listado.status,200);
for(const p of listado.body.preguntas)for(const campo of ['respuesta_correcta','respuesta','explicacion'])assert.equal(campo in p,false);
// Sesión de partida: la arma el servidor con las preguntas asignadas.
const {sesion,partida_id:partidaListado}=listado.body;assert.equal(typeof sesion,'string');assert.equal(typeof listado.body.cuenta_para_ranking,'boolean');
assert.equal('sesion' in (await pedir('/cursos/bio-2b/partida-nueva?minijuego=trivia',{token:laura.token})).body,false);
const ruta='/cursos/bio-2b/preguntas/mitosis-p1/correccion';
assert.equal((await pedir(ruta,{cuerpo:{respuesta_dada:'Anafase',sesion}})).status,401);
assert.equal((await pedir(ruta,{token:laura.token,cuerpo:{respuesta_dada:'Anafase',sesion}})).status,403);
assert.equal((await pedir('/cursos/bio-3a/preguntas/mitosis-p1/correccion',{token:alumno.token,cuerpo:{respuesta_dada:'Anafase',sesion}})).status,403);
assert.equal((await pedir('/cursos/historia-2b/preguntas/mitosis-p1/correccion',{token:alumno.token,cuerpo:{respuesta_dada:'Anafase',sesion}})).status,404);
assert.equal((await pedir(ruta,{token:alumno.token,cuerpo:{respuesta_dada:'Anafase'}})).status,400);
assert.equal((await pedir(ruta,{token:alumno.token,cuerpo:{respuesta_dada:'Anafase',sesion:sesion.slice(0,-2)+'xx'}})).status,400);
const antes=sql('SELECT (SELECT count(*) FROM partidas)||\':\'||(SELECT count(*) FROM outbox)||\':\'||(SELECT count(*) FROM respuestas);');
assert.deepEqual((await pedir(ruta,{token:alumno.token,cuerpo:{respuesta_dada:'Anafase',sesion}})).body,{correcta:true,respuesta_correcta:'Anafase',explicacion:'En la anafase las cromátidas hermanas se separan y viajan a polos opuestos de la célula. En la metafase todavía están alineadas en el centro.'});
// Vale la primera respuesta corregida: volver a consultar con otra no la cambia.
assert.equal((await pedir(ruta,{token:alumno.token,cuerpo:{respuesta_dada:null,sesion}})).body.correcta,true);
assert.equal(sql('SELECT (SELECT count(*) FROM partidas)||\':\'||(SELECT count(*) FROM outbox)||\':\'||(SELECT count(*) FROM respuestas);'),antes);
const cuentaPrevia=Number(sql("SELECT count(*) FROM respuestas r JOIN partidas p ON p.id=r.partida_id WHERE p.curso_id='bio-2b' AND r.pregunta_id='mitosis-p1' AND r.respuesta_dada #>> '{}' = 'Metafase';"));
// POST /partidas: sin sesión, con preguntas que no son las asignadas o cambiando una respuesta ya corregida → 400.
const todas=listado.body.preguntas.map(p=>({pregunta_id:p.pregunta_id,respuesta_dada:null,tiempo_ms:20000}));
assert.equal((await pedir('/partidas',{token:alumno.token,cuerpo:{curso_id:'bio-2b',minijuego:'trivia',respuestas:todas}})).status,400);
assert.equal((await pedir('/partidas',{token:alumno.token,cuerpo:{sesion,curso_id:'bio-2b',minijuego:'trivia',respuestas:todas.slice(1)}})).status,400);
assert.equal((await pedir('/partidas',{token:alumno.token,cuerpo:{sesion,partida_id:randomUUID(),curso_id:'bio-2b',minijuego:'trivia',respuestas:todas}})).status,400);
assert.equal((await pedir('/partidas',{token:alumno.token,cuerpo:{sesion,curso_id:'bio-2b',minijuego:'trivia',respuestas:todas.map(r=>r.pregunta_id==='mitosis-p1'?{...r,respuesta_dada:'Metafase'}:r)}})).status,400);
assert.equal(sql(`SELECT count(*) FROM partidas WHERE id='${partidaListado}';`),'0');
// Una segunda partida del mismo día es de práctica.
const nueva=(await pedir('/cursos/bio-2b/partida-nueva?minijuego=trivia',{token:alumno.token})).body;assert.equal(nueva.cuenta_para_ranking,false);
const id=nueva.partida_id;const cuerpo={sesion:nueva.sesion,partida_id:id,curso_id:'bio-2b',minijuego:'trivia',respuestas:nueva.preguntas.map(p=>({pregunta_id:p.pregunta_id,respuesta_dada:p.pregunta_id==='mitosis-p1'?'Metafase':null,tiempo_ms:1000}))};
const dobles=await Promise.all([pedir('/partidas',{token:alumno.token,cuerpo}),pedir('/partidas',{token:alumno.token,cuerpo})]);
assert.ok(dobles.every(r=>r.status===202&&r.body.cuenta_para_ranking===false));assert.equal(dobles[0].body.event_id,dobles[1].body.event_id);assert.equal(dobles[0].body.puntaje,0);assert.equal(sql(`SELECT count(*) FROM partidas WHERE id='${id}';`),'1');
const detalle=(await pedir('/cursos/bio-2b/conceptos/mitosis',{token:laura.token})).body;
const pregunta=detalle.preguntas.find(p=>p.id==='mitosis-p1');assert.equal(pregunta.distribucion.find(d=>d.respuesta_dada==='Metafase').cantidad,cuentaPrevia+1);
// Primer envío gana: el feedback no altera el resultado final ni los reintentos.
assert.equal((await pedir('/partidas',{token:alumno.token,cuerpo:{...cuerpo,respuestas:cuerpo.respuestas.map(r=>r.pregunta_id==='mitosis-p1'?{...r,respuesta_dada:'Anafase'}:r)}})).body.puntaje,0);
const externo=await login('alu-30','alumno123','alumno');
const sesionExterno=(await pedir('/cursos/bio-2b/partida-nueva?minijuego=trivia',{token:externo.token})).body.sesion;
for(let i=0;i<60;i++)assert.equal((await pedir(ruta,{token:externo.token,cuerpo:{respuesta_dada:null,sesion:sesionExterno}})).status,200);
const limite=await pedir(ruta,{token:externo.token,cuerpo:{respuesta_dada:null,sesion:sesionExterno}});assert.equal(limite.status,429);assert.ok(Number(limite.headers.get('retry-after'))>0);
assert.equal(sql("SELECT count(*) FROM analitica_concepto WHERE curso_id!='bio-2b';"),'0');assert.equal(sql("SELECT count(*) FROM notificaciones WHERE curso_id!='bio-2b';"),'0');
console.log('OK: permisos por rol/curso, cursos de seed idempotentes sin alterar Biología, distribución real de opciones, listado sin soluciones, sesión de partida (preguntas asignadas, primera respuesta corregida, práctica), POST idempotente concurrente, autoridad final y rate limit 60/61.');
