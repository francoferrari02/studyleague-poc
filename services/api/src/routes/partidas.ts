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
  fechaLocal,
  semanaIso,
} from "@studyleague/shared";
import { MENSAJES, exigirCurso, exigirRol, tieneAccesoCurso } from "../auth.js";
import { db, redis } from "../clients.js";
import type { PublicadorOutbox } from "../outbox.js";
import { clavePartidaDelDia, claveRespuestasCorregidas, crearSesion, DURACION_SESION_MS, leerSesion, type SesionPartida } from "../sesion-partida.js";

interface RespuestaDada {
  pregunta_id: string;
  /** Lo que eligió o escribió el alumno; el formato depende del minijuego. null si se acabó el tiempo. */
  respuesta_dada: unknown;
  tiempo_ms: number;
}

interface CuerpoPartida {
  sesion: string;
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
/** La marca de "partida del día" dura dos días: alcanza para cubrir el día local completo. */
const TTL_PARTIDA_DEL_DIA_S = 2 * 24 * 3600;
const TTL_CORREGIDAS_S = Math.ceil(DURACION_SESION_MS / 1000) + 600;
const esquemaSesion = { type: "string", minLength: 1, maxLength: 4000, description: "La sesión que devolvió GET /cursos/:cursoId/partida-nueva." } as const;

/** Valida que la sesión sea auténtica y de este alumno, curso y minijuego. Devuelve el error a mostrar o la sesión. */
function validarSesion(texto: string, alumnoId: string, cursoId: string, minijuego: Minijuego): { error: string } | (SesionPartida & { vencida: boolean }) {
  const sesion = leerSesion(texto);
  if (!sesion || sesion.alumno_id !== alumnoId || sesion.curso_id !== cursoId || sesion.minijuego !== minijuego)
    return { error: "La sesión de la partida no es válida. Empezá una partida nueva." };
  return sesion;
}

export async function rutasPartidas(app: FastifyInstance, opts: { outbox: PublicadorOutbox }) {
  app.get<{ Params: { cursoId: string }; Querystring: { minijuego: Minijuego } }>(
    "/cursos/:cursoId/partida-nueva",
    {
      schema: {
        summary: "Empezar una partida nueva",
        description:
          "Hasta 10 preguntas sin respuestas correctas ni explicaciones. Para un alumno, también arma la sesión de la partida " +
          "(partida_id y sesion firmada) que hay que mandar al corregir cada pregunta y en POST /partidas. La primera partida que " +
          "el alumno empieza en el día (hora de Argentina) en el curso suma al ranking; las siguientes son de práctica " +
          "(cuenta_para_ranking: false): se guardan y alimentan la analítica, pero no suman puntos al ranking. " +
          "Un docente recibe solo las preguntas, sin sesión.",
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
      const esAlumno = request.user.rol === "alumno";
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
      if (!esAlumno || rows.length === 0) return { curso_id: cursoId, minijuego, preguntas: rows };

      // Primera partida del día en el curso: la que suma al ranking. Se decide al empezar, no al terminar,
      // para que no convenga abrir una partida, ver las correcciones, abandonarla y jugar otra "sabiendo".
      const partida_id = randomUUID();
      const marcada = await redis.set(
        clavePartidaDelDia(cursoId, request.user.id, fechaLocal()),
        partida_id,
        "EX",
        TTL_PARTIDA_DEL_DIA_S,
        "NX",
      );
      const cuenta_para_ranking = marcada === "OK";
      const sesion = crearSesion({
        partida_id,
        alumno_id: request.user.id,
        curso_id: cursoId,
        minijuego,
        preguntas: rows.map((r) => r.pregunta_id as string),
        cuenta_para_ranking,
      });
      return { curso_id: cursoId, minijuego, partida_id, sesion, cuenta_para_ranking, preguntas: rows };
    },
  );

  const consultas = new Map<string, { desde: number; cantidad: number }>();
  const limpiar = setInterval(() => { for (const [id, c] of consultas) if (Date.now()-c.desde>=60_000) consultas.delete(id); }, 60_000);
  limpiar.unref();
  app.addHook("onClose", async () => clearInterval(limpiar));
  app.post<{ Params: { cursoId: string; preguntaId: string }; Body: { respuesta_dada: string | null; sesion: string } }>(
    "/cursos/:cursoId/preguntas/:preguntaId/correccion", {
      schema: {
        summary: "Feedback stateless de una pregunta de trivia (A6/A7)", tags: ["partidas"],
        description: "Exige la sesión de una partida de trivia en curso que incluya esa pregunta. Guarda la primera respuesta corregida de cada pregunta: si se vuelve a consultar con otra respuesta, se corrige la primera, y POST /partidas no acepta una distinta. No suma puntos ni publica eventos. Máximo 60 consultas por minuto y alumno en esta instancia; responde 429 y Retry-After al excederlo.",
        params: { type: "object", required: ["cursoId", "preguntaId"], properties: { cursoId: { type: "string", minLength: 1 }, preguntaId: { type: "string", minLength: 1 } } },
        body: { type: "object", required: ["respuesta_dada", "sesion"], additionalProperties: false, properties: { respuesta_dada: { anyOf: [{ type: "string", maxLength: 1000 }, { type: "null" }] }, sesion: esquemaSesion } },
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
      const sesion = validarSesion(request.body.sesion, request.user.id, request.params.cursoId, "trivia");
      if ("error" in sesion) return reply.code(400).send({ error: sesion.error });
      if (sesion.vencida) return reply.code(400).send({ error: "La partida venció. Empezá una partida nueva." });
      if (!sesion.preguntas.includes(request.params.preguntaId)) return reply.code(400).send({ error: "Esa pregunta no es de esta partida." });
      // Vale la primera respuesta de cada pregunta: reintentar la corrección no permite cambiarla.
      let respuesta: unknown = request.body.respuesta_dada;
      try {
        const clave = claveRespuestasCorregidas(sesion.partida_id);
        const [, , [, guardada]] = (await redis
          .multi()
          .hsetnx(clave, request.params.preguntaId, JSON.stringify(request.body.respuesta_dada))
          .expire(clave, TTL_CORREGIDAS_S)
          .hget(clave, request.params.preguntaId)
          .exec()) as Array<[Error | null, unknown]>;
        if (typeof guardada === "string") respuesta = JSON.parse(guardada);
      } catch (error) {
        request.log.warn({ err: error }, "no se pudo guardar la respuesta corregida en Redis");
      }
      return { correcta: corregirRespuesta("trivia", rows[0].respuesta, respuesta).correcta, respuesta_correcta: rows[0].respuesta, explicacion: rows[0].explicacion };
    });

  app.post<{ Body: CuerpoPartida }>(
    "/partidas",
    {
      schema: {
        summary: "Registrar una partida finalizada",
        description:
          "Exige la sesión de GET /cursos/:cursoId/partida-nueva y una respuesta por cada pregunta asignada. " +
          "Corrige las respuestas en el servidor y guarda en una sola transacción la partida, sus respuestas y el evento " +
          "partida.finalizada (outbox). No espera a Kafka ni a los consumidores: responde 202 enseguida. " +
          "El alumno sale del token. Formato de respuesta_dada: texto de la opción (trivia, verdadero_falso), " +
          "arreglo en orden (ordenar_secuencia), objeto { concepto: definición } (emparejar_conceptos) o texto libre " +
          "(definicion_palabras_clave). Reenviar la misma sesión devuelve la partida ya guardada, sin duplicarla.",
        tags: ["partidas"],
        body: {
          type: "object",
          required: ["sesion", "curso_id", "minijuego", "respuestas"],
          properties: {
            sesion: esquemaSesion,
            partida_id: { type: "string", format: "uuid", description: "Opcional; si viene, tiene que ser el de la sesión." },
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

      const sesion = validarSesion(request.body.sesion, alumno_id, curso_id, minijuego);
      if ("error" in sesion) return reply.code(400).send({ error: sesion.error });
      if (request.body.partida_id && request.body.partida_id !== sesion.partida_id)
        return reply.code(400).send({ error: "El partida_id no corresponde a la sesión." });
      const partida_id = sesion.partida_id;
      if (sesion.vencida) {
        // Reenviar una partida ya guardada sigue funcionando; empezar a registrar una vencida, no.
        const { rowCount } = await db.query("SELECT 1 FROM partidas WHERE id = $1", [partida_id]);
        if (!rowCount) return reply.code(400).send({ error: "La partida venció. Empezá una partida nueva." });
      }

      const ids = respuestas.map((r) => r.pregunta_id);
      if (new Set(ids).size !== ids.length) {
        return reply.code(400).send({ error: "Hay preguntas repetidas en la partida." });
      }
      // Exactamente las preguntas que asignó el servidor: ni otras ni de más ni de menos.
      if (ids.length !== sesion.preguntas.length || ids.some((id) => !sesion.preguntas.includes(id))) {
        return reply.code(400).send({ error: "Las respuestas no corresponden a las preguntas de esta partida." });
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
      // Una respuesta que ya se corrigió durante la partida no se puede cambiar al registrarla.
      try {
        const guardadas = await redis.hgetall(claveRespuestasCorregidas(partida_id));
        const cambiada = respuestas.find(
          (r) => guardadas[r.pregunta_id] !== undefined && guardadas[r.pregunta_id] !== JSON.stringify(r.respuesta_dada ?? null),
        );
        if (cambiada)
          return reply.code(400).send({ error: `La respuesta de ${cambiada.pregunta_id} no coincide con la que ya se corrigió.` });
      } catch (error) {
        request.log.warn({ err: error }, "no se pudieron leer las respuestas corregidas en Redis");
      }

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
        partida_id,
        curso_id,
        alumno_id,
        minijuego,
        puntaje: calcularPuntaje(respuestasEvento),
        cuenta_para_ranking: sesion.cuenta_para_ranking,
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
        return reply.code(202).send({ partida_id: existente.id, event_id: existente.event_id, puntaje: existente.puntaje, cuenta_para_ranking: evento.cuenta_para_ranking, aciertos: correccion.filter(r=>r.correcta).length, total: correccion.length, correccion });
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
        cuenta_para_ranking: sesion.cuenta_para_ranking,
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
          "el anterior y los compañeros inmediatamente arriba y abajo (A12 → A13). Solo el alumno dueño de la partida. " +
          "En una partida de práctica (cuenta_para_ranking: false) el puesto es el que el alumno ya tenía (null si no está en el ranking).",
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
      // Vale "1" si la partida sumó al ranking y "practica" si no (ver ranking-consumer).
      const marca = await redis.get(claveProcesado(partida.event_id));
      if (marca === null) return { estado: "pendiente" };
      const cuenta_para_ranking = marca !== "practica";

      const clave = claveRanking(partida.curso_id, semanaIso(partida.finalizada_en));
      const [rango, puntos, antes] = await Promise.all([
        redis.zrevrank(clave, partida.alumno_id),
        redis.zscore(clave, partida.alumno_id),
        redis.get(clavePuestoAntes(partida.event_id)),
      ]);
      if (rango === null) {
        // Práctica de un alumno que todavía no sumó puntos esta semana: no tiene puesto.
        if (!cuenta_para_ranking) return { estado: "actualizado", cuenta_para_ranking, puesto: null, puesto_anterior: null, puntos: 0, vecinos: [] };
        return { estado: "pendiente" }; // el ranking de la semana se borró a mano
      }

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
        cuenta_para_ranking,
        puesto: rango + 1,
        // null: no estaba en el ranking antes de esta partida (o ya venció el dato, 1 hora).
        puesto_anterior: antes && antes !== "0" ? Number(antes) : null,
        puntos: Number(puntos),
        vecinos: vecinos.map((v) => ({ ...v, nombre_visible: nombrePorId.get(v.alumno_id) ?? null })),
      };
    },
  );
}
