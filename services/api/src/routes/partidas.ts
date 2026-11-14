import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  TOPICS,
  type Minijuego,
  type PartidaFinalizada,
  type RespuestaEvento,
  crearProductor,
} from "@studyleague/shared";

type Productor = Awaited<ReturnType<typeof crearProductor>>;

interface CuerpoPartida {
  curso_id: string;
  alumno_id: string;
  minijuego: Minijuego;
  respuestas: RespuestaEvento[];
}

const PUNTOS_POR_ACIERTO = 100;
const BONUS_MAXIMO = 20;
const TIEMPO_POR_PREGUNTA_MS = 20_000;

/** 100 puntos por acierto más un bonus de hasta 20 según la rapidez (ver mockup A6). */
function calcularPuntaje(respuestas: RespuestaEvento[]): number {
  return respuestas.reduce((total, r) => {
    if (!r.correcta) return total;
    const rapidez = Math.max(0, 1 - r.tiempo_ms / TIEMPO_POR_PREGUNTA_MS);
    return total + PUNTOS_POR_ACIERTO + Math.round(BONUS_MAXIMO * rapidez);
  }, 0);
}

export async function rutasPartidas(app: FastifyInstance, opts: { productor: Productor }) {
  app.post<{ Body: CuerpoPartida }>(
    "/partidas",
    {
      schema: {
        summary: "Registrar una partida finalizada",
        description:
          "Guarda la partida y publica partida.finalizada. No espera a los consumidores: responde enseguida.",
        body: {
          type: "object",
          required: ["curso_id", "alumno_id", "minijuego", "respuestas"],
          properties: {
            curso_id: { type: "string" },
            alumno_id: { type: "string" },
            minijuego: {
              type: "string",
              enum: [
                "verdadero_falso",
                "trivia",
                "ordenar_secuencia",
                "emparejar_conceptos",
                "definicion_palabras_clave",
              ],
            },
            respuestas: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["pregunta_id", "concepto_id", "correcta", "tiempo_ms"],
                properties: {
                  pregunta_id: { type: "string" },
                  concepto_id: { type: "string" },
                  correcta: { type: "boolean" },
                  tiempo_ms: { type: "integer", minimum: 0 },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { curso_id, alumno_id, minijuego, respuestas } = request.body;

      // TODO(PoC): corregir las respuestas contra las preguntas de PostgreSQL
      // en lugar de confiar en el campo "correcta" que manda el cliente.
      const evento: PartidaFinalizada = {
        event_id: randomUUID(),
        tipo: "partida.finalizada",
        version: 1,
        ocurrido_en: new Date().toISOString(),
        partida_id: randomUUID(),
        curso_id,
        alumno_id,
        minijuego,
        puntaje: calcularPuntaje(respuestas),
        respuestas,
      };

      // TODO(PoC): guardar la partida y el evento en la tabla outbox dentro de
      // una misma transacción, y que un proceso aparte publique lo pendiente
      // (mitigación del riesgo de doble escritura, sección 7 del white paper).
      await opts.productor.publicar(TOPICS.PARTIDA_FINALIZADA, curso_id, evento);

      return reply.code(202).send({
        partida_id: evento.partida_id,
        event_id: evento.event_id,
        puntaje: evento.puntaje,
        aciertos: respuestas.filter((r) => r.correcta).length,
        total: respuestas.length,
      });
    },
  );
}
