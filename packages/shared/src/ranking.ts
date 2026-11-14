/** Semana ISO 8601 de una fecha, por ejemplo "2026-W47". El ranking se reinicia cada semana. */
export function semanaIso(fecha = new Date()): string {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d.getTime() - inicioAnio.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

/** Clave del sorted set de Redis con el ranking de un curso en una semana. */
export function claveRanking(cursoId: string, semana = semanaIso()): string {
  return `ranking:${cursoId}:${semana}`;
}

/** Marca de Redis que deja ranking-consumer al sumar un evento (idempotencia; B4 la usa para saber si ya se procesó). */
export function claveProcesado(eventId: string): string {
  return `procesado:ranking:${eventId}`;
}
