/** Log en una línea JSON, fácil de filtrar con `docker compose logs`. */
export function log(servicio: string, mensaje: string, datos: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), servicio, mensaje, ...datos }));
}
