#!/usr/bin/env bash
# Demo de replay: por qué Kafka y no una cola que borra los mensajes al consumirlos.
#
# Simula que se pierde la proyección de analítica (un bug, una base restaurada mal)
# y la reconstruye releyendo el historial de partida.finalizada que Kafka retiene (7 días):
#   1. Muestra la analítica actual del curso.
#   2. Detiene analitica-consumer y borra su tabla y sus marcas de idempotencia.
#   3. Rebobina el consumer group "analitica" al principio del tópico.
#   4. Restaura el snapshot base (analitica-base.sql) y vuelve a prender el consumidor.
#   5. Espera a que el lag llegue a 0 y compara con el estado inicial.
#
# Los demás consumidores (ranking, rachas, notificaciones) siguen funcionando durante todo
# el proceso. Los avisos al docente no se duplican: el event_id del aviso es determinista.
#
#   bash scripts/replay.sh            # de corrido
#   PAUSA=1 bash scripts/replay.sh    # se detiene entre pasos (para la defensa)
#   ./deploy/azure.sh ssh bash scripts/replay.sh   # en la VM
#
# Solo necesita Docker Compose. Conviene jugar algunas partidas antes (o correr el simulador)
# para que el tópico tenga historial que reproducir.
set -euo pipefail
cd "$(dirname "$0")/.."

CURSO=${CURSO:-bio-2b}
GRUPO=analitica
TOPICO=partida.finalizada
KBIN=/opt/kafka/bin

psql() { docker compose exec -T postgres sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql "$@"; }
kafka() { docker compose exec -T kafka "$@"; }
pausa() { if [ "${PAUSA:-0}" = 1 ]; then read -rp "  [Enter para seguir] " _; fi; }
paso() { printf '\n\033[1m%s\033[0m\n' "$*"; }

tabla() {
  psql -c "SELECT concepto_id AS concepto, respuestas, aciertos,
                  round(100.0 * aciertos / nullif(respuestas, 0)) || ' %' AS dominio,
                  CASE WHEN alerta_enviada THEN 'sí' ELSE '' END AS aviso
             FROM analitica_concepto WHERE curso_id = '$CURSO' ORDER BY concepto_id"
}
# Huella de toda la proyección (todos los cursos), para comparar antes y después.
huella() { psql -At -c "SELECT md5(coalesce(string_agg(curso_id||':'||concepto_id||':'||respuestas||':'||aciertos||':'||alerta_enviada, ',' ORDER BY curso_id, concepto_id), '')) FROM analitica_concepto"; }
avisos() { psql -At -c "SELECT count(*) FROM notificaciones"; }
# Una partición sin offset confirmado ("-") tiene pendiente todo su log; vacía, 0.
lag() {
  kafka $KBIN/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group $GRUPO 2>/dev/null \
    | awk -v t=$TOPICO '$2==t { if ($6 ~ /^[0-9]+$/) s += $6; else if ($5 ~ /^[0-9]+$/) s += $5; else s += 1000000 } END { print s + 0 }'
}
eventos_en_kafka() {
  local fin inicio
  fin=$(kafka $KBIN/kafka-get-offsets.sh --bootstrap-server localhost:9092 --topic $TOPICO --time -1 | awk -F: '{s+=$3} END {print s+0}')
  inicio=$(kafka $KBIN/kafka-get-offsets.sh --bootstrap-server localhost:9092 --topic $TOPICO --time -2 | awk -F: '{s+=$3} END {print s+0}')
  echo $((fin - inicio))
}

paso "1. Estado actual de la analítica ($CURSO)"
tabla
HUELLA_ANTES=$(huella)
AVISOS_ANTES=$(avisos)
EVENTOS=$(eventos_en_kafka)
echo "Kafka retiene $EVENTOS eventos en $TOPICO. Avisos al docente: $AVISOS_ANTES."
[ "$EVENTOS" -gt 0 ] || echo "Aviso: el tópico está vacío; jugá partidas o corré el simulador para que el replay tenga qué reproducir."
pausa

paso "2. Se pierde la proyección: se detiene analitica-consumer y se borra su tabla"
docker compose stop analitica-consumer >/dev/null 2>&1
trap 'docker compose start analitica-consumer >/dev/null 2>&1' EXIT
psql -c "TRUNCATE analitica_concepto, analitica_respuestas_base; DELETE FROM eventos_procesados WHERE consumidor = '$GRUPO';"
tabla
echo "La web del docente ahora muestra el curso sin datos. El ranking y las rachas siguen andando."
pausa

paso "3. Se rebobina el consumer group \"$GRUPO\" al principio de $TOPICO"
for intento in {1..30}; do
  if kafka $KBIN/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --group $GRUPO \
       --topic $TOPICO --reset-offsets --to-earliest --execute >/dev/null 2>&1; then break; fi
  # El grupo tiene que quedar vacío (sin miembros) para poder mover los offsets.
  if [ "$intento" = 30 ]; then echo "No se pudo rebobinar el grupo $GRUPO"; exit 1; fi
  sleep 1
done
echo "Offsets en el inicio: lag = $(lag) eventos por releer."
pausa

paso "4. Se restaura el snapshot base y analitica-consumer relee el historial"
cat scripts/analitica-base.sql scripts/analitica-detalle-base.sql | psql -1 -f -
INICIO=$(date +%s)
docker compose start analitica-consumer >/dev/null 2>&1
trap - EXIT
for intento in {1..120}; do
  sleep 1
  [ "$(lag)" = 0 ] && break
  if [ "$intento" = 120 ]; then echo "El consumidor no terminó de releer en 2 minutos (lag $(lag))"; exit 1; fi
done
echo "Reproducción completa en $(( $(date +%s) - INICIO )) s."

paso "5. Resultado"
tabla
AVISOS_DESPUES=$(avisos)
if [ "$(huella)" = "$HUELLA_ANTES" ]; then
  echo "✔ La analítica quedó idéntica a la de antes de la pérdida."
else
  echo "✘ La analítica difiere de la inicial (¿se jugaron partidas durante el replay?)."
fi
echo "Avisos al docente: $AVISOS_ANTES antes, $AVISOS_DESPUES después (el replay no los duplica)."
