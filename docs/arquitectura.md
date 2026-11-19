# Arquitectura de la prueba de concepto

Resumen técnico para el equipo. El razonamiento completo (necesidades del negocio, alternativas, árbol de utilidad, riesgos y tradeoffs) está en el white paper.

## Componentes

| Servicio | Responsabilidad | Persistencia |
| --- | --- | --- |
| `api` | Recibe la partida, la corrige, la guarda y publica `partida.finalizada`. No espera a los consumidores. | PostgreSQL |
| `ranking-consumer` | Suma puntos al ranking semanal del curso. | Redis (sorted set `ranking:<curso>:<semana>`) |
| `rachas-consumer` | Actualiza los días seguidos jugados por alumno. | Redis |
| `analitica-consumer` | Acumula aciertos por concepto y deja `concepto.bajo_dominio` en el outbox para publicación con reintentos. | PostgreSQL (`analitica_concepto`, `outbox`) |
| `notificaciones-consumer` | Crea el aviso para el docente del curso ("Biología · 2.º B: Mitosis tiene bajo dominio (34%)"), idempotente por `event_id`. La API lo expone en `GET /docentes/yo/notificaciones` y `PATCH /notificaciones/:id/leida`. | PostgreSQL (`notificaciones`) |
| `web` | Pantallas del alumno (`/alumno`) y del docente (`/docente`). | — |
| `kafka` + `kafka-init` + `kafka-ui` | Un broker en modo KRaft, creación de tópicos y monitoreo. | Volumen `kafka-data` |

## Criterios de aceptación (Anexo C)

| Criterio | Cómo se demuestra |
| --- | --- |
| Ranking actualizado en menos de 3 s | Jugar una partida desde Swagger y ver el ranking; `ranking-consumer` loguea `latencia_ms` y la guarda en la lista de Redis `metricas:latencia_ranking` (últimas 1.000). `GET /metricas` devuelve `{ muestras, p50_ms, p95_ms, max_ms }`. |
| Consumidor caído | `docker compose stop analitica-consumer`, correr el simulador, `docker compose start analitica-consumer`: el lag del grupo vuelve a 0 en Kafka UI. |
| Evento repetido | Reenviar el mismo mensaje desde Kafka UI: el log dice "evento repetido" y el puntaje no cambia. |
| Bajo dominio | `docker compose run --rm simulador --alumnos 50 --bajo-dominio mitosis`: aparece `concepto.bajo_dominio` y el aviso al docente. |

`./scripts/verificar-fase1.sh` corre todos estos escenarios (más el outbox con Kafka detenido, la seguridad y el pico de 200 alumnos) desde cero con `docker compose down -v` y sale con código distinto de 0 si alguno falla.

## Decisiones del esqueleto

