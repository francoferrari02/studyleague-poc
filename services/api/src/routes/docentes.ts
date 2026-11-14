import type { FastifyInstance } from "fastify";
import { db } from "../clients.js";
import { proximoDia } from "./alumnos.js";
import { MENSAJES, exigirRol } from "../auth.js";

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
