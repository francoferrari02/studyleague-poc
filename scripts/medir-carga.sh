#!/usr/bin/env bash
# Medición de los ASR del white paper con el simulador (pico de día de juego):
#   - escalabilidad: N partidas en S segundos sin errores (ASR: 1.000 en 60 s);
#   - latencia: partida → ranking, p50/p95/máximo (SLO: p95 < 3 s);
#   - sin pérdida: todas las partidas guardadas llegan a la analítica.
# Además registra el pico de CPU y memoria de cada contenedor durante la prueba.
#
#   bash scripts/medir-carga.sh                 # 1000 partidas en 60 s
#   bash scripts/medir-carga.sh 200 10          # otra carga
#   ./deploy/azure.sh ssh bash scripts/medir-carga.sh > docs/mediciones-nube.json
#
# Modifica los datos de la demo: después corré scripts/demo-reset.sh.
# El simulador corre en la misma máquina que el sistema, así que compite por CPU:
# los números son conservadores.
set -euo pipefail
cd "$(dirname "$0")/.."

ALUMNOS=${1:-1000}
SEGUNDOS=${2:-60}
STATS=$(mktemp)
trap 'rm -f "$STATS"; kill "$MUESTREO" 2>/dev/null || true' EXIT

sql() { docker compose exec -T postgres sh -c 'psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' sql "$1"; }
lag_analitica() {
  docker compose exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group analitica 2>/dev/null \
    | awk '$2=="partida.finalizada" { if ($6 ~ /^[0-9]+$/) s += $6; else s += 1000000 } END { print s + 0 }'
}

docker compose --profile tools build simulador >/dev/null 2>&1
DESDE=$(sql "SELECT now()")
PARTIDAS_ANTES=$(sql "SELECT count(*) FROM partidas")
ANALITICA_ANTES=$(sql "SELECT count(*) FROM eventos_procesados WHERE consumidor = 'analitica'")

# Muestreo de recursos cada 2 s mientras corre el simulador.
CONTENEDORES=$(docker compose ps -q)
( while true; do docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}' $CONTENEDORES >> "$STATS" 2>/dev/null; sleep 2; done ) &
MUESTREO=$!
disown "$MUESTREO"

>&2 echo "Simulando $ALUMNOS partidas en $SEGUNDOS s..."
SIMULADOR=$(docker compose run --rm -T simulador --alumnos "$ALUMNOS" --segundos "$SEGUNDOS" 2>/dev/null | tail -1)
kill "$MUESTREO" 2>/dev/null || true

# Sin pérdida: esperar a que analitica-consumer procese todo y contar.
for _ in {1..60}; do [ "$(lag_analitica)" = 0 ] && break; sleep 1; done
PARTIDAS=$(( $(sql "SELECT count(*) FROM partidas") - PARTIDAS_ANTES ))
EN_ANALITICA=$(( $(sql "SELECT count(*) FROM eventos_procesados WHERE consumidor = 'analitica'") - ANALITICA_ANTES ))
OUTBOX_PENDIENTE=$(sql "SELECT count(*) FROM outbox WHERE publicado_en IS NULL" 2>/dev/null || echo null)

# Pico de CPU (%) y memoria (MiB) por contenedor.
RECURSOS=$(awk -F'|' '
  function mib(v) { n = v + 0; if (v ~ /GiB/) n *= 1024; else if (v ~ /KiB/) n /= 1024; else if (v ~ /[0-9]B/ && v !~ /MiB/) n /= 1048576; return n }
  { split($3, m, " / "); c = $2 + 0; r = mib(m[1]); nombre = $1; sub(/^studyleague-/, "", nombre); sub(/-1$/, "", nombre)
    if (c > cpu[nombre]) cpu[nombre] = c; if (r > mem[nombre]) mem[nombre] = r }
  END { sep = ""; printf "{"; for (k in cpu) { printf "%s\"%s\":{\"cpu_pico_pct\":%.1f,\"mem_pico_mib\":%.0f}", sep, k, cpu[k], mem[k]; sep = "," } printf "}" }' "$STATS")

MAQUINA=$(printf '{"vcpu":%s,"mem_total_mib":%s}' "$(nproc 2>/dev/null || sysctl -n hw.ncpu)" "$(free -m 2>/dev/null | awk '/^Mem:/ {print $2}' | grep . || echo null)")

printf '{"fecha":"%s","carga":{"partidas":%s,"segundos":%s},"simulador":%s,"sin_perdida":{"partidas_guardadas":%s,"procesadas_por_analitica":%s,"outbox_pendiente":%s},"maquina":%s,"recursos":%s}\n' \
  "$DESDE" "$ALUMNOS" "$SEGUNDOS" "${SIMULADOR:-null}" "$PARTIDAS" "$EN_ANALITICA" "$OUTBOX_PENDIENTE" "$MAQUINA" "$RECURSOS"
