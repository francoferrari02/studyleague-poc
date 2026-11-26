#!/usr/bin/env bash
# Reset integral y exclusivo de los datos de demo de esta PoC.
# Solo necesita Docker Compose: corre igual en local y en la VM (allí .env define COMPOSE_FILE).
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
  if ! printf '%s\n' "$temas" | grep -Eq '^(partida[.]finalizada|concepto[.]bajo_dominio|partida[.]finalizada[.]dlq)$'; then break; fi
  if [ "$intento" = 30 ]; then echo 'No se completó el borrado de tópicos'; exit 1; fi
  sleep 1
done
docker compose run --rm -T kafka-init
docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < infra/postgres/init/003_demo_cursos.sql
cat scripts/demo-reset.sql scripts/analitica-base.sql \
  | docker compose exec -T postgres sh -c 'psql -q -v ON_ERROR_STOP=1 -1 -f - -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
# Redis es exclusivo de esta PoC: ranking, rachas, idempotencia y métricas.
docker compose exec -T redis redis-cli FLUSHDB
# --build: seed-ranking está en el perfil tools y `up --build` no lo reconstruye.
docker compose run --rm -T --build seed-ranking
docker compose start "${servicios[@]}" >/dev/null
trap - EXIT
docker compose exec -T api node --input-type=module -e 'for(let i=0;;i++){try{const r=await fetch("http://localhost:3000/salud");if(r.ok)break}catch{}if(i===50)throw Error("La API no quedó lista tras el reset");await new Promise(r=>setTimeout(r,200))}'
echo 'Demo lista: Tomás 7º con racha 4; Mitosis 6/20 con aviso; Organelas 8/19 y Membrana 10/22 sin aviso.'
