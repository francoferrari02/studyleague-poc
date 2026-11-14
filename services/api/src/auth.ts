/**
 * Autenticación simple de la PoC: token JWT firmado por la API con { id, rol }.
 * Un hook global exige el token en todas las rutas salvo /health, /docs y /auth/*.
 * La autorización por curso se hace con los helpers de abajo.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import { config } from "./config.js";
import { db } from "./clients.js";

export type Rol = "alumno" | "docente";

export interface Sesion {
  id: string;
  rol: Rol;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: Sesion;
    user: Sesion;
  }
}

export const MENSAJES = {
  sinToken: "Necesitás iniciar sesión para ver esto.",
  sinPermiso: "No tenés permiso para acceder a este recurso.",
};

function esRutaPublica(url: string): boolean {
  const ruta = url.split("?")[0];
  return ruta === "/health" || ruta === "/salud" || ruta === "/docs" || ruta.startsWith("/docs/") || ruta.startsWith("/auth/");
}

/** Registra @fastify/jwt y el hook global. Se llama sobre la instancia raíz para que aplique a todas las rutas. */
export async function configurarAutenticacion(app: FastifyInstance) {
  await app.register(jwt, { secret: config.jwtSecret, sign: { expiresIn: config.jwtExpira } });

  app.addHook("onRequest", async (request, reply) => {
    // OPTIONS: preflight de CORS, lo responde @fastify/cors.
    if (request.method === "OPTIONS" || esRutaPublica(request.url)) return;
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: MENSAJES.sinToken });
    }
  });
}

/**
 * ¿La sesión puede operar sobre el curso? Un alumno, si está inscripto;
 * un docente, si el curso es suyo. Un curso inexistente da false (no se revela si existe).
 */
export async function tieneAccesoCurso(sesion: Sesion, cursoId: string, roles: Rol[]): Promise<boolean> {
  if (!roles.includes(sesion.rol)) return false;
  const { rowCount } =
    sesion.rol === "alumno"
      ? await db.query("SELECT 1 FROM inscripciones WHERE curso_id = $1 AND alumno_id = $2", [cursoId, sesion.id])
      : await db.query("SELECT 1 FROM cursos WHERE id = $1 AND docente_id = $2", [cursoId, sesion.id]);
  return (rowCount ?? 0) > 0;
}

/** preHandler para rutas /cursos/:cursoId/...: 403 si la sesión no tiene acceso al curso con alguno de esos roles. */
export function exigirCurso(...roles: Rol[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { cursoId } = request.params as { cursoId: string };
    if (!(await tieneAccesoCurso(request.user, cursoId, roles))) {
      return reply.code(403).send({ error: MENSAJES.sinPermiso });
    }
  };
}

/** preHandler: 403 si la sesión no tiene alguno de esos roles. */
export function exigirRol(...roles: Rol[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!roles.includes(request.user.rol)) {
      return reply.code(403).send({ error: MENSAJES.sinPermiso });
    }
  };
}
