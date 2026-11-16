#!/usr/bin/env bash
# Verificación de la Fase 1 de la PoC, desde cero (borra los volúmenes).
#
#   ./scripts/verificar-fase1.sh
#
# Requiere: bash, curl, jq y docker compose. El .env es opcional (en local hay valores por defecto).
# Sale con código distinto de 0 si alguna prueba no se cumple.
#
# Orden: la prueba 4 (bajo dominio) corre antes que la 3 (consumidor caído) porque con las
# probabilidades de los mockups Mitosis acierta 34 %: las 50 partidas de la prueba 3 ya
# dispararían su aviso y la prueba 4 no podría ver exactamente uno nuevo.
set -uo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then set -a; source .env; set +a; fi
for cmd in curl jq docker; do command -v "$cmd" >/dev/null || { echo "Falta $cmd"; exit 2; }; done

API="http://localhost:${API_PORT:-3000}"
PG_USER="${POSTGRES_USER:-studyleague}"
PG_DB="${POSTGRES_DB:-studyleague}"
CURSO=bio-2b
FALLAS=0
INICIO=$(date +%s)

titulo() { echo; echo "== $*"; }
ok() { echo "  OK    $*"; }
falla() { echo "  FALLA $*"; FALLAS=$((FALLAS + 1)); }
info() { echo "        $*"; }
comprobar() { # comprobar <descripción> <condición de test>
  local desc=$1; shift
  if "$@"; then ok "$desc"; else falla "$desc"; fi
}

sql() { docker compose exec -T postgres psql -U "$PG_USER" -d "$PG_DB" -tAc "$1"; }
redis() { docker compose exec -T redis redis-cli "$@"; }
kafka() { docker compose exec -T kafka "/opt/kafka/bin/$1" --bootstrap-server localhost:9092 "${@:2}"; }

# Mensajes en un tópico (suma de los offsets finales de sus particiones).
mensajes() { kafka kafka-get-offsets.sh --topic "$1" 2>/dev/null | awk -F: '{ s += $3 } END { print s + 0 }'; }

# Lag total de un grupo. Si una partición nunca se commiteó, cuenta todo su log como pendiente.
lag() {
  kafka kafka-consumer-groups.sh --describe --group "$1" 2>/dev/null |
    awk -v g="$1" '$1 == g { if ($4 == "-") s += ($5 == "-" ? 0 : $5); else s += $6 } END { print s + 0 }'
}

# Espera a que el grupo tenga al menos un consumidor con particiones asignadas.
esperar_grupo() {
  for _ in $(seq 1 60); do
    if kafka kafka-consumer-groups.sh --describe --group "$1" --members 2>/dev/null |
      awk -v g="$1" '$1 == g && $NF ~ /^[0-9]+$/ && $NF > 0 { e = 1 } END { exit !e }'; then
      return 0
    fi
    sleep 2
  done
  return 1
}

esperar_lag_cero() { # esperar_lag_cero <grupo> <segundos máx>; imprime los segundos que tardó
  local t0; t0=$(date +%s)
  while [ $(($(date +%s) - t0)) -lt "$2" ]; do
    [ "$(lag "$1")" = 0 ] && { echo $(($(date +%s) - t0)); return 0; }
    sleep 1
  done
  echo -1; return 1
}

login() { # login alumno|docente <usuario> <clave>
  curl -s -X POST "$API/auth/$1" -H 'content-type: application/json' \
    -d "{\"usuario\":\"$2\",\"clave\":\"$3\"}" | jq -r '.token // empty'
}
codigo() { # codigo <token|-> <método> <ruta>
  local auth=()
  [ "$1" != "-" ] && auth=(-H "authorization: Bearer $1")
  curl -s -o /dev/null -w '%{http_code}' -X "$2" ${auth[@]+"${auth[@]}"} "$API$3"
}
# Juega una trivia respondiendo todo bien; imprime la respuesta de POST /partidas con el código HTTP.
jugar_trivia() {
  local token=$1 cuerpo soluciones
  soluciones=$(sql "SELECT coalesce(jsonb_object_agg(p.id,p.respuesta), '{}') FROM preguntas p JOIN conceptos c ON c.id=p.concepto_id WHERE c.curso_id='$CURSO' AND p.minijuego='trivia'")
  cuerpo=$(curl -s -H "authorization: Bearer $token" "$API/cursos/$CURSO/partida-nueva?minijuego=trivia" |
    jq -c --argjson soluciones "$soluciones" --arg c "$CURSO" '{curso_id: $c, minijuego: "trivia",
      respuestas: [.preguntas[] | {pregunta_id, respuesta_dada: $soluciones[.pregunta_id], tiempo_ms: 5000}]}')
  curl -s -w '\n%{http_code}' -X POST "$API/partidas" -H "authorization: Bearer $token" \
    -H 'content-type: application/json' -d "$cuerpo"
}
simular() { docker compose run --rm -T simulador "$@" 2>/dev/null | tail -1; }

