import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  TOPICS,
  type Minijuego,
  type PartidaFinalizada,
  type RespuestaEvento,
  calcularPuntaje,
  claveRanking,
  corregirRespuesta,
  semanaIso,
} from "@studyleague/shared";
import { MENSAJES, exigirCurso, tieneAccesoCurso } from "../auth.js";
import { db, redis } from "../clients.js";
import type { PublicadorOutbox } from "../outbox.js";

interface RespuestaDada {
  pregunta_id: string;
  /** Lo que eligió o escribió el alumno; el formato depende del minijuego. null si se acabó el tiempo. */
  respuesta_dada: unknown;
  tiempo_ms: number;
}

interface CuerpoPartida {
  curso_id: string;
  minijuego: Minijuego;
  respuestas: RespuestaDada[];
}

const MINIJUEGOS: Minijuego[] = [
  "verdadero_falso",
  "trivia",
  "ordenar_secuencia",
  "emparejar_conceptos",
  "definicion_palabras_clave",
];
const PREGUNTAS_POR_PARTIDA = 10;

/** Puesto del alumno antes de la partida, para "¡Subiste al puesto N!" (B4). Vence en 1 hora. */
export const clavePuestoAntes = (eventId: string) => `puesto_antes:${eventId}`;
const TTL_PUESTO_ANTES_S = 3600;

