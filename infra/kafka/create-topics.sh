#!/bin/bash
# Lo ejecuta el servicio kafka-init una vez que Kafka está listo.
# Crea los tópicos con particiones y retención explícitas (la auto-creación está apagada).
set -euo pipefail

BOOTSTRAP="${KAFKA_BOOTSTRAP:-kafka:9092}"
PARTICIONES="${PARTIDA_PARTICIONES:-3}"
RETENCION_MS=$(( ${RETENCION_HORAS:-168} * 3600 * 1000 ))
KT=/opt/kafka/bin/kafka-topics.sh

crear() {
  local topic=$1 particiones=$2
  $KT --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
    --topic "$topic" --partitions "$particiones" --replication-factor 1 \
    --config retention.ms="$RETENCION_MS"
}

# Clave = curso_id: las partidas de un curso llegan en orden a su partición.
crear partida.finalizada "$PARTICIONES"
crear concepto.bajo_dominio 1
crear partida.finalizada.dlq 1

$KT --bootstrap-server "$BOOTSTRAP" --describe
echo "Tópicos creados."
