import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { db, redis } from "../clients.js";
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

const VENTANA_LOGIN_S = 5 * 60;
/** Fallos permitidos para un mismo usuario desde una misma IP (adivinar la clave de una cuenta). */
const MAX_FALLOS_USUARIO = 10;
/**
 * Fallos permitidos desde una misma IP sumando todos los usuarios (probar muchas cuentas).
 * Es alto a propósito: un aula entera puede salir a internet con la misma IP de la escuela.
 */
const MAX_FALLOS_IP = 100;

/**
 * Límite de intentos fallidos de login, con dos contadores en Redis (ventana fija de 5 minutos):
 *  - IP + usuario: frena a quien prueba claves contra una cuenta, sin bloquear esa cuenta para el
 *    resto (un compañero que se equivoca desde otra IP no deja afuera al dueño de la cuenta).
 *  - solo IP: frena a quien prueba pocas claves contra muchas cuentas.
 * La IP real llega de Caddy en X-Forwarded-For (ver trustProxy en index.ts); sin eso, todos los
 * pedidos parecerían venir de la IP de Caddy y diez fallos de cualquiera bloquearían la cuenta.
 * Al estar en Redis, el contador sobrevive a un reinicio de la API y sirve con varias instancias.
 * Si Redis no responde, el login sigue funcionando sin límite (se prioriza poder entrar a jugar).
 */
function limitarLogin() {
  const claves = (request: FastifyRequest, usuario: string) => ({
    usuario: `login:fallos:${request.ip}:${usuario.trim().toLowerCase()}`,
    ip: `login:fallos:${request.ip}`,
  });

  /** true si ya se excedió el límite (y deja respondido el 429). */
  const comprobar = async (request: FastifyRequest, reply: FastifyReply, usuario: string) => {
    const k = claves(request, usuario);
    try {
      const [[, fallosUsuario], [, ttlUsuario], [, fallosIp], [, ttlIp]] = (await redis
        .multi()
        .get(k.usuario)
        .pttl(k.usuario)
        .get(k.ip)
        .pttl(k.ip)
        .exec()) as Array<[Error | null, string | number | null]>;
      const excedido =
        Number(fallosUsuario ?? 0) >= MAX_FALLOS_USUARIO ? Number(ttlUsuario) : Number(fallosIp ?? 0) >= MAX_FALLOS_IP ? Number(ttlIp) : null;
      if (excedido === null) return false;
      reply
        .header("Retry-After", Math.max(1, Math.ceil(excedido / 1000)))
        .code(429)
        .send({ error: "Demasiados intentos fallidos. Esperá unos minutos y probá de nuevo." });
      return true;
    } catch (error) {
      request.log.warn({ err: error }, "no se pudo consultar el límite de login en Redis");
      return false;
    }
  };

  const fallo = async (request: FastifyRequest, usuario: string) => {
    const k = claves(request, usuario);
    try {
      // SET NX EX fija el vencimiento solo en el primer fallo de la ventana; INCR suma.
      await redis
        .multi()
        .set(k.usuario, 0, "EX", VENTANA_LOGIN_S, "NX")
        .incr(k.usuario)
        .set(k.ip, 0, "EX", VENTANA_LOGIN_S, "NX")
        .incr(k.ip)
        .exec();
    } catch (error) {
      request.log.warn({ err: error }, "no se pudo registrar el fallo de login en Redis");
    }
  };

  /** Un ingreso correcto limpia el contador de ese usuario en esa IP (no el de la IP). */
  const exito = async (request: FastifyRequest, usuario: string) => {
    try {
      await redis.del(claves(request, usuario).usuario);
    } catch (error) {
      request.log.warn({ err: error }, "no se pudo limpiar el límite de login en Redis");
    }
  };
  return { comprobar, fallo, exito };
}

export async function rutasAuth(app: FastifyInstance) {
  const limite = limitarLogin();
  app.post<{ Body: Credenciales }>("/auth/login", { schema: { ...esquemaLogin, summary: "Ingreso unificado de alumno o docente", tags: ["auth"] } }, async (request, reply) => {
    if (await limite.comprobar(request, reply, request.body.usuario)) return;
    const roles: Rol[] = request.body.rol ? [request.body.rol] : ["alumno", "docente"];
    for (const rol of roles) {
      const { rows } = await db.query<{ id: string; nombre: string; clave_hash: string }>(CONSULTAS[rol], [request.body.usuario.trim().toLowerCase()]);
      const fila = rows[0];
      if (fila && await bcrypt.compare(request.body.clave, fila.clave_hash)) {
        await limite.exito(request, request.body.usuario);
        return { token: app.jwt.sign({ id: fila.id, rol }), rol, id: fila.id, nombre: fila.nombre };
      }
    }
    await limite.fallo(request, request.body.usuario);
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
        if (await limite.comprobar(request, reply, request.body.usuario)) return;
        const { usuario, clave } = request.body;
        const { rows } = await db.query<{ id: string; nombre: string; clave_hash: string }>(CONSULTAS[rol], [
          usuario.trim().toLowerCase(),
        ]);
        const fila = rows[0];
        // bcryptjs entiende los hashes $2a$ que genera pgcrypto en el seed.
        if (!fila || !(await bcrypt.compare(clave, fila.clave_hash))) {
          await limite.fallo(request, usuario);
          return reply.code(401).send({ error: "Usuario o clave incorrectos. Revisalos y probá de nuevo." });
        }
        await limite.exito(request, usuario);
        const token = app.jwt.sign({ id: fila.id, rol });
        return { token, rol, id: fila.id, nombre: fila.nombre };
      },
    );
  }
}
