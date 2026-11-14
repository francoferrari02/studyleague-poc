import type { FastifyInstance } from "fastify";
import { db, redis } from "../clients.js";

export async function rutasSalud(app: FastifyInstance) {
  app.get("/health", async () => {
    await db.query("select 1");
    await redis.ping();
    return { estado: "ok" };
  });
}
