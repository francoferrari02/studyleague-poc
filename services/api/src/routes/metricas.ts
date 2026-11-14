import type { FastifyInstance } from "fastify";
import { CLAVE_LATENCIA_RANKING } from "@studyleague/shared";
import { redis } from "../clients.js";

/** Percentil por el método del rango más cercano, sobre un arreglo ordenado de menor a mayor. */
function percentil(ordenadas: number[], p: number): number {
  return ordenadas[Math.max(0, Math.ceil(p * ordenadas.length) - 1)];
}

export async function rutasMetricas(app: FastifyInstance) {
  app.get(
    "/metricas",
    {
      schema: {
        summary: "Latencia partida → ranking de los últimos 1.000 eventos",
        description:
          "Desde que la API recibe la partida hasta que ranking-consumer actualiza Redis (SLI del white paper: p95 < 3 s). " +
          "Cualquier usuario con sesión.",
        tags: ["metricas"],
      },
    },
    async () => {
      const valores = (await redis.lrange(CLAVE_LATENCIA_RANKING, 0, -1)).map(Number).filter(Number.isFinite);
      const ordenadas = valores.sort((a, b) => a - b);
      if (ordenadas.length === 0) return { muestras: 0, p50_ms: null, p95_ms: null, max_ms: null };
      return {
        muestras: ordenadas.length,
        p50_ms: percentil(ordenadas, 0.5),
        p95_ms: percentil(ordenadas, 0.95),
        max_ms: ordenadas[ordenadas.length - 1],
      };
    },
  );
}
