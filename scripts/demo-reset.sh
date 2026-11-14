#!/usr/bin/env bash
# Reset integral y exclusivo de los datos de demo de esta PoC.
set -euo pipefail
cd "$(dirname "$0")/.."
servicios=(api ranking-consumer rachas-consumer analitica-consumer notificaciones-consumer)
docker compose stop "${servicios[@]}"
trap 'docker compose start "${servicios[@]}" >/dev/null' EXIT
# Evita reproducir eventos anteriores sobre las proyecciones recién sembradas.
for topic in partida.finalizada concepto.bajo_dominio partida.finalizada.dlq; do
  docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --delete --topic "$topic" --if-exists
done
for intento in {1..30}; do
  temas=$(docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list)
  if ! printf '%s\n' "$temas" | rg -q '^(partida.finalizada|concepto.bajo_dominio|partida.finalizada.dlq)$'; then break; fi
  if [ "$intento" = 30 ]; then echo 'No se completó el borrado de tópicos'; exit 1; fi
  sleep 1
done
docker compose run --rm -T kafka-init
docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < scripts/demo-reset.sql
# Redis es exclusivo de esta PoC: ranking, rachas, idempotencia y métricas.
docker compose exec -T redis redis-cli FLUSHDB
npm run seed:ranking
echo 'Demo lista: Tomás 7º; Mitosis 6/18 con aviso; Organelas 14/30 sin aviso.'
