/**
 * Simulador de un pico de día de juego: N alumnos terminan su partida casi a la vez.
 *
 *   docker compose run --rm simulador --alumnos 200
 *   docker compose run --rm simulador --alumnos 50 --bajo-dominio mitosis
 *
 * Opciones:
 *   --alumnos N        cantidad de partidas a enviar (por defecto 30)
 *   --curso ID         curso de destino (por defecto bio-2b, el del seed)
 *   --segundos S       ventana en la que se reparten los envíos (por defecto 10)
 *   --bajo-dominio ID  hace que casi todos fallen ese concepto (para la demo del aviso al docente)
 *
 * Cada partida se juega como en la app: el alumno inicia sesión (alu-01 … alu-30, clave alumno123),
 * pide las preguntas (GET /cursos/:id/partida-nueva) y manda lo que respondió (respuesta_dada);
 * la API corrige. Al final espera a que el ranking procese todas las partidas e imprime GET /metricas.
 * Sale con código 1 si alguna partida falló o no llegó al ranking.
 */
import pg from "pg";
import type { Minijuego } from "@studyleague/shared";

const args = process.argv.slice(2);
function opcion(nombre: string, porDefecto: string): string {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
}

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const ALUMNOS = Number(opcion("alumnos", "30"));
const CURSO = opcion("curso", "bio-2b");
const SEGUNDOS = Number(opcion("segundos", "10"));
const BAJO_DOMINIO = opcion("bajo-dominio", "");
const CLAVE = "alumno123";
const ALUMNOS_DEL_CURSO = 30;
const ESPERA_RANKING_MS = 30_000;
const MINIJUEGO: Minijuego = "trivia";

// Mismos conceptos y porcentajes que los mockups (D6).
const CONCEPTOS: Record<string, number> = {
  celula: 0.82,
  fotosintesis: 0.68,
  membrana: 0.55,
  organelas: 0.47,
  mitosis: 0.34,
};

interface Pregunta {
  pregunta_id: string;
  concepto_id: string;
  opciones: string[];
}

/** El usuario de alu-01 es "tomas"; el resto entra con su id. */
const usuarioDe = (alumnoId: string) => (alumnoId === "alu-01" ? "tomas" : alumnoId);

async function pedir<T>(ruta: string, opciones: { token?: string; cuerpo?: unknown; metodo?: string } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${ruta}`, {
    method: opciones.metodo ?? (opciones.cuerpo ? "POST" : "GET"),
    headers: {
      ...(opciones.cuerpo ? { "content-type": "application/json" } : {}),
      ...(opciones.token ? { authorization: `Bearer ${opciones.token}` } : {}),
    },
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  });
  if (!res.ok) throw new Error(`${ruta}: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Elige la opción correcta con la probabilidad del concepto; si no, una incorrecta al azar. */
function responder(p: Pregunta) {
  // Modo dirigido: el concepto elegido falla siempre. El resto no cruza nuevos
  // umbrales: Mitosis sigue baja y los conceptos inicialmente saludables aciertan.
  const probAcierto = BAJO_DOMINIO
    ? (p.concepto_id === BAJO_DOMINIO || (CONCEPTOS[p.concepto_id] ?? 1) < 0.4 ? 0 : 1)
    : (CONCEPTOS[p.concepto_id] ?? 0.5);
  const incorrectas = p.opciones.filter((o) => o !== correctaPorId.get(p.pregunta_id));
  const acierta = Math.random() < probAcierto || incorrectas.length === 0;
  return {
    pregunta_id: p.pregunta_id,
    respuesta_dada: acierta ? correctaPorId.get(p.pregunta_id) : incorrectas[Math.floor(Math.random() * incorrectas.length)],
    tiempo_ms: Math.round(3_000 + Math.random() * 15_000),
  };
}

// Las soluciones son datos internos de la herramienta; nunca se obtienen de B2.
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows: soluciones } = await db.query<{id: string; respuesta: unknown}>(
  "SELECT p.id,p.respuesta FROM preguntas p JOIN conceptos c ON c.id=p.concepto_id WHERE c.curso_id=$1 AND p.minijuego=$2", [CURSO, MINIJUEGO]);
await db.end();
const correctaPorId = new Map(soluciones.map(p => [p.id,p.respuesta]));

// 1. Iniciar sesión una vez por alumno.
const alumnos = Array.from({ length: Math.min(ALUMNOS, ALUMNOS_DEL_CURSO) }, (_, i) => `alu-${String(i + 1).padStart(2, "0")}`);
const tokens = new Map<string, string>();
await Promise.all(
  alumnos.map(async (id) => {
    const { token } = await pedir<{ token: string }>("/auth/alumno", { cuerpo: { usuario: usuarioDe(id), clave: CLAVE } });
    tokens.set(id, token);
  }),
);

// 2. Jugar N partidas repartidas en la ventana de tiempo.
async function jugar(n: number) {
  const token = tokens.get(alumnos[n % alumnos.length])!;
  const { preguntas } = await pedir<{ preguntas: Pregunta[] }>(`/cursos/${CURSO}/partida-nueva?minijuego=${MINIJUEGO}`, { token });
  const r = await pedir<{ partida_id: string }>("/partidas", {
    token,
    cuerpo: { curso_id: CURSO, minijuego: MINIJUEGO, respuestas: preguntas.map(responder) },
  });
  return { partida_id: r.partida_id, token };
}

const inicio = Date.now();
const jugadas: Array<{ partida_id: string; token: string }> = [];
let fallas = 0;
await Promise.all(
  Array.from({ length: ALUMNOS }, (_, n) =>
    new Promise<void>((resolve) => {
      setTimeout(async () => {
        try {
          jugadas.push(await jugar(n));
        } catch (e) {
          fallas++;
          console.error(String(e));
        }
        resolve();
      }, Math.random() * SEGUNDOS * 1000);
    }),
  ),
);
const segundos = (Date.now() - inicio) / 1000;

// 3. Esperar a que ranking-consumer procese todas las partidas (B4).
let pendientes = jugadas;
const limite = Date.now() + ESPERA_RANKING_MS;
while (pendientes.length > 0 && Date.now() < limite) {
  const estados = await Promise.all(
    pendientes.map((j) =>
      pedir<{ estado: string }>(`/partidas/${j.partida_id}/ranking`, { token: j.token }).catch(() => ({ estado: "error" })),
    ),
  );
  pendientes = pendientes.filter((_, i) => estados[i].estado !== "actualizado");
  if (pendientes.length > 0) await new Promise((r) => setTimeout(r, 250));
}

// 4. Latencia partida → ranking.
const metricas = await pedir<Record<string, number | null>>("/metricas", { token: tokens.values().next().value });

console.log(
  JSON.stringify({
    enviadas: jugadas.length,
    fallas,
    segundos,
    curso: CURSO,
    bajo_dominio: BAJO_DOMINIO || null,
    sin_actualizar_en_ranking: pendientes.length,
    metricas,
  }),
);
if (fallas > 0 || pendientes.length > 0) process.exit(1);