# ---------------------------------------------------------------------------
titulo "Preparación: docker compose down -v && up -d --build"
docker compose down -v --remove-orphans >/dev/null 2>&1
if ! docker compose up -d --build >/dev/null 2>&1; then echo "docker compose up falló"; exit 1; fi
docker compose build simulador >/dev/null 2>&1
for _ in $(seq 1 60); do [ "$(codigo - GET /health)" = 200 ] && break; sleep 2; done
comprobar "la API responde /health" test "$(codigo - GET /health)" = 200
comprobar "kafka-init terminó con código 0" \
  test "$(docker inspect "$(docker compose ps -aq kafka-init)" --format '{{.State.ExitCode}}')" = 0
for g in ranking analitica notificaciones; do
  comprobar "el grupo $g tiene un consumidor con particiones asignadas" esperar_grupo "$g"
done
info "particiones: partida.finalizada=$(kafka kafka-get-offsets.sh --topic partida.finalizada | wc -l | tr -d ' ')," \
  "concepto.bajo_dominio=$(kafka kafka-get-offsets.sh --topic concepto.bajo_dominio | wc -l | tr -d ' ')," \
  "partida.finalizada.dlq=$(kafka kafka-get-offsets.sh --topic partida.finalizada.dlq | wc -l | tr -d ' ')"
info "seed-ranking: $(docker compose run --rm -T seed-ranking 2>/dev/null | tail -1)"

