/**
 * Mapa de rutas ↔ pantallas de los mockups (StudyLeague · Mockups PoC).
 * Cada ruta empieza como un marcador; al implementarla, reemplazar el
 * componente en App.tsx por la página real en src/pages/<rol>/.
 */
export type Rol = "alumno" | "docente";

export interface Pantalla {
  ruta: string;
  rol: Rol;
  titulo: string;
  /** Códigos de los frames del mockup que cubre esta ruta. */
  mockups: string[];
}

export const PANTALLAS: Pantalla[] = [
  // App del alumno (móvil, 390 px)
  { rol: "alumno", ruta: "/alumno/ingreso", titulo: "Ingreso", mockups: ["A1"] },
  { rol: "alumno", ruta: "/alumno/unirse", titulo: "Unirse a un curso", mockups: ["A2"] },
  { rol: "alumno", ruta: "/alumno", titulo: "Inicio", mockups: ["A3"] },
  { rol: "alumno", ruta: "/alumno/jugar", titulo: "Antes de jugar", mockups: ["A4"] },
  {
    rol: "alumno",
    ruta: "/alumno/partida",
    titulo: "Partida (5 minijuegos y estados de respuesta)",
    mockups: ["A5", "A6", "A7", "A8", "A9", "A10", "A11"],
  },
  { rol: "alumno", ruta: "/alumno/resultado", titulo: "Resultado y ranking actualizándose", mockups: ["A12", "A13"] },
  { rol: "alumno", ruta: "/alumno/ranking", titulo: "Ranking del curso", mockups: ["A14"] },
  { rol: "alumno", ruta: "/alumno/progreso", titulo: "Mi progreso", mockups: ["A15"] },

  // Web del docente (escritorio, 1440 px)
  { rol: "docente", ruta: "/docente/ingreso", titulo: "Ingreso docente", mockups: ["D1"] },
  { rol: "docente", ruta: "/docente/cursos", titulo: "Mis cursos, estado vacío y notificaciones", mockups: ["D2", "D8", "D10"] },
  { rol: "docente", ruta: "/docente/cursos/nuevo", titulo: "Crear curso y curso creado", mockups: ["D3", "D4"] },
  { rol: "docente", ruta: "/docente/cursos/:cursoId/contenido", titulo: "Cargar contenido", mockups: ["D5"] },
  { rol: "docente", ruta: "/docente/cursos/:cursoId/analitica", titulo: "Analítica del curso", mockups: ["D6"] },
  {
    rol: "docente",
    ruta: "/docente/cursos/:cursoId/conceptos/:conceptoId",
    titulo: "Detalle de concepto con bajo dominio",
    mockups: ["D7"],
  },
  { rol: "docente", ruta: "/docente/cursos/:cursoId/ranking", titulo: "Ranking del curso (vista docente)", mockups: ["D9"] },
];
