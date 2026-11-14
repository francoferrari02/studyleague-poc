#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'docker compose start kafka >/dev/null' EXIT
docker compose stop kafka
docker compose restart api
# Ejecutado dentro de la API para no depender de puertos ni utilidades del host.
docker compose exec -T api node --input-type=module <<'JS'
const base='http://localhost:3000';
const pedir=async(r,op={})=>{const res=await fetch(base+r,op);if(!res.ok)throw Error(`${r}: ${res.status}`);return res.json()};
for(let i=0;;i++){try{await pedir('/health');break}catch(e){if(i===30)throw e;await new Promise(r=>setTimeout(r,200))}}
const {token}=await pedir('/auth/alumno',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({usuario:'tomas',clave:'alumno123'})});
const headers={'content-type':'application/json',authorization:`Bearer ${token}`};
const {preguntas}=await pedir('/cursos/bio-2b/partida-nueva?minijuego=trivia',{headers});
for(let n=0;n<3;n++){
 const res=await fetch(base+'/partidas',{method:'POST',headers,body:JSON.stringify({curso_id:'bio-2b',minijuego:'trivia',respuestas:preguntas.map(p=>({pregunta_id:p.pregunta_id,respuesta_dada:null,tiempo_ms:20000}))})});
 if(res.status!==202)throw Error('La partida no devolvió 202');
 const p=await res.json();const b4=await pedir(`/partidas/${p.partida_id}/ranking`,{headers});
 if(b4.estado!=='pendiente')throw Error('Se esperaba ranking pendiente');
}
console.log('OK: /health, login y tres partidas 202 con Kafka detenido y API reiniciada.');
JS
pendientes=$(docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM outbox WHERE publicado_en IS NULL"')
test "$pendientes" -ge 3
docker compose start kafka
for i in {1..120}; do
 pendientes=$(docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM outbox WHERE publicado_en IS NULL"')
 if [ "$pendientes" = 0 ]; then echo "OK: outbox drenado tras recuperar Kafka (${i}s)."; exit 0; fi
 sleep 1
done
echo 'No se vació el outbox'; exit 1
