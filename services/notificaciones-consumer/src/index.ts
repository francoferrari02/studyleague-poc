/**
 * notificaciones-consumer (grupo "notificaciones")
 * Recibe concepto.bajo_dominio y crea el aviso para el docente del curso
 * (pantalla D8: campana con contador y toast).
 *
 * Idempotente: notificaciones.event_id es único, así que un aviso repetido no se duplica.
 */
import pg from "pg";
import { CONSUMER_GROUPS, TOPICS, crearConsumidor, esConceptoBajoDominio, log } from "@studyleague/shared";

const SERVICIO = "notificaciones-consumer";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await crearConsumidor({
  clientId: SERVICIO,
  groupId: CONSUMER_GROUPS.NOTIFICACIONES,
  topics: [TOPICS.CONCEPTO_BAJO_DOMINIO],
  async alRecibir(mensaje) {
    const evento = mensaje.value;
    if (!esConceptoBajoDominio(evento)) {
      // No hay DLQ para este tópico: queda en el log para revisarlo a mano.
      log(SERVICIO, "evento inválido, se descarta", { offset: mensaje.offset, evento });
      return;
    }

    const { rows } = await db.query<{ docente_id: string; curso: string; concepto: string }>(
      `SELECT c.docente_id, c.nombre AS curso, k.nombre AS concepto
         FROM cursos c
         JOIN conceptos k ON k.curso_id = c.id
        WHERE c.id = $1 AND k.id = $2`,
      [evento.curso_id, evento.concepto_id],
    );
    const datos = rows[0];
    if (!datos) {
      log(SERVICIO, "curso o concepto inexistente, se descarta", { event_id: evento.event_id });
      return;
    }

    const texto = `${datos.curso}: ${datos.concepto} tiene bajo dominio (${Math.round(evento.porcentaje_aciertos * 100)}%)`;
    const { rowCount } = await db.query(
      `INSERT INTO notificaciones (event_id, docente_id, curso_id, concepto_id, mensaje)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_id) DO NOTHING`,
      [evento.event_id, datos.docente_id, evento.curso_id, evento.concepto_id, texto],
    );
    if (rowCount === 0) {
      log(SERVICIO, "evento repetido, se descarta", { event_id: evento.event_id });
      return;
    }
    log(SERVICIO, "aviso creado", { event_id: evento.event_id, docente_id: datos.docente_id, curso_id: evento.curso_id, concepto_id: evento.concepto_id });
  },
});

log(SERVICIO, "escuchando", { topic: TOPICS.CONCEPTO_BAJO_DOMINIO });