export async function rutasPartidas(app: FastifyInstance, opts: { outbox: PublicadorOutbox }) {
  app.get<{ Params: { cursoId: string }; Querystring: { minijuego: Minijuego } }>(
    "/cursos/:cursoId/partida-nueva",
    {
      schema: {
        summary: "Preguntas para una partida nueva",
        description:
          "Hasta 10 preguntas del curso para ese minijuego, mezcladas al azar. Incluye respuesta_correcta y explicacion " +
          "para mostrar el resultado al instante (A6, A7); la corrección que vale es la del servidor en POST /partidas.",
        tags: ["partidas"],
        querystring: {
          type: "object",
          required: ["minijuego"],
          properties: { minijuego: { type: "string", enum: MINIJUEGOS } },
        },
      },
      preHandler: exigirCurso("alumno", "docente"),
    },
    async (request) => {
      const { cursoId } = request.params;
      const { minijuego } = request.query;
      const { rows } = await db.query(
        `SELECT p.id AS pregunta_id, p.concepto_id, p.enunciado, p.opciones,
                p.respuesta AS respuesta_correcta, p.explicacion
           FROM preguntas p
           JOIN conceptos c ON c.id = p.concepto_id
          WHERE c.curso_id = $1 AND p.minijuego = $2
          ORDER BY random()
          LIMIT $3`,
        [cursoId, minijuego, PREGUNTAS_POR_PARTIDA],
      );
      return { curso_id: cursoId, minijuego, preguntas: rows };
    },
  );

  app.post<{ Body: CuerpoPartida }>(
    "/partidas",
    {
      schema: {
        summary: "Registrar una partida finalizada",
        description:
          "Corrige las respuestas en el servidor y guarda en una sola transacción la partida, sus respuestas y el evento " +
          "partida.finalizada (outbox). No espera a Kafka ni a los consumidores: responde 202 enseguida. " +
          "El alumno sale del token. Formato de respuesta_dada: texto de la opción (trivia, verdadero_falso), " +
          "arreglo en orden (ordenar_secuencia), objeto { concepto: definición } (emparejar_conceptos) o texto libre " +
          "(definicion_palabras_clave).",
        tags: ["partidas"],
        body: {
          type: "object",
          required: ["curso_id", "minijuego", "respuestas"],
          properties: {
            curso_id: { type: "string" },
            minijuego: { type: "string", enum: MINIJUEGOS },
            respuestas: {
              type: "array",
              minItems: 1,
              maxItems: 50,
              items: {
                type: "object",
                required: ["pregunta_id", "respuesta_dada", "tiempo_ms"],
                properties: {
                  pregunta_id: { type: "string" },
                  respuesta_dada: { description: "Depende del minijuego; null si se acabó el tiempo." },
                  tiempo_ms: { type: "integer", minimum: 0, maximum: 600000 },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { curso_id, minijuego, respuestas } = request.body;
      // El alumno sale del token, nunca del cuerpo: nadie puede jugar a nombre de otro.
      if (!(await tieneAccesoCurso(request.user, curso_id, ["alumno"]))) {
        return reply.code(403).send({ error: MENSAJES.sinPermiso });
      }
      const alumno_id = request.user.id;

      const ids = respuestas.map((r) => r.pregunta_id);
      if (new Set(ids).size !== ids.length) {
        return reply.code(400).send({ error: "Hay preguntas repetidas en la partida." });
      }

      const { rows: preguntas } = await db.query<{
        id: string;
        concepto_id: string;
        minijuego: Minijuego;
        respuesta: unknown;
        explicacion: string;
      }>(
        `SELECT p.id, p.concepto_id, p.minijuego, p.respuesta, p.explicacion
           FROM preguntas p
           JOIN conceptos c ON c.id = p.concepto_id
          WHERE p.id = ANY($1::text[]) AND c.curso_id = $2`,
        [ids, curso_id],
      );
      const porId = new Map(preguntas.map((p) => [p.id, p]));
      const ajena = ids.find((id) => porId.get(id)?.minijuego !== minijuego);
      if (ajena) {
        return reply.code(400).send({ error: `La pregunta ${ajena} no es de este curso o de este minijuego.` });
      }

      // Corrección en el servidor: la única que vale.
      const corregidas = respuestas.map((r) => {
        const pregunta = porId.get(r.pregunta_id)!;
        return { ...r, pregunta, ...corregirRespuesta(minijuego, pregunta.respuesta, r.respuesta_dada) };
      });
      const respuestasEvento: RespuestaEvento[] = corregidas.map((r) => ({
        pregunta_id: r.pregunta_id,
        concepto_id: r.pregunta.concepto_id,
        correcta: r.correcta,
        tiempo_ms: r.tiempo_ms,
      }));

      const ocurridoEn = new Date();
      const evento: PartidaFinalizada = {
        event_id: randomUUID(),
        tipo: "partida.finalizada",
        version: 1,
        ocurrido_en: ocurridoEn.toISOString(),
        partida_id: randomUUID(),
        curso_id,
        alumno_id,
        minijuego,
        puntaje: calcularPuntaje(respuestasEvento),
        respuestas: respuestasEvento,
      };

      // Puesto antes de la partida (0 = todavía no estaba en el ranking). Si Redis falla, la partida igual se guarda.
      try {
        const rango = await redis.zrevrank(claveRanking(curso_id, semanaIso(ocurridoEn)), alumno_id);
        await redis.set(clavePuestoAntes(evento.event_id), rango === null ? 0 : rango + 1, "EX", TTL_PUESTO_ANTES_S);
      } catch (error) {
        request.log.warn({ err: error }, "no se pudo leer el puesto anterior en Redis");
      }

      // Una sola transacción: partida + respuestas + evento en el outbox (sin doble escritura).
      const cliente = await db.connect();
      try {
        await cliente.query("BEGIN");
        await cliente.query(
          `INSERT INTO partidas (id, event_id, curso_id, alumno_id, minijuego, puntaje, finalizada_en)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [evento.partida_id, evento.event_id, curso_id, alumno_id, minijuego, evento.puntaje, ocurridoEn],
        );
        await cliente.query(
          `INSERT INTO respuestas (partida_id, pregunta_id, correcta, tiempo_ms, respuesta_dada)
           SELECT $1, * FROM unnest($2::text[], $3::boolean[], $4::integer[], $5::jsonb[])`,
          [
            evento.partida_id,
            corregidas.map((r) => r.pregunta_id),
            corregidas.map((r) => r.correcta),
            corregidas.map((r) => r.tiempo_ms),
            corregidas.map((r) => JSON.stringify(r.respuesta_dada ?? null)),
          ],
        );
        await cliente.query(`INSERT INTO outbox (event_id, topic, clave, payload) VALUES ($1, $2, $3, $4)`, [
          evento.event_id,
          TOPICS.PARTIDA_FINALIZADA,
          curso_id, // clave = curso_id: las partidas de un curso quedan en orden en su partición
          JSON.stringify(evento),
        ]);
        await cliente.query("COMMIT");
      } catch (error) {
        await cliente.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        cliente.release();
      }
      opts.outbox.despertar();

      return reply.code(202).send({
        partida_id: evento.partida_id,
        event_id: evento.event_id,
        puntaje: evento.puntaje,
        aciertos: corregidas.filter((r) => r.correcta).length,
        total: corregidas.length,
        correccion: corregidas.map((r) => ({
          pregunta_id: r.pregunta_id,
          correcta: r.correcta,
          explicacion: r.pregunta.explicacion,
          ...(r.palabras_encontradas ? { palabras_encontradas: r.palabras_encontradas } : {}),
        })),
      });
    },
  );
}
