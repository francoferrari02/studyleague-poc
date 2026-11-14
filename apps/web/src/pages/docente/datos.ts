export interface CursoDocente { id: string; nombre: string; alumnos: number; participaron: number; bajo_dominio: number; proximo_dia: string | null }
export interface CursosDocente { docente: { nombre: string; escuela: string }; cursos: CursoDocente[] }
export interface Concepto { concepto_id: string; nombre: string; respuestas: number; aciertos: number; porcentaje_aciertos: number | null; alerta_enviada: boolean }
export interface Analitica { curso: { id: string; nombre: string }; kpis: { alumnos: number; participaron: number; partidas: number; frecuencia: number }; conceptos: Concepto[] }
export const porcentaje = (c: { respuestas: number; aciertos: number }) => c.respuestas ? Math.round(c.aciertos/c.respuestas*100) : null;
export const nivel = (c: { respuestas: number; aciertos: number }) => !c.respuestas ? "Sin respuestas" : c.aciertos/c.respuestas<.4 ? "Bajo dominio" : c.aciertos/c.respuestas<.7 ? "Dominio medio" : "Dominio alto";
export const tono = (c: { respuestas: number; aciertos: number }) => !c.respuestas ? "violeta" : c.aciertos/c.respuestas<.4 ? "coral" : c.aciertos/c.respuestas<.7 ? "naranja" : "verde";
