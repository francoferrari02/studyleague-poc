import type { FastifyInstance } from "fastify";
import { db, redis } from "../clients.js";

export async function rutasSalud(app: FastifyInstance) {
  for (const ruta of ["/health", "/salud"]) app.get(ruta, { schema: { security: [], summary: "Estado de PostgreSQL y Redis" } }, async () => {
    await db.query("select 1");
    await redis.ping();
    return { estado: "ok" };
  });
}
