/**
 * ranking-consumer (grupo "ranking")
 * Suma el puntaje de cada partida al ranking semanal del curso en Redis
 * (sorted set). Es procesamiento de flujos de eventos: un acumulado que se
 * actualiza con cada evento.
 *
 * Idempotencia: guarda el event_id y suma puntos en un único script Lua atómico; si el mismo evento
 * llega dos veces (entrega al menos una vez), el puntaje se suma una sola vez.
 */
import { Redis, type Result } from "ioredis";
import {
  CLAVE_LATENCIA_RANKING,
  CONSUMER_GROUPS,
  MUESTRAS_LATENCIA,
  TOPICS,
  claveProcesado,
  claveRanking,
  crearConsumidor,
  crearProductor,
  esPartidaFinalizada,
  log,
  semanaIso,
} from "@studyleague/shared";

const SERVICIO = "ranking-consumer";
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
redis.defineCommand("sumarSiEsNuevo", {
  numberOfKeys: 2,
  // KEYS[1] = procesado:ranking:<event_id>, KEYS[2] = ranking:<curso>:<semana>
  // ARGV[1] = TTL en segundos, ARGV[2] = puntaje, ARGV[3] = alumno_id,
  // ARGV[4] = "1" si suma al ranking o "practica" si no (queda como valor de la marca: lo lee la API en B4)
  lua: `
    if redis.call("SET", KEYS[1], ARGV[4], "EX", ARGV[1], "NX") then
      if ARGV[4] == "1" then
        redis.call("ZINCRBY", KEYS[2], ARGV[2], ARGV[3])
      end
      return 1
    end
    return 0`,
});
declare module "ioredis" {
  interface RedisCommander<Context> {
    sumarSiEsNuevo(procesado: string, ranking: string, ttlS: number, puntaje: number, alumnoId: string, marca: string): Result<number, Context>;
  }
}
const dlq = await crearProductor(SERVICIO);

/** Los event_id procesados se guardan 8 días: más que la retención de Kafka (7 días). */
const TTL_IDEMPOTENCIA_S = 8 * 24 * 3600;

await crearConsumidor({
  clientId: SERVICIO,
  groupId: CONSUMER_GROUPS.RANKING,
  topics: [TOPICS.PARTIDA_FINALIZADA],
  async alRecibir(mensaje) {
    const evento = mensaje.value;
    if (!esPartidaFinalizada(evento)) {
      log(SERVICIO, "evento inválido, a la DLQ", { offset: mensaje.offset });
      await dlq.enviarADlq(TOPICS.PARTIDA_FINALIZADA_DLQ, mensaje.key ?? "sin-clave", evento, "no cumple el contrato");
      return;
    }

    // Marca de procesado y suma de puntos en un solo paso atómico: si el proceso se corta
    // en el medio no queda el evento marcado sin sus puntos, y quien ve la marca (B4) ya ve el puntaje.
    // Una partida de práctica solo deja la marca: este consumidor decide qué hacer con el evento,
    // mientras rachas y analítica lo procesan igual.
    const cuenta = evento.cuenta_para_ranking !== false;
    const semana = semanaIso(new Date(evento.ocurrido_en));
    const nuevo = await redis.sumarSiEsNuevo(
      claveProcesado(evento.event_id),
      claveRanking(evento.curso_id, semana),
      TTL_IDEMPOTENCIA_S,
      evento.puntaje,
      evento.alumno_id,
      cuenta ? "1" : "practica",
    );
    if (nuevo === 0) {
      log(SERVICIO, "evento repetido, se descarta", { event_id: evento.event_id });
      return;
    }

    // Latencia de punta a punta: el SLI del white paper (objetivo: p95 < 3 s).
    const latenciaMs = Date.now() - new Date(evento.ocurrido_en).getTime();
    log(SERVICIO, "ranking actualizado", {
      curso_id: evento.curso_id,
      alumno_id: evento.alumno_id,
      puntaje: cuenta ? evento.puntaje : 0,
      ...(cuenta ? {} : { practica: true }),
      particion: mensaje.partition,
      latencia_ms: latenciaMs,
    });

    // Últimas 1.000 latencias, para GET /metricas (p50, p95, máximo).
    await redis
      .multi()
      .lpush(CLAVE_LATENCIA_RANKING, latenciaMs)
      .ltrim(CLAVE_LATENCIA_RANKING, 0, MUESTRAS_LATENCIA - 1)
      .exec();
  },
});

log(SERVICIO, "escuchando", { topic: TOPICS.PARTIDA_FINALIZADA });
