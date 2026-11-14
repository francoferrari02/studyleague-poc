export const config = {
  puerto: Number(process.env.API_PORT ?? 3000),
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://studyleague:studyleague@localhost:5432/studyleague",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
};
