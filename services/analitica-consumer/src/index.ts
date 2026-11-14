/**
 * analitica-consumer (grupo "analitica")
 * Acumula respuestas y aciertos por concepto y curso (tabla analitica_concepto)
 * y detecta conceptos con bajo dominio: es procesamiento de eventos complejos,
 * porque el patrón surge de correlacionar muchas respuestas de distintos alumnos.
 *
 * Es a la vez consumidor de partida.finalizada y productor de concepto.bajo_dominio.
 * Si se detiene, al volver retoma desde su último offset y no pierde partidas.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  CONSUMER_GROUPS,
  TOPICS,
  type ConceptoBajoDominio,
  crearConsumidor,
  crearProductor,
  esPartidaFinalizada,
  log,
} from "@studyleague/shared";

const SERVICIO = "analitica-consumer";
const MIN_RESPUESTAS = Number(process.env.BAJO_DOMINIO_MIN_RESPUESTAS ?? 10);
const UMBRAL = Number(process.env.BAJO_DOMINIO_UMBRAL ?? 0.4);

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const productor = await crearProductor(SERVICIO);

await crearConsumidor({
  clientId: SERVICIO,
  groupId: CONSUMER_GROUPS.ANALITICA,
  topics: [TOPICS.PARTIDA_FINALIZADA],
  async alRecibir(mensaje) {
    const evento = mensaje.value;
    if (!esPartidaFinalizada(evento)) return;

    // TODO(PoC): todo esto en una sola transacción:
    //  1. INSERT INTO eventos_procesados (consumidor, event_id) ... ON CONFLICT DO NOTHING;
    //     si no insertó, el evento ya se procesó: salir (idempotencia).
    //  2. Por cada respuesta: UPSERT en analitica_concepto (respuestas + 1, aciertos + correcta).
    //  3. Releer los conceptos tocados y, si respuestas >= MIN_RESPUESTAS y
    //     aciertos / respuestas < UMBRAL y todavía no se avisó, marcar alerta_enviada.
    //  4. Después del COMMIT, publicar concepto.bajo_dominio por cada concepto marcado.
    const conceptosEnAlerta: Array<{ concepto_id: string; respuestas: number; aciertos: number }> = [];
    void db;

    for (const c of conceptosEnAlerta) {
      const alerta: ConceptoBajoDominio = {
        event_id: randomUUID(),
        tipo: "concepto.bajo_dominio",
        version: 1,
        ocurrido_en: new Date().toISOString(),
        curso_id: evento.curso_id,
        concepto_id: c.concepto_id,
        respuestas_totales: c.respuestas,
        aciertos: c.aciertos,
        porcentaje_aciertos: c.aciertos / c.respuestas,
      };
      await productor.publicar(TOPICS.CONCEPTO_BAJO_DOMINIO, evento.curso_id, alerta);
    }

    log(SERVICIO, "partida recibida", {
      curso_id: evento.curso_id,
      respuestas: evento.respuestas.length,
      offset: mensaje.offset,
      regla: { MIN_RESPUESTAS, UMBRAL },
    });
  },
});

log(SERVICIO, "escuchando", { topic: TOPICS.PARTIDA_FINALIZADA });
