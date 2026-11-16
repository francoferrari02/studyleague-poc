import type { FastifyInstance } from "fastify";
import { claveRacha, claveRanking, diaSemana, fechaLocal, rachaVigente, semanaIso } from "@studyleague/shared";
import { db, redis } from "../clients.js";
import { exigirRol } from "../auth.js";
export function proximoDia(dias: number[]) {
  const hoy = diaSemana(fechaLocal()); // día de la semana en Argentina, no en UTC
  const distancia = dias.length ? Math.min(...dias.map(d => (d - hoy + 7) % 7)) : null;
  return { hoy_es_dia_juego: distancia === 0, proximo_dia: distancia === null ? null : distancia === 0 ? "Hoy" : ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][(hoy + distancia) % 7] };
}
export async function rutasAlumnos(app: FastifyInstance) {
  app.get("/alumnos/yo/inicio", { schema: { summary: "Inicio del alumno: cursos, próxima fecha, racha y ranking semanal", tags: ["alumno"] }, preHandler: exigirRol("alumno") }, async request => {
    const [{ rows: alumnos }, { rows: cursos }] = await Promise.all([
      db.query("SELECT nombre_visible FROM alumnos WHERE id=$1", [request.user.id]),
      db.query("SELECT c.id, c.nombre, c.dias_juego, c.minijuegos, (SELECT count(*)::int FROM inscripciones WHERE curso_id=c.id) AS alumnos FROM cursos c JOIN inscripciones i ON i.curso_id=c.id WHERE i.alumno_id=$1 ORDER BY c.id", [request.user.id]),
    ]);
    const semana = semanaIso();
    return { nombre_visible: alumnos[0]?.nombre_visible ?? "", cursos: await Promise.all(cursos.map(async c => {
      const [rango, puntos, racha] = await Promise.all([redis.zrevrank(claveRanking(c.id, semana), request.user.id), redis.zscore(claveRanking(c.id, semana), request.user.id), redis.hgetall(claveRacha(c.id, request.user.id))]);
      return { ...c, ...proximoDia(c.dias_juego), puesto: rango === null ? null : rango + 1, puntos: Number(puntos ?? 0), racha: rachaVigente(racha, c.dias_juego.map(Number)) };
    })) };
  });
}
