import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { db } from "../clients.js";
import type { Rol } from "../auth.js";

interface Credenciales {
  usuario: string;
  clave: string;
  rol?: Rol;
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
      rol: { type: "string", enum: ["alumno", "docente"] },
    },
  },
} as const;

/** Consultas por rol: devuelven id, nombre (visible) y clave_hash. */
const CONSULTAS: Record<Rol, string> = {
  alumno: "SELECT id, nombre_visible AS nombre, clave_hash FROM alumnos WHERE usuario = $1",
  docente: "SELECT id, nombre, clave_hash FROM docentes WHERE usuario = $1 OR lower(email) = $1",
};

const VENTANA_LOGIN_MS = 5 * 60_000;
const MAX_FALLOS_LOGIN = 10;

interface IntentosLogin { fallos: number; venceEn: number }

/** La PoC ejecuta una sola API; limita fallos por IP y usuario en esa instancia. */
function limitarLogin(app: FastifyInstance) {
  const intentos = new Map<string, IntentosLogin>();
  const limpiar = setInterval(() => {
    for (const [clave, estado] of intentos) if (estado.venceEn <= Date.now()) intentos.delete(clave);
  }, VENTANA_LOGIN_MS);
  limpiar.unref();
  app.addHook("onClose", async () => clearInterval(limpiar));

  const claveDe = (request: FastifyRequest, usuario: string) => `${request.ip}:${usuario.trim().toLowerCase()}`;
  const estadoDe = (clave: string) => {
    const estado = intentos.get(clave);
    if (estado && estado.venceEn > Date.now()) return estado;
    intentos.delete(clave);
    return undefined;
  };
  const comprobar = (request: FastifyRequest, reply: FastifyReply, usuario: string) => {
    const estado = estadoDe(claveDe(request, usuario));
    if (!estado || estado.fallos < MAX_FALLOS_LOGIN) return false;
    reply.header("Retry-After", Math.ceil((estado.venceEn - Date.now()) / 1000))
      .code(429).send({ error: "Demasiados intentos fallidos. Esperá unos minutos y probá de nuevo." });
    return true;
  };
  const fallo = (request: FastifyRequest, usuario: string) => {
    const clave = claveDe(request, usuario);
    const estado = estadoDe(clave) ?? { fallos: 0, venceEn: Date.now() + VENTANA_LOGIN_MS };
    estado.fallos++;
    intentos.set(clave, estado);
  };
  const exito = (request: FastifyRequest, usuario: string) => intentos.delete(claveDe(request, usuario));
  return { comprobar, fallo, exito };
}

export async function rutasAuth(app: FastifyInstance) {
  const limite = limitarLogin(app);
  app.post<{ Body: Credenciales }>("/auth/login", { schema: { ...esquemaLogin, summary: "Ingreso unificado de alumno o docente", tags: ["auth"] } }, async (request, reply) => {
    if (limite.comprobar(request, reply, request.body.usuario)) return;
    const roles: Rol[] = request.body.rol ? [request.body.rol] : ["alumno", "docente"];
    for (const rol of roles) {
      const { rows } = await db.query<{ id: string; nombre: string; clave_hash: string }>(CONSULTAS[rol], [request.body.usuario.trim().toLowerCase()]);
      const fila = rows[0];
      if (fila && await bcrypt.compare(request.body.clave, fila.clave_hash)) {
        limite.exito(request, request.body.usuario);
        return { token: app.jwt.sign({ id: fila.id, rol }), rol, id: fila.id, nombre: fila.nombre };
      }
    }
    limite.fallo(request, request.body.usuario);
    return reply.code(401).send({ error: "Usuario o clave incorrectos. Revisalos y probá de nuevo." });
  });
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
        if (limite.comprobar(request, reply, request.body.usuario)) return;
        const { usuario, clave } = request.body;
        const { rows } = await db.query<{ id: string; nombre: string; clave_hash: string }>(CONSULTAS[rol], [
          usuario.trim().toLowerCase(),
        ]);
        const fila = rows[0];
        // bcryptjs entiende los hashes $2a$ que genera pgcrypto en el seed.
        if (!fila || !(await bcrypt.compare(clave, fila.clave_hash))) {
          limite.fallo(request, usuario);
          return reply.code(401).send({ error: "Usuario o clave incorrectos. Revisalos y probá de nuevo." });
        }
        limite.exito(request, usuario);
        const token = app.jwt.sign({ id: fila.id, rol });
        return { token, rol, id: fila.id, nombre: fila.nombre };
      },
    );
  }
}
