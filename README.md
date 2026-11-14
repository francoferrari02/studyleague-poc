# StudyLeague · Prueba de concepto

Prueba de concepto del Trabajo Práctico Integrador Final de **Ingeniería de Software II** (2.º cuatrimestre 2026).

StudyLeague convierte el repaso del contenido de clase en partidas cortas con ranking entre compañeros. Esta prueba de concepto valida la arquitectura orientada a eventos con **Apache Kafka** descripta en el white paper: cuando un alumno termina una partida, la API publica un único evento `partida.finalizada` y cada servicio lo procesa por su cuenta.

**Integrantes:** Franco Ferrari, Nicolás Mazzitelli, Mateo Pirola, Nicolás Revale.

## Historia de usuario

> Como alumno, quiero que al terminar una partida mi puntaje impacte en el ranking del curso para ver mi posición al instante. Como docente, quiero enterarme cuando la mayoría del curso falla un concepto para reforzarlo antes del examen.

Los criterios de aceptación están en el Anexo C del white paper y en [docs/arquitectura.md](docs/arquitectura.md).

## Arquitectura

```
Alumno ──► API de partidas ──► [partida.finalizada] ──┬──► ranking-consumer ──► Redis (ranking semanal)
              │                 (clave: curso_id)     ├──► rachas-consumer ──► Redis (rachas)
              ▼                                       └──► analitica-consumer ──► PostgreSQL (analitica_concepto)
          PostgreSQL                                              │
                                                                  ▼
                                                    [concepto.bajo_dominio] ──► notificaciones-consumer ──► Docente
```

No son microservicios: es una API principal más consumidores livianos. Detalle en [docs/arquitectura.md](docs/arquitectura.md) y contratos de eventos en [docs/eventos.md](docs/eventos.md).

## Requisitos

- Docker Desktop (o Docker Engine + Compose v2), con al menos 4 GB de RAM asignados.
- Node.js 22 y npm, solo para desarrollar fuera de Docker.

## Cómo levantarlo

```bash
cp .env.example .env
# Completá JWT_SECRET en .env (mínimo 32 caracteres), por ejemplo con:
#   sed -i.bak "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
docker compose up -d --build
```

Los datos de ejemplo (`infra/postgres/init`) solo se cargan con el volumen vacío: para recargarlos, `docker compose down -v`.

**Usuarios de prueba** (solo para la PoC):

| Rol | Usuario | Clave |
| --- | --- | --- |
| Alumno (Tomás R., `alu-01`) | `tomas` | `alumno123` |
| Otros 29 alumnos de Biología · 2.º B | `alu-02` … `alu-30` | `alumno123` |
| Docente (Prof. Laura Gómez) | `laura.gomez` | `docente123` |

Todas las rutas piden `Authorization: Bearer <token>` salvo `/health`, `/docs` y `/auth/*`. El token se obtiene con `POST /auth/alumno` o `POST /auth/docente` (`{ "usuario", "clave" }`) y vence en 12 h. En Swagger, pegalo en el botón **Authorize**.

| Qué | Dirección |
| --- | --- |
| Web (alumno y docente) | http://localhost:5173 |
| API y Swagger | http://localhost:3000/docs |
| Kafka UI | http://localhost:8080 |

Para simular un pico de día de juego:

```bash
docker compose run --rm simulador --alumnos 200
docker compose run --rm simulador --alumnos 50 --bajo-dominio mitosis
```

Para apagar todo: `docker compose down`. Para borrar también los datos: `docker compose down -v`.

## Desarrollo local (sin reconstruir imágenes)

```bash
npm install
npm run infra:up                     # Kafka, Kafka UI, PostgreSQL y Redis en Docker
KAFKA_BROKERS=localhost:9094 npm run dev -w services/api
KAFKA_BROKERS=localhost:9094 npm run dev -w services/ranking-consumer
npm run dev -w apps/web
```

`npm run build` compila todos los paquetes y `npm run typecheck` solo verifica tipos.

## Estructura del repositorio

| Carpeta | Contenido |
| --- | --- |
| `packages/shared` | Nombres de tópicos, contratos de eventos, cliente de Kafka y utilidades compartidas |
| `services/api` | API de partidas (Fastify + Swagger). Publica `partida.finalizada` |
| `services/ranking-consumer` | Ranking semanal por curso en Redis, idempotente por `event_id` |
| `services/rachas-consumer` | Días seguidos jugados por alumno |
| `services/analitica-consumer` | Aciertos por concepto y detección de bajo dominio; publica `concepto.bajo_dominio` |
| `services/notificaciones-consumer` | Avisos al docente |
| `apps/web` | Web en React: `/alumno` (móvil) y `/docente` (escritorio), según los mockups |
| `tools/simulador` | Genera partidas en masa para la demo |
| `infra/kafka` | Creación de tópicos (`kafka-init`) |
| `infra/postgres/init` | Esquema y datos de ejemplo |
| `infra/caddy` | Proxy con HTTPS y credenciales para el deploy |
| `docs` | Arquitectura y contratos de eventos |

## Deploy en la nube

Una máquina virtual con Docker corre el mismo `docker-compose.yml` más `docker-compose.prod.yml`, que agrega Caddy (HTTPS y basic auth) y deja solo los puertos 80 y 443 expuestos:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

<!-- TODO: completar antes del 19/11 -->
- URL: _pendiente_
- Credenciales de acceso: _pendiente (se entregan aparte, no se suben al repo)_

## Estado

Esqueleto inicial. Los puntos a implementar están marcados con `TODO(PoC)` en el código (`grep -rn "TODO(PoC)" services apps`).
