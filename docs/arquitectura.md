# Arquitectura de la prueba de concepto

Resumen técnico para el equipo. El razonamiento completo (necesidades del negocio, alternativas, árbol de utilidad, riesgos y tradeoffs) está en el white paper.

## Componentes

| Servicio | Responsabilidad | Persistencia |
| --- | --- | --- |
| `api` | Recibe la partida, la corrige, la guarda y publica `partida.finalizada`. No espera a los consumidores. | PostgreSQL |
| `ranking-consumer` | Suma puntos al ranking semanal del curso. | Redis (sorted set `ranking:<curso>:<semana>`) |
| `rachas-consumer` | Actualiza los días seguidos jugados por alumno. | Redis |
| `analitica-consumer` | Acumula aciertos por concepto y publica `concepto.bajo_dominio`. | PostgreSQL (`analitica_concepto`) |
| `notificaciones-consumer` | Crea el aviso para el docente del curso. | PostgreSQL (`notificaciones`) |
| `web` | Pantallas del alumno (`/alumno`) y del docente (`/docente`). | — |
| `kafka` + `kafka-init` + `kafka-ui` | Un broker en modo KRaft, creación de tópicos y monitoreo. | Volumen `kafka-data` |

## Criterios de aceptación (Anexo C)

| Criterio | Cómo se demuestra |
| --- | --- |
| Ranking actualizado en menos de 3 s | Jugar una partida desde Swagger y ver el ranking; `ranking-consumer` loguea `latencia_ms`. |
| Consumidor caído | `docker compose stop analitica-consumer`, correr el simulador, `docker compose start analitica-consumer`: el lag del grupo vuelve a 0 en Kafka UI. |
| Evento repetido | Reenviar el mismo mensaje desde Kafka UI: el log dice "evento repetido" y el puntaje no cambia. |
| Bajo dominio | `docker compose run --rm simulador --alumnos 50 --bajo-dominio mitosis`: aparece `concepto.bajo_dominio` y el aviso al docente. |

## Decisiones del esqueleto

- **Un solo lenguaje (TypeScript):** la API, los consumidores y la web comparten los contratos de eventos de `packages/shared`.
- **Cliente de Kafka `@confluentinc/kafka-javascript`:** cliente mantenido por Confluent sobre librdkafka, con una API compatible con KafkaJS. Se eligió en lugar de KafkaJS porque KafkaJS ya no recibe mantenimiento activo y la PoC usa Kafka 4.x.
- **Productor idempotente** (`idempotent: true`, `acks: -1`): evita duplicados por reintentos del propio productor; los consumidores igual son idempotentes.
- **Pendiente: transactional outbox.** La tabla `outbox` ya existe en el esquema; falta que la API escriba ahí en la misma transacción que la partida y que un proceso publique lo pendiente.
