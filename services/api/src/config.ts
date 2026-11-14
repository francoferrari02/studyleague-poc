const jwtSecret = process.env.JWT_SECRET ?? "";
if (jwtSecret.length < 32) {
  // Sin secreto propio cualquiera podría firmar tokens: la API no arranca.
  throw new Error("Falta JWT_SECRET (mínimo 32 caracteres). Generalo con `openssl rand -hex 32` y ponelo en .env");
}

export const config = {
  puerto: Number(process.env.API_PORT ?? 3000),
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://studyleague:studyleague@localhost:5432/studyleague",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  jwtSecret,
  /** Duración del token de sesión (una jornada escolar con margen). */
  jwtExpira: "12h",
};
