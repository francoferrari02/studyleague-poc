import type { FastifyInstance } from "fastify";
import { claveRanking, semanaIso } from "@studyleague/shared";
import { db, redis } from "../clients.js";
import { exigirCurso } from "../auth.js";

export async function rutasCursos(app: FastifyInstance) {
  app.get<{ Params: { cursoId: string } }>(
    "/cursos/:cursoId/ranking",
    {
      schema: { summary: "Ranking semanal del curso (lee Redis)", tags: ["cursos"] },
      preHandler: exigirCurso("alumno", "docente"),
    },
    async (request) => {
      const semana = semanaIso();
      const filas = await redis.zrevrange(claveRanking(request.params.cursoId, semana), 0, -1, "WITHSCORES");
      const ranking = [];
      for (let i = 0; i < filas.length; i += 2) {
        ranking.push({ puesto: i / 2 + 1, alumno_id: filas[i], puntos: Number(filas[i + 1]) });
      }
      const [{ rows: alumnos }, { rows: cursos }] = await Promise.all([
        db.query<{id: string; nombre_visible: string}>("SELECT id,nombre_visible FROM alumnos WHERE id=ANY($1::text[])", [ranking.map(r=>r.alumno_id)]),
        db.query("SELECT nombre FROM cursos WHERE id=$1", [request.params.cursoId]),
      ]);
      const nombres = new Map(alumnos.map(a=>[a.id,a.nombre_visible]));
      return { curso_id: request.params.cursoId, curso_nombre: cursos[0].nombre, semana, dias_reinicio: 8-(new Date().getUTCDay() || 7), ranking: ranking.map(r=>({...r,nombre_visible:nombres.get(r.alumno_id) ?? "Alumno"})) };
    },
  );

  // Versión mínima para verificar analitica-consumer (C1). Los KPIs de la pantalla D6 quedan para B6.
  app.get<{ Params: { cursoId: string } }>(
    "/cursos/:cursoId/analitica",
    {
      schema: {
        summary: "Aciertos por concepto del curso (tabla analitica_concepto). Solo el docente del curso.",
        tags: ["docente"],
        params: { type: "object", required: ["cursoId"], properties: { cursoId: { type: "string", minLength: 1 } } },
      },
      preHandler: exigirCurso("docente"),
    },
    async (request) => {
      const { rows } = await db.query(
        `SELECT c.id AS concepto_id, c.nombre, coalesce(a.respuestas,0) AS respuestas, coalesce(a.aciertos,0) AS aciertos,
                a.aciertos::float / NULLIF(a.respuestas, 0) AS porcentaje_aciertos,
                coalesce(a.alerta_enviada,false) AS alerta_enviada, a.actualizado_en
           FROM conceptos c LEFT JOIN analitica_concepto a ON a.concepto_id=c.id AND a.curso_id=c.curso_id
          WHERE c.curso_id = $1
          ORDER BY porcentaje_aciertos NULLS LAST, c.id`,
        [request.params.cursoId],
      );
      const [{ rows: cursos }, { rows: indicadores }] = await Promise.all([
        db.query("SELECT id,nombre FROM cursos WHERE id=$1", [request.params.cursoId]),
        db.query(`SELECT (SELECT count(*)::int FROM inscripciones WHERE curso_id=$1) AS alumnos,
          count(DISTINCT alumno_id)::int AS participaron, count(*)::int AS partidas
          FROM partidas WHERE curso_id=$1 AND finalizada_en>=date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`, [request.params.cursoId]),
      ]);
      const k = indicadores[0];
      return { curso_id: request.params.cursoId, curso: cursos[0], kpis: { ...k, frecuencia: k.alumnos ? k.partidas/k.alumnos : 0 }, conceptos: rows };
    },
  );
}
