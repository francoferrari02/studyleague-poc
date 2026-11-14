/** Cliente mínimo de la API. En Docker y en la nube, /api llega a la API por el proxy. */
const BASE = import.meta.env.VITE_API_URL ?? "/api";

export async function obtenerRanking(cursoId: string) {
  const res = await fetch(`${BASE}/cursos/${cursoId}/ranking`);
  if (!res.ok) throw new Error(`Error ${res.status} al leer el ranking`);
  return (await res.json()) as {
    curso_id: string;
    semana: string;
    ranking: { puesto: number; alumno_id: string; puntos: number }[];
  };
}
