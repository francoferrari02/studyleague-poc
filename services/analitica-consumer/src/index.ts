/**
 * analitica-consumer (grupo "analitica")
 * Acumula respuestas y aciertos por concepto y curso (tabla analitica_concepto)
 * y detecta conceptos con bajo dominio: es procesamiento de eventos complejos,
 * porque el patrón surge de correlacionar muchas respuestas de distintos alumnos.
 *
 * Es a la vez consumidor de partida.finalizada y productor de concepto.bajo_dominio.
 * Si se detiene, al volver retoma desde su último offset y no pierde partidas; como
 * la marca de idempotencia (eventos_procesados) se guarda en la misma transacción que
 * los contadores, un evento que se vuelve a leer no se cuenta dos veces.
 *
 * No hace falta bloquear filas entre instancias: la clave es curso_id, así que cada
 * curso cae en una sola partición y lo procesa una sola instancia del grupo.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  CONSUMER_GROUPS,
  TOPICS,
  type ConceptoBajoDominio,
  type PartidaFinalizada,
  crearConsumidor,
  crearProductor,
  esPartidaFinalizada,
  log,
} from "@studyleague/shared";

const SERVICIO = "analitica-consumer";
const CONSUMIDOR = "analitica"; // valor de eventos_procesados.consumidor
const MIN_RESPUESTAS = Number(process.env.BAJO_DOMINIO_MIN_RESPUESTAS ?? 10);
const UMBRAL = Number(process.env.BAJO_DOMINIO_UMBRAL ?? 0.4);

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const productor = await crearProductor(SERVICIO);

interface ConceptoEnAlerta {
  concepto_id: string;
  respuestas: number;
  aciertos: number;
}

/**
 * Procesa el evento en una sola transacción. Devuelve los conceptos que acaban de cruzar
 * el umbral de bajo dominio, o null si el evento ya se había procesado.
 */
async function procesar(evento: PartidaFinalizada): Promise<ConceptoEnAlerta[] | null> {
  // Se agrupa por concepto: el resultado es el mismo que un upsert por respuesta, con menos consultas.
  const porConcepto = new Map<string, { respuestas: number; aciertos: number }>();
  for (const r of evento.respuestas) {
    const c = porConcepto.get(r.concepto_id) ?? { respuestas: 0, aciertos: 0 };
    c.respuestas += 1;
    c.aciertos += r.correcta ? 1 : 0;
    porConcepto.set(r.concepto_id, c);
  }
  const conceptos = [...porConcepto.keys()];

  const cliente = await db.connect();
  try {
    await cliente.query("BEGIN");

    // 1. Idempotencia: si el event_id ya está, el evento se procesó antes.
    const { rowCount } = await cliente.query(
      "INSERT INTO eventos_procesados (consumidor, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [CONSUMIDOR, evento.event_id],
    );
    if (rowCount === 0) {
      await cliente.query("ROLLBACK");
      return null;
    }

    // 2. Sumar respuestas y aciertos por concepto.
    await cliente.query(
      `INSERT INTO analitica_concepto AS a (curso_id, concepto_id, respuestas, aciertos)
       SELECT $1, * FROM unnest($2::text[], $3::integer[], $4::integer[])
       ON CONFLICT (curso_id, concepto_id) DO UPDATE
         SET respuestas = a.respuestas + EXCLUDED.respuestas,
             aciertos = a.aciertos + EXCLUDED.aciertos,
             actualizado_en = now()`,
      [
        evento.curso_id,
        conceptos,
        conceptos.map((c) => porConcepto.get(c)!.respuestas),
        conceptos.map((c) => porConcepto.get(c)!.aciertos),
      ],
    );

    // 3a. Un concepto que ya avisó y volvió a superar el umbral puede volver a avisar.
    await cliente.query(
      `UPDATE analitica_concepto SET alerta_enviada = false
        WHERE curso_id = $1 AND concepto_id = ANY($2::text[])
          AND alerta_enviada AND aciertos::float / respuestas >= $3`,
      [evento.curso_id, conceptos, UMBRAL],
    );

    // 3b. Marcar (una sola vez) los que cruzaron el umbral de bajo dominio.
    const { rows } = await cliente.query<ConceptoEnAlerta>(
      `UPDATE analitica_concepto SET alerta_enviada = true
        WHERE curso_id = $1 AND concepto_id = ANY($2::text[])
          AND respuestas >= $3 AND aciertos::float / respuestas < $4
          AND NOT alerta_enviada
        RETURNING concepto_id, respuestas, aciertos`,
      [evento.curso_id, conceptos, MIN_RESPUESTAS, UMBRAL],
    );

    await cliente.query("COMMIT");
    return rows;
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}

/** Publica el aviso reintentando: el evento ya quedó marcado como procesado, así que no se vuelve a leer. */
async function publicarAlerta(alerta: ConceptoBajoDominio) {
  for (let intento = 1; ; intento++) {
    try {
      await productor.publicar(TOPICS.CONCEPTO_BAJO_DOMINIO, alerta.curso_id, alerta);
      return;
    } catch (error) {
      if (intento >= 5) {
        log(SERVICIO, "no se pudo publicar el aviso de bajo dominio", { alerta, error: String(error) });
        return;
      }
      await new Promise((r) => setTimeout(r, 1000 * intento));
    }
  }
}

/** Errores de datos de PostgreSQL (clase 22 y 23, por ejemplo un concepto que no existe): reintentar no sirve. */
const esErrorDeDatos = (error: unknown) => /^2[23]/.test(String((error as { code?: string })?.code ?? ""));

await crearConsumidor({
  clientId: SERVICIO,
  groupId: CONSUMER_GROUPS.ANALITICA,
  topics: [TOPICS.PARTIDA_FINALIZADA],
  async alRecibir(mensaje) {
    const evento = mensaje.value;
    if (!esPartidaFinalizada(evento)) {
      log(SERVICIO, "evento inválido, a la DLQ", { offset: mensaje.offset });
      await productor.enviarADlq(TOPICS.PARTIDA_FINALIZADA_DLQ, mensaje.key ?? "sin-clave", evento, "no cumple el contrato");
      return;
    }

    let conceptosEnAlerta: ConceptoEnAlerta[] | null;
    try {
      conceptosEnAlerta = await procesar(evento);
    } catch (error) {
      if (!esErrorDeDatos(error)) throw error; // por ejemplo, PostgreSQL caído: se reintenta el mensaje
      log(SERVICIO, "evento con datos inválidos, a la DLQ", { event_id: evento.event_id, error: String(error) });
      await productor.enviarADlq(TOPICS.PARTIDA_FINALIZADA_DLQ, mensaje.key ?? evento.curso_id, evento, String(error));
      return;
    }

    if (conceptosEnAlerta === null) {
      log(SERVICIO, "evento repetido, se descarta", { event_id: evento.event_id });
      return;
    }

    // 4. Después del COMMIT: un concepto.bajo_dominio por cada concepto que cruzó el umbral.
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
      await publicarAlerta(alerta);
      log(SERVICIO, "concepto con bajo dominio", {
        curso_id: alerta.curso_id,
        concepto_id: alerta.concepto_id,
        respuestas: alerta.respuestas_totales,
        aciertos: alerta.aciertos,
      });
    }

    log(SERVICIO, "partida procesada", {
      event_id: evento.event_id,
      curso_id: evento.curso_id,
      respuestas: evento.respuestas.length,
      particion: mensaje.partition,
      offset: mensaje.offset,
    });
  },
});

log(SERVICIO, "escuchando", { topic: TOPICS.PARTIDA_FINALIZADA, regla: { MIN_RESPUESTAS, UMBRAL } });
