/**
 * rachas-consumer (grupo "rachas")
 * Lleva la racha de cada alumno: los días seguidos que jugó al menos una partida
 * (pantallas A3, A13 y A15). Si este consumidor se cae, el ranking y la
 * analítica siguen funcionando (escenario de disponibilidad del árbol de utilidad).
 */
import { Redis } from "ioredis";
import { CONSUMER_GROUPS, TOPICS, crearConsumidor, esPartidaFinalizada, log } from "@studyleague/shared";

const SERVICIO = "rachas-consumer";
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

await crearConsumidor({
  clientId: SERVICIO,
  groupId: CONSUMER_GROUPS.RACHAS,
  topics: [TOPICS.PARTIDA_FINALIZADA],
  async alRecibir(mensaje) {
    const evento = mensaje.value;
    if (!esPartidaFinalizada(evento)) return;

    const nuevo = await redis.set(`procesado:rachas:${evento.event_id}`, "1", "EX", 8 * 24 * 3600, "NX");
    if (nuevo === null) return;

    // TODO(PoC): calcular la racha.
    //  - leer racha:<alumno_id> = { ultimo_dia, dias }
    //  - si ultimo_dia es hoy: no cambia
    //  - si ultimo_dia es ayer (o el día de juego anterior del curso): dias + 1
    //  - si no: dias = 1
    log(SERVICIO, "partida recibida", { alumno_id: evento.alumno_id, offset: mensaje.offset });
  },
});

log(SERVICIO, "escuchando", { topic: TOPICS.PARTIDA_FINALIZADA });