- **Un solo lenguaje (TypeScript):** la API, los consumidores y la web comparten los contratos de eventos de `packages/shared`.
- **Cliente de Kafka `@confluentinc/kafka-javascript`:** cliente mantenido por Confluent sobre librdkafka, con una API compatible con KafkaJS. Se eligió en lugar de KafkaJS porque KafkaJS ya no recibe mantenimiento activo y la PoC usa Kafka 4.x.
- **Autenticación simple:** `POST /auth/alumno` y `POST /auth/docente` devuelven un JWT (`@fastify/jwt`, 12 h) con `{ id, rol }`; las claves están hasheadas con bcrypt (pgcrypto en el seed, `bcryptjs` en la API). Un hook global exige el token salvo en `/health`, `/docs` y `/auth/*`. Un alumno solo opera sobre los cursos en los que está inscripto y como él mismo (el `alumno_id` sale del token); un docente, solo sobre sus cursos. Sin token: 401; sin permiso: 403.
- **Productor idempotente** (`idempotent: true`, `acks: -1`): evita duplicados por reintentos del propio productor; los consumidores igual son idempotentes.
- **Corrección en el servidor:** el cliente manda `respuesta_dada` y la API decide si es correcta con las funciones puras de `packages/shared/src/juego.ts` (también el puntaje: 100 por acierto + hasta 20 por rapidez).
- **Transactional outbox:** `POST /partidas` guarda en **una sola transacción** la partida, sus respuestas y el evento `partida.finalizada` en la tabla `outbox` (su `event_id` es la PK). Un publicador dentro del proceso de la API (`services/api/src/outbox.ts`) lee cada 200 ms lo pendiente (`FOR UPDATE SKIP LOCKED`, lotes de 100), lo publica con clave `curso_id` y marca `publicado_en`; además se dispara apenas se confirma cada partida. Si Kafka no responde (el envío vence a los 10 s), no marca nada y reintenta. Con Kafka caído la partida igual se guarda y se responde 202.
- **Avisos sin pérdida:** `analitica-consumer` guarda `concepto.bajo_dominio` en ese mismo outbox, junto con los contadores y la marca de idempotencia. El publicador de la API lo envía a Kafka. Si la API está detenida, el aviso queda pendiente; `scripts/verificar-outbox-alerta.sh` reproduce ese caso.
- **Estado del ranking tras una partida (B4):** `partidas.event_id` relaciona la partida con su evento. Antes de guardar, la API anota el puesto actual en `puesto_antes:<event_id>` (Redis, 1 h). `ranking-consumer` marca `procesado:ranking:<event_id>` y suma los puntos en un único script Lua atómico; `GET /partidas/:partidaId/ranking` responde `pendiente` hasta que existe esa marca.
- **Recuperación tras reiniciar el broker:** los consumidores usan una sesión de grupo de 10 s (heartbeat cada 3 s), así detectan pronto que perdieron el grupo y se vuelven a unir.

## Arranque y reinicio con Kafka caído

La conexión del productor se crea dentro del publicador, cuando encuentra eventos pendientes, sin bloquear el arranque HTTP. `/health` comprueba PostgreSQL y Redis, no Kafka; login sigue disponible. `POST /partidas` devuelve 202 tras guardar partida, respuestas y outbox en PostgreSQL. El publicador reintenta con backoff de 200 ms hasta 5 s entre fallos (el cliente Kafka tiene además sus propios reintentos y timeout de envío de 10 s). Publica secuencialmente el lote ordenado por `creado_en`; solo marca el lote tras confirmar todos los envíos. Si falla parcialmente, puede repetir eventos: los consumidores los deduplican.

Se reproduce con `bash scripts/verificar-resiliencia.sh`: detiene Kafka, reinicia API, prueba salud y login, guarda tres partidas pendientes y recupera Kafka. Antes del cambio, la espera de `crearProductor` anterior a `listen` impedía servir salud y login.

El orden descrito aplica al publicador único de esta PoC. Varias instancias con `SKIP LOCKED` requieren serializar por curso para preservar ese orden entre publicadores.

## Limitaciones conocidas

- **Sesión de partida.** `GET /cursos/:id/partida-nueva` devuelve una sesión firmada con HMAC (no es un JWT de acceso) que fija alumno, curso, preguntas asignadas, vencimiento (2 h) y si la partida suma al ranking. La corrección por pregunta y `POST /partidas` la exigen: no se pueden elegir preguntas ni mandar de más, y la primera respuesta corregida de cada pregunta queda en Redis, así que no se puede cambiar después de ver el feedback. Solo la primera partida que el alumno empieza en el día y el curso suma al ranking (marca `SET NX` en Redis al repartir las preguntas); las demás viajan con `cuenta_para_ranking: false`.
- Queda abierto: un alumno puede ver las correcciones de una partida de práctica (no suman puntos, pero sí cuentan en la analítica) y el cliente declara `tiempo_ms` (hasta 20 puntos de bonus por pregunta). Cerrarlo del todo requiere registrar en el servidor cuándo se muestra y cuándo se responde cada pregunta.
- **Límite de login.** Contadores en Redis por IP y usuario (10 fallos) y por IP (100), ventanas de 5 minutos. La API usa `trustProxy` solo para direcciones locales y privadas, así `request.ip` es la IP del usuario que informa Caddy y no la del proxy. Si Redis no responde, el login sigue funcionando sin límite.
