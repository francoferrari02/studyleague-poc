/**
 * Reglas de la racha: cuántos días de juego seguidos del curso jugó un alumno.
 * Las usan rachas-consumer (para calcularla) y la API (para saber si sigue vigente).
 *
 * Los días se cuentan en la hora de Argentina: una partida de las 22 h del lunes
 * es del lunes aunque en UTC ya sea martes.
 */
import { semanaIso } from "./ranking.js";

export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

/** Fecha local "AAAA-MM-DD" de un instante, en la zona de la escuela. */
export function fechaLocal(instante: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(instante),
  );
}

/** Día de la semana ISO (1 = lunes … 7 = domingo) de una fecha "AAAA-MM-DD". */
export function diaSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay() || 7;
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Último día de juego del curso estrictamente anterior a la fecha (o null si el curso no tiene días). */
export function diaDeJuegoAnterior(fecha: string, diasJuego: number[]): string | null {
  for (let i = 1; i <= 7; i++) {
    const candidato = sumarDias(fecha, -i);
    if (diasJuego.includes(diaSemana(candidato))) return candidato;
  }
  return null;
}

export const esDiaDeJuego = (fecha: string, diasJuego: number[]) => diasJuego.includes(diaSemana(fecha));

/** Hash de Redis con la racha de un alumno en un curso: { ultimo_dia, dias }. La lee GET /alumnos/yo/inicio. */
export const claveRacha = (cursoId: string, alumnoId: string) => `racha:${cursoId}:${alumnoId}`;

/** Set de Redis con las fechas en que el alumno jugó esa semana (calendario de "Mi progreso"). */
export const claveJugados = (alumnoId: string, fecha: string) => `jugados:${alumnoId}:${semanaIso(new Date(`${fecha}T12:00:00Z`))}`;

/**
 * Racha que se muestra hoy. Si el alumno no jugó el día de juego anterior a hoy
 * (ni hoy), la racha se cortó aunque Redis todavía guarde el número viejo.
 */
export function rachaVigente(estado: { ultimo_dia?: string; dias?: string | number } | null, diasJuego: number[], hoy = fechaLocal()): number {
  const dias = Number(estado?.dias ?? 0);
  if (!estado?.ultimo_dia || !dias) return 0;
  if (estado.ultimo_dia === hoy) return dias;
  // Hoy todavía no jugó: la racha sigue si su último día es el día de juego anterior a hoy.
  return estado.ultimo_dia === diaDeJuegoAnterior(hoy, diasJuego) ? dias : 0;
}
