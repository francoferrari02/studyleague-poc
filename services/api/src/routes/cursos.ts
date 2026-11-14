import type { FastifyInstance } from "fastify";
import { claveRanking, semanaIso } from "@studyleague/shared";
import { redis } from "../clients.js";

export async function rutasCursos(app: FastifyInstance) {
  app.get<{ Params: { cursoId: string } }>(
    "/cursos/:cursoId/ranking",
    { schema: { summary: "Ranking semanal del curso (lee Redis)" } },
    async (request) => {
      const semana = semanaIso();
      const filas = await redis.zrevrange(claveRanking(request.params.cursoId, semana), 0, -1, "WITHSCORES");
      const ranking = [];
      for (let i = 0; i < filas.length; i += 2) {
        ranking.push({ puesto: i / 2 + 1, alumno_id: filas[i], puntos: Number(filas[i + 1]) });
      }
      return { curso_id: request.params.cursoId, semana, ranking };
    },
  );

  // TODO(PoC): GET /cursos/:cursoId/analitica (tabla analitica_concepto) para la pantalla D6
  // TODO(PoC): GET /docentes/:docenteId/notificaciones para la pantalla D8
}
