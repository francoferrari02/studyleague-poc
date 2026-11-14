/** Todas las rutas privadas pasan por este cliente; nginx y Vite publican /api. */
const BASE = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");
export type Rol = "alumno" | "docente";
export interface Sesion { token: string; rol: Rol; id: string; nombre: string }
const CLAVE = "studyleague.sesion";
export function vencimiento(token: string): number {
  try { const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))); return typeof payload.exp === "number" ? payload.exp*1000 : 0; } catch { return 0; }
}
let actual: Sesion | null = leerSesion();
function leerSesion(): Sesion | null {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE) ?? "null");
    return s && typeof s.token === "string" && vencimiento(s.token)>Date.now() && ["alumno", "docente"].includes(s.rol) && typeof s.id === "string" && typeof s.nombre === "string" ? s : null;
  } catch { return null; }
}
export const obtenerSesion = () => actual;
export function guardarSesion(s: Sesion | null) {
  actual = s;
  try { if (s) localStorage.setItem(CLAVE, JSON.stringify(s)); else localStorage.removeItem(CLAVE); } catch { /* sesión en memoria si el navegador no permite persistir */ }
  window.dispatchEvent(new Event("sesion"));
}
export class ErrorApi extends Error {
  constructor(public estado: number, mensaje: string) { super(mensaje); this.name = "ErrorApi"; }
}
export async function api<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown; signal?: AbortSignal; publica?: boolean } = {}): Promise<T> {
  const sesion = obtenerSesion();
  if (!opciones.publica && !sesion) { guardarSesion(null); throw new ErrorApi(401, "Necesitás iniciar sesión."); }
  let res: Response;
  try {
    res = await fetch(BASE + ruta, {
      method: opciones.metodo ?? (opciones.cuerpo !== undefined ? "POST" : "GET"),
      headers: { ...(opciones.cuerpo !== undefined ? { "content-type": "application/json" } : {}), ...(!opciones.publica && sesion ? { Authorization: `Bearer ${sesion.token}` } : {}) },
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo), signal: opciones.signal,
    });
  } catch (e) {
    if (opciones.signal?.aborted) throw e;
    throw new ErrorApi(0, "No pudimos conectar con StudyLeague. Revisá la conexión e intentá de nuevo.");
  }
  const datos = await res.json().catch(() => null);
  if (res.status === 401 && !opciones.publica) guardarSesion(null);
  if (!res.ok) throw new ErrorApi(res.status, datos?.error ?? (res.status >= 500 ? "StudyLeague no está disponible en este momento. Intentá de nuevo en unos segundos." : "No pudimos completar la solicitud. Intentá de nuevo."));
  return datos as T;
}
export interface FilaRanking { puesto: number; alumno_id: string; nombre_visible: string; puntos: number }
export interface Ranking { curso_id: string; curso_nombre: string; semana: string; dias_reinicio: number; ranking: FilaRanking[] }
export const obtenerRanking = (cursoId: string, signal?: AbortSignal) => api<Ranking>(`/cursos/${encodeURIComponent(cursoId)}/ranking`, { signal });
