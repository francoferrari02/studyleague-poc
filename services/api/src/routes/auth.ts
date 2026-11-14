import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { db } from "../clients.js";
import type { Rol } from "../auth.js";

interface Credenciales {
  usuario: string;
  clave: string;
}

const esquemaLogin = {
  security: [],
  body: {
    type: "object",
    required: ["usuario", "clave"],
    additionalProperties: false,
    properties: {
      usuario: { type: "string", minLength: 1, maxLength: 64 },
      clave: { type: "string", minLength: 1, maxLength: 128 },
    },
  },
} as const;

/** Consultas por rol: devuelven id, nombre (visible) y clave_hash. */
const CONSULTAS: Record<Rol, string> = {
  alumno: "SELECT id, nombre_visible AS nombre, clave_hash FROM alumnos WHERE usuario = $1",
  docente: "SELECT id, nombre, clave_hash FROM docentes WHERE usuario = $1",
};

export async function rutasAuth(app: FastifyInstance) {
  for (const rol of ["alumno", "docente"] as const) {
    app.post<{ Body: Credenciales }>(
      `/auth/${rol}`,
      {
        schema: {
          ...esquemaLogin,
          summary: `Ingresar como ${rol}`,
          description: "Devuelve un token JWT (vence en 12 h). Mandalo en el header Authorization: Bearer <token>.",
          tags: ["auth"],
        },
      },
      async (request, reply) => {
        const { usuario, clave } = request.body;
        const { rows } = await db.query<{ id: string; nombre: string; clave_hash: string }>(CONSULTAS[rol], [
          usuario.trim().toLowerCase(),
        ]);
        const fila = rows[0];
        // bcryptjs entiende los hashes $2a$ que genera pgcrypto en el seed.
        if (!fila || !(await bcrypt.compare(clave, fila.clave_hash))) {
          return reply.code(401).send({ error: "Usuario o clave incorrectos. Revisalos y probá de nuevo." });
        }
        const token = app.jwt.sign({ id: fila.id, rol });
        return { token, rol, id: fila.id, nombre: fila.nombre };
      },
    );
  }
}
