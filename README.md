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
| Otro docente de demo (Historia y Matemática) | `docente.demo` | `docente123` |

Todas las rutas piden `Authorization: Bearer <token>` salvo `/health`, `/salud`, `/docs` y `/auth/*`. El token se obtiene con `POST /auth/login`, `POST /auth/alumno` o `POST /auth/docente` (`{ "usuario", "clave" }`) y vence en 12 h. En Swagger, pegalo en el botón **Authorize**.

| Qué | Dirección |
| --- | --- |
| Web (alumno y docente) | http://localhost:5173 |
| API y Swagger | http://localhost:3000/docs |
| Kafka UI | http://localhost:8080 |

Para cargar en Redis el ranking semanal de Biología · 2.º B del mockup A14 (necesita Node y `npm install`):

```bash
npm run seed:ranking                # Tomás con 1.270 puntos: estado "antes de jugar"
npm run seed:ranking -- --despues   # Tomás con 2.090 puntos (puesto 4)
```

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

Fases 1 y 2 implementadas: Trivia, puesto en vivo, ranking semanal e ingreso/cursos/analítica/notificaciones del docente. Las rutas del resto de minijuegos, alta de cursos, carga de contenido y progreso conservan sus marcadores; no forman parte de esta fase.

## Antes de cada demo/ensayo

Con el stack iniciado, ejecutá `npm run demo:reset`. Es un reset **exclusivo de esta PoC**: borra todas las partidas, outbox, notificaciones, proyecciones, ranking, rachas y métricas; conserva usuarios, cursos y preguntas. Detiene los productores/consumidores y recrea los tres tópicos para que no se reproduzcan eventos viejos. Se puede repetir. Requiere Node 22, npm, Docker Compose y `rg`.

Mitosis arranca en 6/18 (33 %, frente al 34 % ilustrativo del mockup), con alerta enviada y un aviso existente. Organelas arranca en 14/30 (47 %), sin aviso: con seis respuestas incorrectas más cae a 39 %. Los demás contadores son 21/38, 32/47 y 42/51 (55 %, 68 %, 82 %). El reset usa Bash + SQL para reutilizar Compose y el seed sin sumar dependencias.

El seed adicional `003_demo_cursos.sql` se ejecuta con volumen vacío y también desde `demo-reset` para bases existentes. Laura tiene Biología 2.º B, Biología 3.º A y Ciencias Naturales 1.º C. El docente de demo tiene Historia y Matemática 2.º B, con Tomás inscripto. Los cuatro cursos nuevos no tienen preguntas ni minijuegos habilitados, actividad histórica ni proyecciones de analítica/ranking; sus KPIs son cero y en A3 las materias sin juegos aparecen como Próximamente. No se inventaron trivias ni actividad para esos cursos.

## Frontend de Fase 2

Abrí http://localhost:5173/alumno/ingreso para Tomás y http://localhost:5173/docente/ingreso para Laura. El ingreso redirige según rol. Las pantallas usan fuentes locales (no Google Fonts/CDN) y `/api` mediante nginx; Vite usa el mismo proxy durante desarrollo. La URL se configura con `VITE_API_URL` al construir.

El acceso rápido de Tomás está apagado por defecto. Para habilitarlo deliberadamente:

```bash
docker compose build --build-arg VITE_DEMO=true web
docker compose up -d --no-deps web
# Volver al valor por defecto:
docker compose build --build-arg VITE_DEMO=false web
docker compose up -d --no-deps web
```

Para cambiar la API en la web: `docker compose build --build-arg VITE_API_URL=https://tu-api.example web`. Normalmente debe conservarse `/api`. En desarrollo: `VITE_DEMO=true npm run dev -w apps/web`.

Para la alerta en vivo, después de `npm run demo:reset`, abrí las notificaciones de Laura y ejecutá:

```bash
docker compose run --rm simulador --alumnos 4 --segundos 0 --bajo-dominio organelas
```

El modo dirigido fuerza errores en Organelas; mantiene Mitosis baja y el resto de conceptos saludables para evitar alertas incidentales. Sin `--bajo-dominio`, el simulador conserva las probabilidades originales. Con dos preguntas de Organelas por trivia, el umbral se cruza durante la tercera partida (14/36 < 40 %); la cuarta mantiene la condición. No cambia contratos de eventos ni lógica de los consumidores.

Verificación reproducible (Node 22, Chrome instalado, `npm ci`; no instala navegadores):

```bash
npm run build
docker compose config -q
bash scripts/verificar-seed.sh
bash scripts/verificar-resiliencia.sh
bash scripts/verificar-fase1.sh  # borra volúmenes: entorno exclusivo de PoC
npm run demo:reset
node scripts/verificar-api-fase2.mjs
mkdir -p .verificacion/tmp
TMPDIR="$PWD/.verificacion/tmp" node scripts/verificar-fase2.mjs
TMPDIR="$PWD/.verificacion/tmp" node scripts/verificar-alerta-fase2.mjs
TMPDIR="$PWD/.verificacion/tmp" node scripts/verificar-estados-fase2.mjs
npm run demo:reset  # dejar la demo lista después de las pruebas
```

Las pruebas de navegador usan Chrome en `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; el recorrido principal admite `CHROME_PATH` y `WEB_URL` para otros entornos. Ejecutá las pruebas en secuencia: modifican datos de la demo. Perfiles, temporales y capturas quedan dentro de `.verificacion/`, ignorada por Git. Las mediciones están en `docs/mediciones-fase2.json` y el informe completo en `docs/informe-fase2.md`.