# ---------------------------------------------------------------------------
titulo "1. Ranking: una trivia y B4 pasa de pendiente a actualizado en menos de 3 s"
# Con fetch y keep-alive desde el contenedor de la API, como haría la app; con curl el
# arranque de cada proceso tarda más que todo el pipeline y no se llega a ver "pendiente".
R1=$(docker compose exec -T api node --input-type=module -e '
const A = "http://localhost:3000", h = { "content-type": "application/json" };
const pedir = async (ruta, op = {}) => { const r = await fetch(A + ruta, op); return { status: r.status, body: await r.json() }; };
const { token } = (await pedir("/auth/alumno", { method: "POST", headers: h, body: JSON.stringify({ usuario: "tomas", clave: "alumno123" }) })).body;
const H = { ...h, authorization: "Bearer " + token };
const { preguntas } = (await pedir("/cursos/bio-2b/partida-nueva?minijuego=trivia", { headers: H })).body;
// Responde todo bien salvo Mitosis, para comprobar también la corrección en el servidor.
const { default: pg } = await import("pg");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await db.query("SELECT id,respuesta FROM preguntas");
await db.end();
const soluciones = new Map(rows.map(p=>[p.id,p.respuesta]));
const respuestas = preguntas.map((p) => ({ pregunta_id: p.pregunta_id, tiempo_ms: 6000,
  respuesta_dada: p.concepto_id === "mitosis" ? p.opciones.find((o) => o !== soluciones.get(p.pregunta_id)) : soluciones.get(p.pregunta_id) }));
const t0 = performance.now();
const post = await pedir("/partidas", { method: "POST", headers: H, body: JSON.stringify({ curso_id: "bio-2b", minijuego: "trivia", respuestas }) });
const estados = []; let b4;
while (performance.now() - t0 < 5000) {
  b4 = (await pedir(`/partidas/${post.body.partida_id}/ranking`, { headers: H })).body;
  if (estados.at(-1) !== b4.estado) estados.push(b4.estado);
  if (b4.estado === "actualizado") break;
  await new Promise((r) => setTimeout(r, 10));
}
const mitosis = post.body.correccion.filter((c) => c.pregunta_id.startsWith("mitosis"));
console.log(JSON.stringify({ status: post.status, event_id: post.body.event_id, puntaje: post.body.puntaje,
  aciertos: post.body.aciertos, total: post.body.total, estados, ms: Math.round(performance.now() - t0), b4, mitosis }));
')
EVENTO1=$(echo "$R1" | jq -r .event_id)
info "POST /partidas: $(echo "$R1" | jq -c '{status, puntaje, aciertos, total}')"
info "estados de B4: $(echo "$R1" | jq -c .estados) en $(echo "$R1" | jq .ms) ms"
info "B4: $(echo "$R1" | jq -c .b4)"
comprobar "POST /partidas responde 202" test "$(echo "$R1" | jq .status)" = 202
comprobar "B4 empieza en pendiente y pasa a actualizado" test "$(echo "$R1" | jq -c .estados)" = '["pendiente","actualizado"]'
comprobar "llega a actualizado en menos de 3 s" test "$(echo "$R1" | jq .ms)" -lt 3000
comprobar "la respuesta incorrecta de Mitosis da correcta:false con la explicación de la docente" \
  test "$(echo "$R1" | jq '[.mitosis[] | select(.correcta == false and (.explicacion | length) > 20)] | length')" = 2
sleep 1
comprobar "ranking-consumer logueó \"ranking actualizado\"" \
  bash -c "docker compose logs ranking-consumer | grep -q 'ranking actualizado'"

# ---------------------------------------------------------------------------
titulo "2. Evento repetido: se republica a mano el mismo evento"
SEMANA=$(date -u +%G-W%V) # igual que semanaIso() de packages/shared
PUNTOS_ANTES=$(redis ZSCORE "ranking:$CURSO:$SEMANA" alu-01)
PAYLOAD=$(sql "SELECT payload::text FROM outbox WHERE event_id = '$EVENTO1'")
echo "$CURSO|$PAYLOAD" | docker compose exec -T kafka /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 --topic partida.finalizada --property parse.key=true --property key.separator='|'
for _ in $(seq 1 20); do
  docker compose logs ranking-consumer | grep "$EVENTO1" | grep -q 'evento repetido' && break
  sleep 1
done
PUNTOS_DESPUES=$(redis ZSCORE "ranking:$CURSO:$SEMANA" alu-01)
info "event_id $EVENTO1 · puntos de alu-01 antes=$PUNTOS_ANTES después=$PUNTOS_DESPUES"
comprobar "ranking-consumer loguea \"evento repetido\" para ese event_id" \
  bash -c "docker compose logs ranking-consumer | grep '$EVENTO1' | grep -q 'evento repetido'"
comprobar "el puntaje del ranking no cambia" test "$PUNTOS_ANTES" = "$PUNTOS_DESPUES"
comprobar "analitica-consumer también lo descarta" \
  bash -c "docker compose logs analitica-consumer | grep '$EVENTO1' | grep -q 'evento repetido'"

# ---------------------------------------------------------------------------
titulo "4. Bajo dominio: simulador --alumnos 50 --bajo-dominio mitosis"
MSJ_ANTES=$(mensajes concepto.bajo_dominio)
NOTIF_ANTES=$(sql "SELECT count(*) FROM notificaciones")
SIM4=$(simular --alumnos 50 --bajo-dominio mitosis)
info "simulador: $SIM4"
esperar_lag_cero analitica 60 >/dev/null
esperar_lag_cero notificaciones 60 >/dev/null
sleep 1
AVISOS=$(kafka kafka-console-consumer.sh --topic concepto.bajo_dominio --from-beginning --timeout-ms 5000 2>/dev/null)
MITOSIS_MSJ=$(echo "$AVISOS" | jq -s '[.[] | select(.concepto_id == "mitosis")] | length')
MSJ_NUEVOS=$(($(mensajes concepto.bajo_dominio) - MSJ_ANTES))
NOTIF_NUEVAS=$(($(sql "SELECT count(*) FROM notificaciones") - NOTIF_ANTES))
MITOSIS_NOTIF=$(sql "SELECT count(*) FROM notificaciones WHERE concepto_id = 'mitosis'")
info "mensajes nuevos en concepto.bajo_dominio: $MSJ_NUEVOS ($(echo "$AVISOS" | jq -sc '[.[] | .concepto_id]'))"
info "notificaciones nuevas: $NOTIF_NUEVAS · $(sql "SELECT string_agg(mensaje, ' | ') FROM notificaciones")"
info "analítica de mitosis: $(sql "SELECT respuestas || ' respuestas, ' || aciertos || ' aciertos, alerta_enviada=' || alerta_enviada FROM analitica_concepto WHERE concepto_id = 'mitosis'")"
comprobar "el simulador terminó sin fallas" test "$(echo "$SIM4" | jq .fallas)" = 0
comprobar "exactamente UN mensaje de Mitosis en concepto.bajo_dominio" test "$MITOSIS_MSJ" = 1
comprobar "exactamente UNA notificación nueva de Mitosis" test "$MITOSIS_NOTIF" = 1
comprobar "cada mensaje de bajo dominio generó exactamente una notificación" test "$MSJ_NUEVOS" = "$NOTIF_NUEVAS"
comprobar "Mitosis quedó por debajo del 40 %" \
  test "$(sql "SELECT aciertos::float / respuestas < 0.40 FROM analitica_concepto WHERE concepto_id = 'mitosis'")" = t

# ---------------------------------------------------------------------------
titulo "3. Consumidor caído: analitica-consumer detenido durante 50 partidas"
docker compose stop analitica-consumer >/dev/null 2>&1
SUMA_ANTES=$(sql "SELECT coalesce(sum(respuestas), 0) FROM analitica_concepto WHERE curso_id = '$CURSO'")
DESDE=$(sql "SELECT clock_timestamp()")
SIM3=$(simular --alumnos 50)
info "simulador: $SIM3"
PARTIDAS3=$(sql "SELECT count(*) FROM partidas WHERE finalizada_en >= '$DESDE'")
ESPERADAS=$(sql "SELECT count(*) FROM respuestas r JOIN partidas p ON p.id = r.partida_id WHERE p.finalizada_en >= '$DESDE'")
sleep 2
LAG_CAIDO=$(lag analitica)
info "lag del grupo analitica con el consumidor detenido: $LAG_CAIDO"
docker compose start analitica-consumer >/dev/null 2>&1
SEG=$(esperar_lag_cero analitica 120)
SUMA_DESPUES=$(sql "SELECT coalesce(sum(respuestas), 0) FROM analitica_concepto WHERE curso_id = '$CURSO'")
info "lag volvió a 0 en ${SEG}s · respuestas en analitica_concepto: $SUMA_ANTES -> $SUMA_DESPUES (esperadas +$ESPERADAS de $PARTIDAS3 partidas)"
comprobar "el simulador terminó sin fallas" test "$(echo "$SIM3" | jq .fallas)" = 0
comprobar "se guardaron 50 partidas" test "$PARTIDAS3" = 50
comprobar "el lag subió mientras el consumidor estaba detenido" test "$LAG_CAIDO" -ge 50
comprobar "el lag volvió a 0 al reiniciarlo" test "$SEG" -ge 0
comprobar "analitica_concepto suma exactamente las respuestas de las 50 partidas" \
  test "$((SUMA_DESPUES - SUMA_ANTES))" = "$ESPERADAS"

# ---------------------------------------------------------------------------
titulo "5. Outbox: con Kafka detenido la partida se guarda y se publica al volver"
T5=$(login alumno alu-05 alumno123)
docker compose stop kafka >/dev/null 2>&1
SALIDA=$(jugar_trivia "$T5")
HTTP5=$(echo "$SALIDA" | tail -1)
CUERPO5=$(echo "$SALIDA" | sed '$d')
EVENTO5=$(echo "$CUERPO5" | jq -r .event_id)
PARTIDA5=$(echo "$CUERPO5" | jq -r .partida_id)
sleep 2
PENDIENTE=$(sql "SELECT publicado_en IS NULL FROM outbox WHERE event_id = '$EVENTO5'")
B4_CAIDO=$(curl -s -H "authorization: Bearer $T5" "$API/partidas/$PARTIDA5/ranking" | jq -r .estado)
info "con Kafka detenido: POST $HTTP5 · publicado_en IS NULL=$PENDIENTE · B4=$B4_CAIDO"
docker compose start kafka >/dev/null 2>&1
T0=$(date +%s); PUBLICADO=f
for _ in $(seq 1 90); do
  PUBLICADO=$(sql "SELECT publicado_en IS NOT NULL FROM outbox WHERE event_id = '$EVENTO5'")
  [ "$PUBLICADO" = t ] && break; sleep 1
done
SEG_PUB=$(($(date +%s) - T0)); B4_FINAL=pendiente
for _ in $(seq 1 90); do
  B4_FINAL=$(curl -s -H "authorization: Bearer $T5" "$API/partidas/$PARTIDA5/ranking" | jq -r .estado)
  [ "$B4_FINAL" = actualizado ] && break; sleep 1
done
info "al levantar Kafka: publicado en ${SEG_PUB}s · ranking actualizado a los $(($(date +%s) - T0))s"
comprobar "POST /partidas responde 202 con Kafka detenido" test "$HTTP5" = 202
comprobar "la fila queda en outbox con publicado_en NULL" test "$PENDIENTE" = t
comprobar "B4 dice pendiente mientras Kafka está detenido" test "$B4_CAIDO" = pendiente
comprobar "al levantar Kafka el evento se publica" test "$PUBLICADO" = t
comprobar "y el ranking se actualiza" test "$B4_FINAL" = actualizado

# ---------------------------------------------------------------------------
titulo "6. Seguridad"
TA=$(login alumno tomas alumno123)
TD=$(login docente laura.gomez docente123)
sql "INSERT INTO docentes (id, escuela_id, nombre, email, usuario, clave_hash)
     VALUES ('doc-prueba', 'esc-12', 'Prof. Prueba', 'prueba@escuela12.edu.ar', 'docente.prueba', crypt('prueba123', gen_salt('bf')))
     ON CONFLICT DO NOTHING;
     INSERT INTO cursos (id, docente_id, nombre, codigo, dias_juego, minijuegos)
     VALUES ('prueba-1a', 'doc-prueba', 'Prueba · 1.º A', 'PRB2QX', '{2,4}', '{trivia}')
     ON CONFLICT DO NOTHING;" >/dev/null
TD2=$(login docente docente.prueba prueba123)
T2=$(login alumno alu-02 alumno123)
NOTIF=$(curl -s -H "authorization: Bearer $TD" "$API/docentes/yo/notificaciones" | jq '.notificaciones[0].id')
# Token con la forma correcta pero firmado con otro secreto.
b64() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
CAB=$(printf '{"alg":"HS256","typ":"JWT"}' | b64)
CARGA=$(printf '{"id":"doc-laura","rol":"docente","iat":%s}' "$(date +%s)" | b64)
FALSO="$CAB.$CARGA.$(printf '%s' "$CAB.$CARGA" | openssl dgst -sha256 -hmac otro-secreto -binary | b64)"
comprobar "sin token: GET /cursos/bio-2b/ranking da 401" test "$(codigo - GET /cursos/bio-2b/ranking)" = 401
comprobar "token firmado con otro secreto: 401" test "$(codigo "$FALSO" GET /cursos/bio-2b/analitica)" = 401
comprobar "login con clave incorrecta: 401" \
  test "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/alumno" -H 'content-type: application/json' -d '{"usuario":"tomas","clave":"mal"}')" = 401
