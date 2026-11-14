#!/usr/bin/env bash
# No cambia permisos ni usa archivos externos. Ejecutar con bash.
set -euo pipefail
cd "$(dirname "$0")/.."
SEMANA=$(date -u +%G-W%V)
CLAVE="ranking:bio-2b:$SEMANA"
comprobar() {
  local esperado=$1 puntos=$2
  test "$(docker compose exec -T redis redis-cli ZREVRANK "$CLAVE" alu-01 | tr -d '\r')" = "$esperado"
  test "$(docker compose exec -T redis redis-cli ZSCORE "$CLAVE" alu-01 | tr -d '\r')" = "$puntos"
}
npm run seed:ranking
comprobar 6 1270
npm run seed:ranking -- --despues
comprobar 3 2090
npm run seed:ranking
comprobar 6 1270
echo 'OK: Tomás 7º (1270) → 4º (2090); restaurado antes de jugar.'
