export interface Curso { id: string; nombre: string; dias_juego: number[]; minijuegos: string[]; alumnos: number; puesto: number | null; puntos: number; racha: number; hoy_es_dia_juego: boolean; proximo_dia: string | null }
export interface InicioAlumno { nombre_visible: string; cursos: Curso[] }
export interface Pregunta { pregunta_id: string; concepto_id: string; concepto_nombre: string; enunciado: string; opciones: string[] }
export interface Respuesta { pregunta_id: string; respuesta_dada: string | null; tiempo_ms: number }
export interface PartidaNueva { partida_id: string; sesion: string; cuenta_para_ranking: boolean; preguntas: Pregunta[] }
export interface Feedback { correcta: boolean; respuesta_correcta: string; explicacion: string }
export interface Partida { partida_id: string; event_id: string; puntaje: number; cuenta_para_ranking: boolean; aciertos: number; total: number; correccion: { pregunta_id: string; correcta: boolean; explicacion: string }[] }
export const fmt = (n: number) => new Intl.NumberFormat('es-AR').format(n);
