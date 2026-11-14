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
      },
      preHandler: exigirCurso("docente"),
    },
    async (request) => {
      const { rows } = await db.query(
        `SELECT a.concepto_id, c.nombre, a.respuestas, a.aciertos,
                round(a.aciertos::numeric / NULLIF(a.respuestas, 0), 2)::float AS porcentaje_aciertos,
                a.alerta_enviada, a.actualizado_en
           FROM analitica_concepto a
           JOIN conceptos c ON c.id = a.concepto_id
          WHERE a.curso_id = $1
          ORDER BY porcentaje_aciertos NULLS LAST, a.concepto_id`,
        [request.params.cursoId],
      );
      return { curso_id: request.params.cursoId, conceptos: rows };
    },
  );
}
