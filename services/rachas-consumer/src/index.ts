/**
 * rachas-consumer (grupo "rachas")
 * Lleva la racha de cada alumno en cada curso: cuántos días de juego seguidos del curso
 * jugó al menos una partida (pantallas A3, A13 y A15). Si este consumidor se cae, el
 * ranking y la analítica siguen funcionando (escenario de disponibilidad del árbol de utilidad).
 *
 * Regla (C3), con los días de juego del curso (cursos.dias_juego, 1 = lunes … 7 = domingo):
 *  - si ya jugó ese día: no cambia;
 *  - si su último día es el día de juego anterior: dias + 1;
 *  - si no: dias = 1 (se cortó).
 * Una partida en un día que no es de juego no suma ni corta; sí queda en el calendario.
 *
 * Idempotencia: la marca del event_id y la actualización de la racha van en un único
 * script Lua atómico, como en ranking-consumer. Un evento repetido no suma dos veces.
 * Orden: la clave del evento es curso_id, así que las partidas de un curso llegan en orden.
 */
import { Redis, type Result } from "ioredis";
import pg from "pg";
import {
  CONSUMER_GROUPS,
  TOPICS,
  claveJugados,
  claveRacha,
  crearConsumidor,
  diaDeJuegoAnterior,
  esDiaDeJuego,
  esPartidaFinalizada,
  fechaLocal,
  log,
} from "@studyleague/shared";

const SERVICIO = "rachas-consumer";
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/** Los event_id procesados se guardan 8 días: más que la retención de Kafka (7 días). */
const TTL_IDEMPOTENCIA_S = 8 * 24 * 3600;
/** El calendario de "Mi progreso" muestra semanas recientes: 60 días alcanzan. */
const TTL_JUGADOS_S = 60 * 24 * 3600;

redis.defineCommand("actualizarRacha", {
  numberOfKeys: 3,
  // KEYS[1] = procesado:rachas:<event_id>, KEYS[2] = racha:<curso>:<alumno>, KEYS[3] = jugados:<alumno>:<semana>
  // ARGV[1] = TTL idempotencia, ARGV[2] = fecha de la partida, ARGV[3] = día de juego anterior ("" si no hay),
  // ARGV[4] = "1" si la fecha es día de juego, ARGV[5] = TTL del calendario
  // Devuelve la racha resultante, o -1 si el evento ya se había procesado.
  lua: `
    if not redis.call("SET", KEYS[1], "1", "EX", ARGV[1], "NX") then return -1 end
    redis.call("SADD", KEYS[3], ARGV[2])
    redis.call("EXPIRE", KEYS[3], ARGV[5])
    local ultimo = redis.call("HGET", KEYS[2], "ultimo_dia")
    local dias = tonumber(redis.call("HGET", KEYS[2], "dias") or "0")
    if ARGV[4] ~= "1" then return dias end
    if ultimo and ultimo >= ARGV[2] then return dias end
    if ultimo and ultimo == ARGV[3] then dias = dias + 1 else dias = 1 end
    redis.call("HSET", KEYS[2], "ultimo_dia", ARGV[2], "dias", dias)
    return dias`,
});
declare module "ioredis" {
  interface RedisCommander<Context> {
    actualizarRacha(
      procesado: string, racha: string, jugados: string,
      ttlS: number, fecha: string, anterior: string, esDiaDeJuego: string, ttlJugadosS: number,
    ): Result<number, Context>;
  }
}

/** Días de juego por curso. Se leen de PostgreSQL la primera vez y quedan en memoria. */
const diasDeJuego = new Map<string, number[]>();
async function diasDelCurso(cursoId: string): Promise<number[] | null> {
  if (!diasDeJuego.has(cursoId)) {
    const { rows } = await db.query<{ dias_juego: number[] }>("SELECT dias_juego FROM cursos WHERE id = $1", [cursoId]);
    if (rows.length === 0) return null;
    diasDeJuego.set(cursoId, rows[0].dias_juego.map(Number));
  }
  return diasDeJuego.get(cursoId)!;
}

await crearConsumidor({
  clientId: SERVICIO,
  groupId: CONSUMER_GROUPS.RACHAS,
  topics: [TOPICS.PARTIDA_FINALIZADA],
  async alRecibir(mensaje) {
    const evento = mensaje.value;
    // Los eventos inválidos los manda a la DLQ ranking-consumer; acá solo se ignoran.
    if (!esPartidaFinalizada(evento)) return;

    const dias = await diasDelCurso(evento.curso_id);
    if (!dias) {
      log(SERVICIO, "curso inexistente, se descarta", { event_id: evento.event_id, curso_id: evento.curso_id });
      return;
    }

    const fecha = fechaLocal(evento.ocurrido_en);
    const racha = await redis.actualizarRacha(
      `procesado:rachas:${evento.event_id}`,
      claveRacha(evento.curso_id, evento.alumno_id),
      claveJugados(evento.alumno_id, fecha),
      TTL_IDEMPOTENCIA_S,
      fecha,
      diaDeJuegoAnterior(fecha, dias) ?? "",
      esDiaDeJuego(fecha, dias) ? "1" : "0",
      TTL_JUGADOS_S,
    );
    if (racha === -1) {
      log(SERVICIO, "evento repetido, se descarta", { event_id: evento.event_id });
      return;
    }
    log(SERVICIO, "racha actualizada", { curso_id: evento.curso_id, alumno_id: evento.alumno_id, fecha, racha, offset: mensaje.offset });
  },
});

log(SERVICIO, "escuchando", { topic: TOPICS.PARTIDA_FINALIZADA });
