#!/usr/bin/env bash
# Prueba de falla del publicador: la analítica debe conservar el aviso mientras
# la API está detenida y entregarlo cuando vuelve. Reinicia los datos de demo.
set -euo pipefail
cd "$(dirname "$0")/.."

for cmd in docker jq; do command -v "$cmd" >/dev/null || { echo "Falta $cmd"; exit 2; }; done

psql() {
  docker compose exec -T postgres sh -c 'psql -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' psql "$1"
}
esperar() {
  local descripcion=$1 consulta=$2 esperado=$3
  for _ in {1..60}; do
    [ "$(psql "$consulta")" = "$esperado" ] && return 0
    sleep 1
  done
  echo "No se cumplió: $descripcion" >&2
  exit 1
}

docker compose up -d --build
for _ in {1..60}; do
  if docker compose exec -T api node -e 'fetch("http://localhost:3000/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then break; fi
  sleep 1
done
bash scripts/demo-reset.sh
docker compose stop api
trap 'docker compose start api >/dev/null' EXIT

EVENT_ID=$(psql 'SELECT gen_random_uuid()')
PARTIDA_ID=$(psql 'SELECT gen_random_uuid()')
EVENTO=$(jq -cn --arg id "$EVENT_ID" --arg partida "$PARTIDA_ID" --arg fecha "$(date -u +%FT%TZ)" '{
  event_id: $id, tipo: "partida.finalizada", version: 1, ocurrido_en: $fecha,
  partida_id: $partida, curso_id: "bio-2b", alumno_id: "alu-01", minijuego: "trivia", puntaje: 0,
  respuestas: [range(0; 6) | {pregunta_id: "organelas-p1", concepto_id: "organelas", correcta: false, tiempo_ms: 1000}]
}')
printf 'bio-2b|%s\n' "$EVENTO" | docker compose exec -T kafka /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 --topic partida.finalizada --property parse.key=true --property key.separator='|'

esperar 'aviso pendiente en outbox con la API detenida' \
  "SELECT count(*) FROM outbox WHERE topic = 'concepto.bajo_dominio' AND publicado_en IS NULL AND payload->>'concepto_id' = 'organelas'" 1
[ "$(psql "SELECT count(*) FROM notificaciones WHERE concepto_id = 'organelas'")" = 0 ]

docker compose start api
trap - EXIT
esperar 'aviso publicado al volver la API' \
  "SELECT count(*) FROM outbox WHERE topic = 'concepto.bajo_dominio' AND publicado_en IS NOT NULL AND payload->>'concepto_id' = 'organelas'" 1
esperar 'una notificación para la docente' \
  "SELECT count(*) FROM notificaciones WHERE concepto_id = 'organelas'" 1

echo 'OK: el aviso quedó pendiente y llegó una sola vez al volver la API.'
echo 'Para restaurar los datos iniciales: bash scripts/demo-reset.sh'
