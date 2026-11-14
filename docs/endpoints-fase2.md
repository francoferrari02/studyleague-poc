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

## Corrección por pregunta (creado en esta fase)

`POST /cursos/:cursoId/preguntas/:preguntaId/correccion`, JWT alumno, cuerpo `{respuesta_dada: string|null}`. Exige inscripción y que la pregunta sea trivia de ese curso, con trivia habilitada. Devuelve exclusivamente `{correcta, respuesta_correcta, explicacion}`. Reutiliza `corregirRespuesta`; no persiste ni suma puntos. Límite: 60 consultas/minuto por alumno, contador en memoria con limpieza cada minuto (sin dependencia nueva). No es global entre instancias y se reinicia con el proceso; adecuado al único proceso PoC. Un exceso responde 429 y `Retry-After`.

B2 deja de enviar `respuesta_correcta` y `explicacion` para todos los minijuegos; agrega `concepto_nombre`. El simulador lee las soluciones directamente desde PostgreSQL con credenciales internas de Compose; `verificar-fase1.sh` también usa SQL interno. Ninguna ruta pública o autenticada de listado devuelve soluciones. Los tipos de eventos no contienen respuestas correctas y no cambian.

`POST /partidas` acepta ahora `partida_id` UUID opcional, generado por el navegador, para reintentos seguros. Una inserción concurrente con el mismo UUID guarda una sola partida/evento; el mismo alumno/curso/minijuego recibe el resultado original (primera escritura gana); otro dueño o curso recibe 409. Siempre vuelve a corregir las respuestas enviadas en el servidor, sin confiar en el feedback previo. Conserva el contrato sin UUID para los clientes anteriores.
