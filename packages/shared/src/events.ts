/**
 * Contratos de los eventos. Por privacidad (los usuarios son menores),
 * los eventos llevan solo identificadores: nunca nombres ni datos personales.
 * Ver docs/eventos.md.
 */

export type Minijuego =
  | "verdadero_falso"
  | "trivia"
  | "ordenar_secuencia"
  | "emparejar_conceptos"
  | "definicion_palabras_clave";

interface EventoBase<T extends string> {
  /** Identificador único: los consumidores lo usan para descartar repetidos (entrega al menos una vez). */
  event_id: string;
  tipo: T;
  version: 1;
  /** Fecha y hora ISO 8601 en que ocurrió el hecho. */
  ocurrido_en: string;
}

export interface RespuestaEvento {
  pregunta_id: string;
  concepto_id: string;
  correcta: boolean;
  /** Milisegundos que tardó el alumno en responder (para el bonus por rapidez). */
  tiempo_ms: number;
}

export interface PartidaFinalizada extends EventoBase<"partida.finalizada"> {
  partida_id: string;
  curso_id: string;
  alumno_id: string;
  minijuego: Minijuego;
  puntaje: number;
  /**
   * false en una partida de práctica (no es la primera que el alumno empezó hoy en el curso):
   * ranking-consumer no suma sus puntos; rachas y analítica la procesan igual.
   * Campo opcional agregado sin cambiar la versión: si falta (eventos anteriores), vale true.
   */
  cuenta_para_ranking?: boolean;
  respuestas: RespuestaEvento[];
}

export interface ConceptoBajoDominio extends EventoBase<"concepto.bajo_dominio"> {
  curso_id: string;
  concepto_id: string;
  respuestas_totales: number;
  aciertos: number;
  /** Proporción de aciertos entre 0 y 1. */
  porcentaje_aciertos: number;
}

export type Evento = PartidaFinalizada | ConceptoBajoDominio;

/** Validación mínima en tiempo de ejecución, para mandar a la DLQ lo que no cumple el contrato. */
export function esPartidaFinalizada(valor: unknown): valor is PartidaFinalizada {
  const v = valor as Partial<PartidaFinalizada> | null;
  return (
    !!v &&
    v.tipo === "partida.finalizada" &&
    typeof v.event_id === "string" &&
    typeof v.curso_id === "string" &&
    typeof v.alumno_id === "string" &&
    typeof v.puntaje === "number" &&
    Array.isArray(v.respuestas)
  );
}

export function esConceptoBajoDominio(valor: unknown): valor is ConceptoBajoDominio {
  const v = valor as Partial<ConceptoBajoDominio> | null;
  return (
    !!v &&
    v.tipo === "concepto.bajo_dominio" &&
    typeof v.event_id === "string" &&
    typeof v.curso_id === "string" &&
    typeof v.concepto_id === "string" &&
    typeof v.porcentaje_aciertos === "number"
  );
}
