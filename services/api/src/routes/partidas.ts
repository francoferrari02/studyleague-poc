import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  TOPICS,
  type Minijuego,
  type PartidaFinalizada,
  type RespuestaEvento,
  calcularPuntaje,
  claveProcesado,
  claveRanking,
  corregirRespuesta,
  semanaIso,
} from "@studyleague/shared";
import { MENSAJES, exigirCurso, exigirRol, tieneAccesoCurso } from "../auth.js";
import { db, redis } from "../clients.js";
import type { PublicadorOutbox } from "../outbox.js";

interface RespuestaDada {
  pregunta_id: string;
  /** Lo que eligió o escribió el alumno; el formato depende del minijuego. null si se acabó el tiempo. */
  respuesta_dada: unknown;
  tiempo_ms: number;
}

interface CuerpoPartida {
  partida_id?: string;
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
          "Hasta 10 preguntas sin respuestas correctas ni explicaciones. El feedback se obtiene al responder mediante POST /cursos/:cursoId/preguntas/:preguntaId/correccion.",
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
                c.nombre AS concepto_nombre
           FROM preguntas p
           JOIN conceptos c ON c.id = p.concepto_id
           JOIN cursos curso ON curso.id = c.curso_id
          WHERE c.curso_id = $1 AND p.minijuego = $2 AND $2 = ANY(curso.minijuegos)
          ORDER BY random()
          LIMIT $3`,
        [cursoId, minijuego, PREGUNTAS_POR_PARTIDA],
      );
      return { curso_id: cursoId, minijuego, preguntas: rows };
    },
  );

  const consultas = new Map<string, { desde: number; cantidad: number }>();
  const limpiar = setInterval(() => { for (const [id, c] of consultas) if (Date.now()-c.desde>=60_000) consultas.delete(id); }, 60_000);
  limpiar.unref();
  app.addHook("onClose", async () => clearInterval(limpiar));
  app.post<{ Params: { cursoId: string; preguntaId: string }; Body: { respuesta_dada: string | null } }>(
    "/cursos/:cursoId/preguntas/:preguntaId/correccion", {
      schema: {
        summary: "Feedback stateless de una pregunta de trivia (A6/A7)", tags: ["partidas"],
        description: "No registra respuestas, puntos ni eventos. Solo para un alumno inscripto con trivia habilitada. Máximo 60 consultas por minuto y alumno en esta instancia; responde 429 y Retry-After al excederlo.",
        params: { type: "object", required: ["cursoId", "preguntaId"], properties: { cursoId: { type: "string", minLength: 1 }, preguntaId: { type: "string", minLength: 1 } } },
        body: { type: "object", required: ["respuesta_dada"], additionalProperties: false, properties: { respuesta_dada: { anyOf: [{ type: "string", maxLength: 1000 }, { type: "null" }] } } },
        response: { 200: { type: "object", required: ["correcta", "respuesta_correcta", "explicacion"], properties: { correcta: { type: "boolean" }, respuesta_correcta: { type: "string" }, explicacion: { type: "string" } } } },
      }, preHandler: exigirCurso("alumno"),
    }, async (request, reply) => {
      const ahora = Date.now();
      const anterior = consultas.get(request.user.id);
      const contador = anterior && ahora-anterior.desde<60_000 ? anterior : { desde: ahora, cantidad: 0 };
      consultas.set(request.user.id, contador);
      if (++contador.cantidad > 60) return reply.header("Retry-After", Math.ceil((60_000-(ahora-contador.desde))/1000)).code(429).send({ error: "Hiciste muchas consultas. Esperá un minuto para seguir." });
      const { rows } = await db.query<{ respuesta: string; explicacion: string }>(
        `SELECT p.respuesta, p.explicacion FROM preguntas p JOIN conceptos c ON c.id=p.concepto_id JOIN cursos curso ON curso.id=c.curso_id
         WHERE p.id=$1 AND c.curso_id=$2 AND p.minijuego='trivia' AND 'trivia'=ANY(curso.minijuegos)`, [request.params.preguntaId, request.params.cursoId]);
      if (!rows[0]) return reply.code(404).send({ error: "No encontramos esa pregunta de trivia disponible." });
      return { correcta: corregirRespuesta("trivia", rows[0].respuesta, request.body.respuesta_dada).correcta, respuesta_correcta: rows[0].respuesta, explicacion: rows[0].explicacion };
    });

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
            partida_id: { type: "string", format: "uuid" },
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
        partida_id: request.body.partida_id ?? randomUUID(),
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

      async function resultadoExistente() {
        const { rows: existentes } = await db.query("SELECT * FROM partidas WHERE id=$1", [evento.partida_id]);
        const existente = existentes[0];
        if (!existente || existente.alumno_id !== alumno_id || existente.curso_id !== curso_id || existente.minijuego !== minijuego)
          return reply.code(409).send({ error: "Ese identificador ya pertenece a otra partida." });
        const { rows: correccion } = await db.query("SELECT r.pregunta_id,r.correcta,p.explicacion FROM respuestas r JOIN preguntas p ON p.id=r.pregunta_id WHERE r.partida_id=$1 ORDER BY r.pregunta_id", [existente.id]);
        return reply.code(202).send({ partida_id: existente.id, event_id: existente.event_id, puntaje: existente.puntaje, aciertos: correccion.filter(r=>r.correcta).length, total: correccion.length, correccion });
      }
      // Una sola transacción: partida + respuestas + evento en el outbox (sin doble escritura).
      const cliente = await db.connect();
      try {
        await cliente.query("BEGIN");
        const insertada = await cliente.query(
          `INSERT INTO partidas (id, event_id, curso_id, alumno_id, minijuego, puntaje, finalizada_en)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING RETURNING id`,
          [evento.partida_id, evento.event_id, curso_id, alumno_id, minijuego, evento.puntaje, ocurridoEn],
        );
        if (insertada.rowCount === 0) { await cliente.query("ROLLBACK"); return await resultadoExistente(); }
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

  app.get<{ Params: { partidaId: string } }>(
    "/partidas/:partidaId/ranking",
    {
      schema: {
        summary: "Estado del ranking después de una partida",
        description:
          'Mientras ranking-consumer no procesó el evento devuelve { estado: "pendiente" }; después, el puesto nuevo, ' +
          "el anterior y los compañeros inmediatamente arriba y abajo (A12 → A13). Solo el alumno dueño de la partida.",
        tags: ["partidas"],
        params: {
          type: "object",
          required: ["partidaId"],
          properties: { partidaId: { type: "string", format: "uuid" } },
        },
      },
      preHandler: exigirRol("alumno"),
    },
    async (request, reply) => {
      const { rows } = await db.query<{ event_id: string; curso_id: string; alumno_id: string; finalizada_en: Date }>(
        "SELECT event_id, curso_id, alumno_id, finalizada_en FROM partidas WHERE id = $1",
        [request.params.partidaId],
      );
      const partida = rows[0];
      if (!partida) return reply.code(404).send({ error: "No encontramos esa partida." });
      if (partida.alumno_id !== request.user.id) return reply.code(403).send({ error: MENSAJES.sinPermiso });

      // La marca la deja ranking-consumer en el mismo paso atómico en que suma los puntos.
      if (!(await redis.exists(claveProcesado(partida.event_id)))) return { estado: "pendiente" };

      const clave = claveRanking(partida.curso_id, semanaIso(partida.finalizada_en));
      const [rango, puntos, antes] = await Promise.all([
        redis.zrevrank(clave, partida.alumno_id),
        redis.zscore(clave, partida.alumno_id),
        redis.get(clavePuestoAntes(partida.event_id)),
      ]);
      if (rango === null) return { estado: "pendiente" }; // el ranking de la semana se borró a mano

      const alrededor = await redis.zrevrange(clave, Math.max(0, rango - 1), rango + 1, "WITHSCORES");
      const vecinos: Array<{ puesto: number; alumno_id: string; puntos: number }> = [];
      for (let i = 0, puesto = Math.max(0, rango - 1) + 1; i < alrededor.length; i += 2, puesto++) {
        if (alrededor[i] !== partida.alumno_id) vecinos.push({ puesto, alumno_id: alrededor[i], puntos: Number(alrededor[i + 1]) });
      }
      const { rows: nombres } = await db.query<{ id: string; nombre_visible: string }>(
        "SELECT id, nombre_visible FROM alumnos WHERE id = ANY($1::text[])",
        [vecinos.map((v) => v.alumno_id)],
      );
      const nombrePorId = new Map(nombres.map((n) => [n.id, n.nombre_visible]));

      return {
        estado: "actualizado",
        puesto: rango + 1,
        // null: no estaba en el ranking antes de esta partida (o ya venció el dato, 1 hora).
        puesto_anterior: antes && antes !== "0" ? Number(antes) : null,
        puntos: Number(puntos),
        vecinos: vecinos.map((v) => ({ ...v, nombre_visible: nombrePorId.get(v.alumno_id) ?? null })),
      };
    },
  );
}
