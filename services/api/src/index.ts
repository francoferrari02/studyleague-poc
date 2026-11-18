import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { config } from "./config.js";
import { configurarAutenticacion } from "./auth.js";
import { rutasAlumnos } from "./routes/alumnos.js";
import { rutasAuth } from "./routes/auth.js";
import { iniciarPublicadorOutbox } from "./outbox.js";
import { rutasPartidas } from "./routes/partidas.js";
import { rutasCursos } from "./routes/cursos.js";
import { rutasSalud } from "./routes/salud.js";
import { rutasDocentes } from "./routes/docentes.js";
import { rutasMetricas } from "./routes/metricas.js";

const app = Fastify({ logger: true });

// La web publicada usa el mismo origen que la API. Para desarrollo local o un
// frontend separado, permitir solo los orígenes configurados explícitamente.
const origenesCors = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origen) => origen.trim())
  .filter(Boolean);
await app.register(cors, { origin: origenesCors });
await app.register(swagger, {
  openapi: {
    info: {
      title: "StudyLeague API",
      description: "API de partidas de la prueba de concepto. Publica partida.finalizada en Kafka.",
      version: "0.1.0",
    },
    // En la nube la API se publica detrás de Caddy en /api: "Try it out" tiene que llamar ahí.
    servers: [{ url: process.env.API_PREFIJO_PUBLICO ?? "/" }],
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

const outbox = iniciarPublicadorOutbox(app.log);

await app.register(rutasSalud);
await app.register(rutasAuth);
await app.register(rutasAlumnos);
await app.register(rutasPartidas, { outbox });
await app.register(rutasCursos);
await app.register(rutasDocentes);
await app.register(rutasMetricas);

const cerrar = async () => {
  outbox.detener();
  await app.close();
  await outbox.cerrar();
  process.exit(0);
};
process.on("SIGTERM", cerrar);
process.on("SIGINT", cerrar);

await app.listen({ host: "0.0.0.0", port: config.puerto });
