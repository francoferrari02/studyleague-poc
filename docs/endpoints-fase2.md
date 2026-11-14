# Datos de las pantallas de Fase 2

Inventario previo a los cambios de endpoints:

| Pantalla | Datos | Existente | Falta |
| --- | --- | --- | --- |
| A1/D1 | JWT, rol, nombre | POST /auth/alumno y /auth/docente | alias /auth/login solicitado |
| A3 | alumno, cursos, días, racha, puntos, puesto | Redis y tablas; sin ruta home | GET /alumnos/yo/inicio |
| A4–A7 | preguntas y feedback | GET /cursos/:cursoId/partida-nueva; POST /partidas | corrección stateless por pregunta; retirar respuestas del listado |
| A12/A13 | corrección final y ranking | POST /partidas; GET /partidas/:partidaId/ranking | ninguno |
| A14 | ranking, nombres, reinicio | GET /cursos/:cursoId/ranking devuelve ids | enriquecer nombres y reinicio |
| D2 | docente, escuela, cursos, participación y próximos días | tablas; sin ruta | GET /docentes/yo/cursos |
| D6 | participación, frecuencia, bajo dominio, contadores | GET /cursos/:cursoId/analitica sin KPIs | ampliar existente |
| D7 | conteos, alumnos distintos, opciones elegidas por pregunta | respuestas y partidas; sin ruta | GET /cursos/:cursoId/conceptos/:conceptoId |
| D8 | avisos, no leídas, marcar leído | GET /docentes/yo/notificaciones; PATCH /notificaciones/:id/leida | ninguno |

No se cambian eventos. Solo lecturas de PostgreSQL/Redis y corrección ya existente en shared. Los KPI reflejan actividad real de la semana ISO UTC: alumnos distintos / inscritos; partidas / inscritos; conceptos con ≥10 respuestas y proporción <0,4. No se inventan partidas históricas para reproducir 26/30 o 2,4.
