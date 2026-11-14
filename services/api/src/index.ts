import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { crearProductor } from "@studyleague/shared";
import { config } from "./config.js";
import { configurarAutenticacion } from "./auth.js";
import { rutasAuth } from "./routes/auth.js";
import { rutasPartidas } from "./routes/partidas.js";
import { rutasCursos } from "./routes/cursos.js";
import { rutasSalud } from "./routes/salud.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(swagger, {
  openapi: {
    info: {
      title: "StudyLeague API",
      description: "API de partidas de la prueba de concepto. Publica partida.finalizada en Kafka.",
      version: "0.1.0",
    },
    // Botón "Authorize" de Swagger: pegar el token de POST /auth/alumno o /auth/docente.
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    },
    security: [{ bearerAuth: [] }],
  },
});
// Swagger UI en /docs: se usa en la demo para jugar una partida a mano.
await app.register(swaggerUi, { routePrefix: "/docs" });

await configurarAutenticacion(app);

const productor = await crearProductor("api");

await app.register(rutasSalud);
await app.register(rutasAuth);
await app.register(rutasPartidas, { productor });
await app.register(rutasCursos);

const cerrar = async () => {
  await app.close();
  await productor.desconectar();
  process.exit(0);
};
process.on("SIGTERM", cerrar);
process.on("SIGINT", cerrar);

await app.listen({ host: "0.0.0.0", port: config.puerto });
