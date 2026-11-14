/**
 * Carga en Redis el ranking semanal de Biología · 2.º B de la pantalla A14.
 * Hace falta porque Redis no se inicializa con el SQL del seed.
 *
 *   npm run seed:ranking                 # Tomás (alu-01) con 1.270: estado "antes de jugar"
 *   npm run seed:ranking -- --despues    # Tomás con 2.090 (después de su partida de 820)
 *
 * Reemplaza el ranking de la semana actual del curso. REDIS_URL por defecto: redis://localhost:6379.
 */
import { Redis } from "ioredis";
import { claveRanking, semanaIso } from "@studyleague/shared/ranking";

const CURSO = "bio-2b";
const PARTIDA_DE_TOMAS = 820;
const despues = process.argv.includes("--despues");

/** Puntos de la semana según el mockup A14 (alu-01 = Tomás R., ya con su partida de 820). */
const PUNTOS: Record<string, number> = {
  "alu-02": 2450, // Valentina S.
  "alu-03": 2310, // Joaquín M.
  "alu-04": 2180, // Camila P.
  "alu-01": 2090, // Tomás R.
  "alu-05": 1960,
  "alu-06": 1900,
  "alu-07": 1870,
};
// El resto, con puntajes decrecientes plausibles.
const RESTO = [1260, 1210, 1160, 1110, 1060, 1010, 960, 910, 860, 810, 760, 710, 660, 610, 560, 510, 460, 410, 360, 310, 260, 210, 160];
RESTO.forEach((puntos, i) => (PUNTOS[`alu-${String(i + 8).padStart(2, "0")}`] = puntos));
if (!despues) PUNTOS["alu-01"] -= PARTIDA_DE_TOMAS;

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const semana = semanaIso();
const clave = claveRanking(CURSO, semana);

const miembros = Object.entries(PUNTOS).flatMap(([alumno, puntos]) => [puntos, alumno]);
await redis.multi().del(clave).zadd(clave, ...miembros).exec();

const puesto = (await redis.zrevrank(clave, "alu-01"))! + 1;
console.log(
  JSON.stringify({ clave, alumnos: Object.keys(PUNTOS).length, estado: despues ? "después de jugar" : "antes de jugar", tomas: { puntos: PUNTOS["alu-01"], puesto } }),
);
await redis.quit();