comprobar "alumno sobre la analítica (ruta de docente): 403" test "$(codigo "$TA" GET /cursos/bio-2b/analitica)" = 403
comprobar "alumno sobre las notificaciones del docente: 403" test "$(codigo "$TA" GET /docentes/yo/notificaciones)" = 403
comprobar "docente sobre la analítica de un curso ajeno: 403" test "$(codigo "$TD2" GET /cursos/bio-2b/analitica)" = 403
comprobar "docente sobre el ranking de un curso ajeno: 403" test "$(codigo "$TD2" GET /cursos/bio-2b/ranking)" = 403
comprobar "docente marcando como leído el aviso de otra docente: 403" test "$(codigo "$TD2" PATCH "/notificaciones/$NOTIF/leida")" = 403
comprobar "Laura sobre el curso del docente de prueba: 403" test "$(codigo "$TD" GET /cursos/prueba-1a/analitica)" = 403
comprobar "alumno sobre un curso en el que no está inscripto: 403" test "$(codigo "$TA" GET "/cursos/prueba-1a/partida-nueva?minijuego=trivia")" = 403
comprobar "alumno consultando la partida de otro alumno (B4): 403" test "$(codigo "$T2" GET "/partidas/$PARTIDA5/ranking")" = 403
comprobar "docente sobre su propia analítica: 200" test "$(codigo "$TD" GET /cursos/bio-2b/analitica)" = 200

# ---------------------------------------------------------------------------
titulo "7. Pico: simulador --alumnos 200"
redis DEL metricas:latencia_ranking >/dev/null # el p95 se mide solo sobre el pico
SIM7=$(simular --alumnos 200)
info "simulador: $SIM7"
P95=$(echo "$SIM7" | jq '.metricas.p95_ms // 999999')
comprobar "200 partidas sin errores" test "$(echo "$SIM7" | jq '.enviadas == 200 and .fallas == 0')" = true
comprobar "todas llegaron al ranking" test "$(echo "$SIM7" | jq .sin_actualizar_en_ranking)" = 0
comprobar "p95 de la latencia partida → ranking menor a 3 s (p95 = ${P95} ms)" test "$P95" -lt 3000

# ---------------------------------------------------------------------------
titulo "Resultado"
echo "  duración: $(($(date +%s) - INICIO)) s"
if [ "$FALLAS" -eq 0 ]; then echo "  TODO OK"; exit 0; fi
echo "  $FALLAS comprobaciones fallaron"; exit 1
