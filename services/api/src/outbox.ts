/**
 * Publicador del transactional outbox, dentro del proceso de la API.
 *
 * POST /partidas guarda la partida y su evento en la misma transacción (tabla outbox).
 * Este publicador lee lo pendiente, lo publica en Kafka y lo marca con publicado_en.
 * Si Kafka no responde, no marca nada: la próxima vuelta lo reintenta. Así una partida
 * nunca se pierde aunque Kafka esté caído (riesgo de doble escritura, sección 7 del white paper).
 *
 * Con FOR UPDATE SKIP LOCKED varias instancias de la API pueden publicar en paralelo sin
 * tomar la misma fila. Si un evento se publica dos veces (por ejemplo, se cae la API entre
 * publicar y marcar), los consumidores lo descartan por event_id.
 */
import type { FastifyBaseLogger } from "fastify";
import { type Evento, type TopicName, crearProductor } from "@studyleague/shared";
import { db } from "./clients.js";

type Productor = Awaited<ReturnType<typeof crearProductor>>;

const INTERVALO_MS = 200;
const LOTE = 100;

export function iniciarPublicadorOutbox(productor: Productor, log: FastifyBaseLogger) {
  let corriendo = false;
  let otraVuelta = false;
  let kafkaCaido = false;

  /** Publica un lote. Devuelve cuántos eventos publicó. */
  async function publicarLote(): Promise<number> {
    const cliente = await db.connect();
    try {
      await cliente.query("BEGIN");
      const { rows } = await cliente.query<{ event_id: string; topic: TopicName; clave: string; payload: Evento }>(
        `SELECT event_id, topic, clave, payload
           FROM outbox
          WHERE publicado_en IS NULL
          ORDER BY creado_en
          LIMIT ${LOTE}
          FOR UPDATE SKIP LOCKED`,
      );
      if (rows.length === 0) {
        await cliente.query("COMMIT");
        return 0;
      }
      // librdkafka mantiene el orden de envío dentro de cada partición (productor idempotente).
      await Promise.all(rows.map((fila) => productor.publicar(fila.topic, fila.clave, fila.payload)));
      await cliente.query("UPDATE outbox SET publicado_en = clock_timestamp() WHERE event_id = ANY($1::uuid[])", [
        rows.map((fila) => fila.event_id),
      ]);
      await cliente.query("COMMIT");
      return rows.length;
    } catch (error) {
      await cliente.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      cliente.release();
    }
  }

  async function vuelta() {
    if (corriendo) {
      otraVuelta = true;
      return;
    }
    corriendo = true;
    try {
      let publicados: number;
      do {
        otraVuelta = false;
        publicados = await publicarLote();
        if (publicados > 0) log.debug({ publicados }, "outbox: eventos publicados");
        if (kafkaCaido) {
          kafkaCaido = false;
          log.info("outbox: Kafka volvió a responder, se publicó lo pendiente");
        }
      } while (otraVuelta || publicados === LOTE);
    } catch (error) {
      if (!kafkaCaido) log.warn({ err: error }, "outbox: no se pudo publicar, se reintenta en la próxima vuelta");
      kafkaCaido = true;
    } finally {
      corriendo = false;
    }
  }

  const temporizador = setInterval(() => void vuelta(), INTERVALO_MS);

  return {
    /** Se llama apenas se confirma una partida: la latencia no depende del intervalo. */
    despertar: () => void vuelta(),
    detener: () => clearInterval(temporizador),
  };
}

export type PublicadorOutbox = ReturnType<typeof iniciarPublicadorOutbox>;
