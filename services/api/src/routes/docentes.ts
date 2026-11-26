import type { FastifyInstance } from "fastify";
import { db } from "../clients.js";
import { proximoDia } from "./alumnos.js";
import { MENSAJES, exigirCurso, exigirRol } from "../auth.js";

export async function rutasDocentes(app: FastifyInstance) {
  app.get("/docentes/yo/cursos", { schema: { summary: "Perfil y cursos propios con participación semanal (D2)", tags: ["docente"] }, preHandler: exigirRol("docente") }, async request => {
    const [{ rows: perfil }, { rows: cursos }] = await Promise.all([
      db.query("SELECT d.nombre,e.nombre AS escuela FROM docentes d JOIN escuelas e ON e.id=d.escuela_id WHERE d.id=$1", [request.user.id]),
      db.query(`SELECT c.id,c.nombre,c.dias_juego,c.minijuegos,
        (SELECT count(*)::int FROM inscripciones WHERE curso_id=c.id) AS alumnos,
        (SELECT count(DISTINCT alumno_id)::int FROM partidas WHERE curso_id=c.id AND finalizada_en>=date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS participaron,
        (SELECT count(*)::int FROM analitica_concepto WHERE curso_id=c.id AND respuestas>=10 AND aciertos::float/respuestas<0.4) AS bajo_dominio
        FROM cursos c WHERE c.docente_id=$1 ORDER BY c.id`, [request.user.id]),
    ]);
    return { docente: perfil[0], cursos: cursos.map(c=>({...c,...proximoDia(c.dias_juego)})) };
  });
  app.get<{ Params: { cursoId: string; conceptoId: string } }>("/cursos/:cursoId/conceptos/:conceptoId", {
    schema: { summary: "Detalle agregado de concepto y distribución de opciones (D7)", tags: ["docente"], params: { type: "object", required: ["cursoId", "conceptoId"], properties: { cursoId: { type: "string", minLength: 1 }, conceptoId: { type: "string", minLength: 1 } } } }, preHandler: exigirCurso("docente"),
  }, async (request, reply) => {
    const {cursoId,conceptoId}=request.params;
    const { rows: conceptos }=await db.query(`SELECT c.id AS concepto_id,c.nombre,curso.nombre AS curso_nombre,coalesce(a.respuestas,0) AS respuestas,coalesce(a.aciertos,0) AS aciertos,coalesce(a.alerta_enviada,false) AS alerta_enviada
      FROM conceptos c JOIN cursos curso ON curso.id=c.curso_id LEFT JOIN analitica_concepto a ON a.curso_id=c.curso_id AND a.concepto_id=c.id WHERE c.id=$1 AND c.curso_id=$2`,[conceptoId,cursoId]);
    if (!conceptos[0]) return reply.code(404).send({error:"No encontramos ese concepto en este curso."});
    // El snapshot histórico es ficticio pero tiene votos por opción. Se combina
    // con las respuestas de partidas reales para que el detalle cuadre con el
    // contador agregado que muestra la analítica del curso.
    const votosSql = `
      SELECT b.pregunta_id, b.alumno_id, b.respuesta_dada, true AS precargada
        FROM analitica_respuestas_base b
        JOIN preguntas q ON q.id=b.pregunta_id
       WHERE q.concepto_id=$2
      UNION ALL
      SELECT r.pregunta_id, p.alumno_id, r.respuesta_dada #>> '{}', false AS precargada
        FROM respuestas r
        JOIN partidas p ON p.id=r.partida_id
        JOIN preguntas q ON q.id=r.pregunta_id
       WHERE p.curso_id=$1 AND q.concepto_id=$2`;
    const [{ rows: alumnos },{rows: preguntas},{rows: distribucion}]=await Promise.all([
      db.query(`SELECT count(DISTINCT alumno_id)::int AS cantidad,
                       count(*) FILTER (WHERE precargada)::int AS respuestas_historial
                  FROM (${votosSql}) v`,[cursoId,conceptoId]),
      db.query(`SELECT q.id,q.enunciado,q.opciones,q.respuesta AS respuesta_correcta,q.explicacion,
                       count(v.pregunta_id)::int AS respuestas,
                       count(v.pregunta_id) FILTER (WHERE v.respuesta_dada IS DISTINCT FROM (q.respuesta #>> '{}'))::int AS errores
                  FROM preguntas q LEFT JOIN (${votosSql}) v ON v.pregunta_id=q.id
                 WHERE q.concepto_id=$2 AND q.minijuego='trivia'
                 GROUP BY q.id ORDER BY errores DESC,q.id`,[cursoId,conceptoId]),
      db.query(`SELECT v.pregunta_id,v.respuesta_dada,count(*)::int AS cantidad
                  FROM (${votosSql}) v GROUP BY v.pregunta_id,v.respuesta_dada`,[cursoId,conceptoId]),
    ]);
    return { ...conceptos[0], alumnos_distintos: alumnos[0].cantidad, respuestas_historial: alumnos[0].respuestas_historial,
      preguntas: preguntas.map(q=>({...q,distribucion:distribucion.filter(d=>d.pregunta_id===q.id).map(({respuesta_dada,cantidad})=>({respuesta_dada,cantidad}))})) };
  });
  app.get(
    "/docentes/yo/notificaciones",
    {
      schema: { summary: "Avisos de bajo dominio del docente, más nuevos primero (D8)", tags: ["docente"] },
      preHandler: exigirRol("docente"),
    },
    async (request) => {
      const { rows } = await db.query(
        `SELECT id::int AS id, curso_id, concepto_id, mensaje, leida, creada_en
           FROM notificaciones
          WHERE docente_id = $1
          ORDER BY creada_en DESC, id DESC
          LIMIT 100`,
        [request.user.id],
      );
      return { no_leidas: rows.filter((n) => !n.leida).length, notificaciones: rows };
    },
  );

  app.patch<{ Params: { id: number } }>(
    "/notificaciones/:id/leida",
    {
      schema: {
        summary: "Marcar un aviso como leído. Solo el docente al que va dirigido.",
        tags: ["docente"],
        params: { type: "object", required: ["id"], properties: { id: { type: "integer", minimum: 1 } } },
      },
      preHandler: exigirRol("docente"),
    },
    async (request, reply) => {
      const { rows } = await db.query<{ docente_id: string }>("SELECT docente_id FROM notificaciones WHERE id = $1", [
        request.params.id,
      ]);
      if (!rows[0]) return reply.code(404).send({ error: "No encontramos ese aviso." });
      if (rows[0].docente_id !== request.user.id) return reply.code(403).send({ error: MENSAJES.sinPermiso });
      const { rows: actualizada } = await db.query(
        `UPDATE notificaciones SET leida = true WHERE id = $1
         RETURNING id::int AS id, curso_id, concepto_id, mensaje, leida, creada_en`,
        [request.params.id],
      );
      return actualizada[0];
    },
  );
}
