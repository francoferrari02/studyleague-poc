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
 */
import type { Minijuego, RespuestaEvento } from "@studyleague/shared";

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

// Mismos conceptos y porcentajes que los mockups (D6).
const CONCEPTOS: Record<string, number> = {
  celula: 0.82,
  fotosintesis: 0.68,
  membrana: 0.55,
  organelas: 0.47,
  mitosis: 0.34,
};

function respuestas(): RespuestaEvento[] {
  const ids = Object.keys(CONCEPTOS);
  return Array.from({ length: 10 }, (_, i) => {
    const concepto_id = ids[i % ids.length];
    const probAcierto = concepto_id === BAJO_DOMINIO ? 0.1 : CONCEPTOS[concepto_id];
    return {
      pregunta_id: `${concepto_id}-p${i + 1}`,
      concepto_id,
      correcta: Math.random() < probAcierto,
      tiempo_ms: Math.round(3_000 + Math.random() * 15_000),
    };
  });
}

async function enviar(n: number) {
  const alumno = `alu-${String((n % 30) + 1).padStart(2, "0")}`;
  const minijuego: Minijuego = "trivia";
  const res = await fetch(`${API_URL}/partidas`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ curso_id: CURSO, alumno_id: alumno, minijuego, respuestas: respuestas() }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
}

const inicio = Date.now();
let ok = 0;
let fallas = 0;
await Promise.all(
  Array.from({ length: ALUMNOS }, (_, n) =>
    new Promise<void>((resolve) => {
      setTimeout(async () => {
        try {
          await enviar(n);
          ok++;
        } catch (e) {
          fallas++;
          console.error(String(e));
        }
        resolve();
      }, Math.random() * SEGUNDOS * 1000);
    }),
  ),
);

console.log(
  JSON.stringify({ enviadas: ok, fallas, segundos: (Date.now() - inicio) / 1000, curso: CURSO, bajo_dominio: BAJO_DOMINIO || null }),
);
