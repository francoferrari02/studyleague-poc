/**
 * Reglas del juego como funciones puras (sin Kafka ni bases), para poder testearlas.
 * La API corrige con estas funciones: el cliente manda lo que respondió, nunca si acertó.
 */
import type { Minijuego } from "./events.js";

export const PUNTOS_POR_ACIERTO = 100;
export const BONUS_MAXIMO = 20;
export const TIEMPO_POR_PREGUNTA_MS = 20_000;
/** Definición con palabras clave: proporción mínima de palabras clave presentes (3 de 4). */
export const PROPORCION_PALABRAS_CLAVE = 0.75;

/** 100 puntos por acierto más un bonus de hasta 20 según la rapidez (ver mockup A6). */
export function puntosPorRespuesta(correcta: boolean, tiempoMs: number): number {
  if (!correcta) return 0;
  const rapidez = Math.max(0, 1 - tiempoMs / TIEMPO_POR_PREGUNTA_MS);
  return PUNTOS_POR_ACIERTO + Math.round(BONUS_MAXIMO * rapidez);
}

export function calcularPuntaje(respuestas: ReadonlyArray<{ correcta: boolean; tiempo_ms: number }>): number {
  return respuestas.reduce((total, r) => total + puntosPorRespuesta(r.correcta, r.tiempo_ms), 0);
}

export interface Correccion {
  correcta: boolean;
  /** Solo en definicion_palabras_clave: las palabras clave que se encontraron (A11). */
  palabras_encontradas?: string[];
}

/** Minúsculas, sin tildes ni signos, con un solo espacio entre palabras. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Palabras clave presentes en el texto, comparando palabras completas ya normalizadas.
 * Acepta el plural simple ("alimento" encuentra "alimentos"). Devuelve las claves tal como
 * las cargó la docente.
 */
export function buscarPalabrasClave(texto: string, palabrasClave: readonly string[]): string[] {
  const normalizado = ` ${normalizarTexto(texto)} `;
  return palabrasClave.filter((clave) => {
    const c = normalizarTexto(clave);
    return c !== "" && new RegExp(` ${c}(s|es)? `).test(normalizado);
  });
}

/** Pares de emparejar_conceptos: acepta { izquierda: derecha } o [[izquierda, derecha], ...]. */
function aPares(valor: unknown): Map<string, string> | null {
  const entradas = Array.isArray(valor)
    ? valor
    : valor && typeof valor === "object"
      ? Object.entries(valor as Record<string, unknown>)
      : null;
  if (!entradas) return null;
  const pares = new Map<string, string>();
  for (const par of entradas) {
    if (!Array.isArray(par) || par.length !== 2 || typeof par[0] !== "string" || typeof par[1] !== "string") return null;
    if (pares.has(par[0])) return null;
    pares.set(par[0], par[1]);
  }
  return pares;
}

/**
 * Corrige una respuesta contra la guardada en la tabla preguntas.
 *  - trivia y verdadero_falso: igualdad exacta.
 *  - ordenar_secuencia: el arreglo completo igual y en el mismo orden.
 *  - emparejar_conceptos: todos los pares correctos (ni de más ni de menos).
 *  - definicion_palabras_clave: al menos el 75 % de las palabras clave en el texto.
 * Una respuesta vacía o con otro formato (por ejemplo null si se acabó el tiempo) es incorrecta.
 */
export function corregirRespuesta(minijuego: Minijuego, respuestaCorrecta: unknown, respuestaDada: unknown): Correccion {
  switch (minijuego) {
    case "trivia":
    case "verdadero_falso":
      return { correcta: typeof respuestaDada === "string" && respuestaDada === respuestaCorrecta };

    case "ordenar_secuencia":
      return {
        correcta:
          Array.isArray(respuestaDada) &&
          Array.isArray(respuestaCorrecta) &&
          respuestaDada.length === respuestaCorrecta.length &&
          respuestaCorrecta.every((paso, i) => respuestaDada[i] === paso),
      };

    case "emparejar_conceptos": {
      const dados = aPares(respuestaDada);
      const correctos = aPares(respuestaCorrecta);
      return {
        correcta:
          !!dados &&
          !!correctos &&
          dados.size === correctos.size &&
          [...correctos].every(([izquierda, derecha]) => dados.get(izquierda) === derecha),
      };
    }

    case "definicion_palabras_clave": {
      const claves = Array.isArray(respuestaCorrecta) ? respuestaCorrecta.filter((c) => typeof c === "string") : [];
      const encontradas = typeof respuestaDada === "string" ? buscarPalabrasClave(respuestaDada, claves) : [];
      const necesarias = Math.ceil(claves.length * PROPORCION_PALABRAS_CLAVE);
      return { correcta: claves.length > 0 && encontradas.length >= necesarias, palabras_encontradas: encontradas };
    }

    default:
      return { correcta: false };
  }
}
