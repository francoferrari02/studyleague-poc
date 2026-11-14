import pg from "pg";
import { Redis } from "ioredis";
import { config } from "./config.js";

export const db = new pg.Pool({ connectionString: config.databaseUrl });
export const redis = new Redis(config.redisUrl);
