# StudyLeague · Prueba de concepto

Trabajo Práctico Integrador Final de **Ingeniería de Software II**, ITBA, 2.º cuatrimestre de 2026.
**Integrantes:** Franco Ferrari, Nicolás Mazzitelli, Mateo Pirola y Nicolás Revale.

[White paper para la entrega](docs/StudyLeague%20-%20White%20paper%20TP%20Integrador%20Final.pdf) · [Versión editable](docs/StudyLeague%20-%20White%20paper%20TP%20Integrador%20Final.docx)

[Registro de cambios y pendientes de la entrega](docs/registro-de-cambios-para-entrega.md)

StudyLeague convierte el repaso del contenido de clase en partidas cortas, con un ranking semanal entre compañeros de curso. El docente ve qué conceptos entendió el curso y recibe un aviso cuando alguno queda flojo.

Esta prueba de concepto valida la **arquitectura orientada a eventos con Apache Kafka** que propone el white paper. Cuando un alumno termina una partida, la API publica un único evento `partida.finalizada`. Cuatro servicios lo procesan por su cuenta: el ranking, las rachas, la analítica por concepto y, en cadena, los avisos al docente.

- **Versión desplegada:** https://studyleague-959617.chilecentral.cloudapp.azure.com. Ver [Deploy en la nube](#deploy-en-la-nube) para el acceso.
- **Para correrla en local:** `docker compose up -d --build`.

## Historia de usuario

> **Como** alumno, **quiero** que al terminar una partida mi puntaje impacte en el ranking del curso **para** ver mi posición al instante.
> **Como** docente, **quiero** enterarme cuando la mayoría del curso falla un concepto **para** reforzarlo antes del examen.

Criterios de aceptación (Anexo C del white paper):

1. El ranking se actualiza en **menos de 3 segundos** (p95) después de terminar la partida.
2. Si un consumidor se cae, **no se pierden partidas**: al volver, procesa lo pendiente.
3. Un evento repetido **no se cuenta dos veces**.
4. Cuando un concepto suma 10 respuestas o más con **menos del 40 %** de aciertos, el docente del curso recibe un aviso.

## Arquitectura

```
Alumno ──► API ──(outbox)──► [partida.finalizada] ──┬──► ranking-consumer ─────► Redis (ranking semanal)
            │                 clave: curso_id       ├──► rachas-consumer ──────► Redis (rachas)
            ▼                 3 particiones          └──► analitica-consumer ───► PostgreSQL (aciertos por concepto)
        PostgreSQL                                              │
                                                                ▼
                               (outbox)──► [concepto.bajo_dominio] ──► notificaciones-consumer ──► aviso al docente
```

| Servicio | Qué hace |
| --- | --- |
| `api` | Fastify + Swagger. Corrige la partida en el servidor y la guarda junto con su evento en la tabla `outbox`, en **una sola transacción**. Un publicador la manda a Kafka. Si Kafka está caído, la partida igual se guarda (202) y se publica después. |
| `ranking-consumer` | Suma los puntos al ranking semanal del curso (sorted set de Redis). Mide la latencia partida → ranking. |
| `rachas-consumer` | Cuenta los días de juego seguidos de cada alumno, según los días de juego del curso. |
| `analitica-consumer` | Acumula aciertos por concepto. Si un concepto cruza el umbral, guarda `concepto.bajo_dominio` en el outbox en la misma transacción; el publicador de la API lo envía a Kafka y reintenta si falla. |
| `notificaciones-consumer` | Crea el aviso para el docente del curso. |
| `web` | React: app del alumno (`/alumno`, móvil) y web del docente (`/docente`, escritorio). |
| `kafka`, `kafka-init`, `kafka-ui` | Kafka 4.1 en modo KRaft (un broker), creación de tópicos y monitoreo. |
| `caddy` | Solo en la nube: HTTPS y credenciales. |

No son microservicios: es una API más consumidores livianos que comparten los contratos de `packages/shared`. Hay más detalle en [docs/arquitectura.md](docs/arquitectura.md) y en [docs/eventos.md](docs/eventos.md).

**Garantías.**
- Entrega al menos una vez. Cada consumidor es **idempotente por `event_id`**: en Redis con un script Lua atómico, y en PostgreSQL con `eventos_procesados` en la misma transacción.
- Los avisos de bajo dominio también usan el outbox: si falla su publicación, quedan pendientes y se envían al volver la API o Kafka.
- El orden se respeta por curso, porque la clave del evento es `curso_id`.
- Los eventos llevan solo identificadores, nunca nombres: los usuarios son menores.

## Cómo levantarlo

Requisitos: Docker con Compose v2 y al menos 4 GB de RAM asignados a Docker.

```bash
docker compose up -d --build
```

La primera vez tarda unos minutos, por la construcción de las imágenes. Está listo cuando `docker compose ps` muestra todo en `running`, con `kafka-init` en `exited (0)`. No hace falta un `.env`: los valores por defecto sirven para correrlo en local, y `.env.example` documenta las variables.

| URL | Qué es |
| --- | --- |
| http://localhost:5173 | Web: portada, app del alumno y web del docente |
| http://localhost:3000/docs | API con Swagger |
| http://localhost:8080 | Kafka UI: tópicos, mensajes y lag de cada grupo de consumidores |

Para dejar los datos de la demo en su estado inicial (se puede repetir):

```bash
bash scripts/demo-reset.sh
```

Para apagar todo, `docker compose down`. Para borrar también los datos, `docker compose down -v`.

## Usuarios de prueba

| Rol | Usuario | Clave |
| --- | --- | --- |
| Alumno (Tomás R.) | `tomas` | `alumno123` |
| Otros 29 alumnos de Biología · 2.º B | `alu-02` … `alu-30` | `alumno123` |
| Docente (Prof. Laura Gómez) | `laura.gomez` | `docente123` |
| Otro docente (Historia y Matemática) | `docente.demo` | `docente123` |

## Qué probar y qué se espera

Antes de empezar, corré `bash scripts/demo-reset.sh`. En la nube es `./deploy/azure.sh ssh bash scripts/demo-reset.sh`.

**1. Estado inicial.**
- Como `tomas`: Biología · 2.º B, puesto 7.º con 1.270 puntos y racha de 4 días.
- Como `laura.gomez`, en la analítica del curso: Mitosis 6/18 (33 %) con aviso y Organelas 14/30 (47 %) sin aviso. Los demás conceptos están entre 55 % y 82 %.
- En notificaciones, Laura tiene un aviso por Mitosis.

**2. El puntaje impacta en el ranking al instante (criterio 1).**
- Como Tomás, jugá una trivia. Al terminar, la pantalla de resultado muestra el puntaje y el **puesto nuevo** en menos de un segundo. Una buena partida lo sube al 4.º o 5.º puesto.
- Si hoy es día de juego del curso (lunes, miércoles o viernes), la racha pasa a 5.
- `GET /metricas` devuelve la latencia partida → ranking (p50, p95, máximo).

**3. Aviso en vivo al docente (criterio 4).** Con las notificaciones de Laura abiertas, corré:

```bash
docker compose run --rm simulador --alumnos 4 --segundos 0 --bajo-dominio organelas
```

- Organelas baja del 40 % en la tercera partida (14/36).
- En segundos le llega a Laura el aviso «Organelas tiene bajo dominio», sin recargar la página.
- En Kafka UI aparece el evento en `concepto.bajo_dominio`.

**4. Un consumidor caído no pierde partidas (criterio 2 y desacoplamiento).**

```bash
docker compose stop analitica-consumer notificaciones-consumer
docker compose run --rm simulador --alumnos 30        # los alumnos siguen jugando sin errores
# Kafka UI: el lag del grupo "analitica" crece; el ranking se sigue actualizando
docker compose start analitica-consumer notificaciones-consumer
```

Al volver, los consumidores retoman desde su último offset. El lag baja a 0 y la analítica suma las 30 partidas.

**5. Un evento repetido no se cuenta dos veces (criterio 3).**
- En Kafka UI, en el tópico `partida.finalizada`, reenviá un mensaje existente con el mismo `event_id`.
- Los consumidores loguean «evento repetido, se descarta». Ni el ranking ni la analítica cambian.

**6. Reprocesar la historia (replay).** Este es el motivo para elegir Kafka y no una cola que borra los mensajes al consumirlos.

```bash
bash scripts/replay.sh            # PAUSA=1 bash scripts/replay.sh se detiene entre pasos
```

El script hace esto:
1. Borra la tabla de analítica, como si se hubiera perdido por un bug.
2. Rebobina el grupo `analitica` al principio de `partida.finalizada`.
3. Restaura el snapshot base y deja que el consumidor relea todo el historial.

**Se espera:** la analítica queda **idéntica** a la de antes y el docente **no recibe avisos duplicados**, porque el `event_id` del aviso es determinista. Mientras tanto, el ranking y las rachas siguen funcionando. Para que haya historial, jugá partidas o corré el simulador antes.

**7. Carga del día de juego (escalabilidad).**

```bash
bash scripts/medir-carga.sh 1000 60     # 1.000 partidas en 60 s, como el ASR
```

Imprime un JSON con las fallas, la latencia partida → ranking, las partidas guardadas contra las procesadas por la analítica, y el pico de CPU y memoria por contenedor. Después corré `demo-reset`.

## Resultados medidos en la nube

Medido en la VM de Azure (2 vCPU, 4 GB), con el simulador corriendo en la misma máquina, así que los números son conservadores. Los datos completos están en [docs/mediciones-nube.json](docs/mediciones-nube.json).

| Escenario | Objetivo | Resultado |
| --- | --- | --- |
| 1.000 partidas en 60 s (ASR) | Sin errores | 1.000/1.000, 0 fallas |
| Latencia partida → ranking | p95 < 3 s | p50 16 ms · **p95 34 ms** · máx. 230 ms |
| Sin pérdida | Todas las partidas en la analítica | 1.000 guardadas, 1.000 procesadas, outbox vacío |
| 3.000 partidas en 60 s (el triple) | Margen | 0 fallas · p95 52 ms · nada perdido |
| Replay de 4.000 eventos | Proyección idéntica | 36 s, analítica idéntica, 0 avisos duplicados |
| Analítica caída durante 1.000 partidas | Al volver, procesa todo | 1.000 pendientes procesadas en 23 s (lag de 1.000 a 0) |
| Arranque en frío (minutos después de prender la VM) | p95 < 3 s | p95 852 ms · máx. 4,2 s; con el sistema caliente, p95 29 ms |
| Recursos con 1.000 partidas | Entrar en 4 GB | Kafka ~630 MiB; cada servicio Node < 100 MiB |

## API y eventos

En Swagger, primero hacé `POST /auth/login` con `{ "usuario", "clave" }` y pegá el `token` en **Authorize**. Todas las rutas piden `Authorization: Bearer <token>`, salvo `/health`, `/salud`, `/docs` y `/auth/*`. Sin token responden 401 y sin permiso, 403.

Los tres endpoints de login comparten un límite de 10 intentos fallidos por IP y usuario cada 5 minutos; después responden 429 con `Retry-After`. El contador vive en la memoria de la única instancia de API de esta PoC.

| Método y ruta | Qué hace |
| --- | --- |
| `POST /auth/login` | Ingreso de alumno o docente. Devuelve un JWT de 12 h. |
| `GET /alumnos/yo/inicio` | Cursos del alumno, próximo día de juego, racha, puntos y puesto. |
| `GET /cursos/{cursoId}/partida-nueva?minijuego=trivia` | Preguntas para una partida, sin las respuestas. |
| `POST /partidas` | Registra la partida, la corrige en el servidor y publica `partida.finalizada` vía outbox. Responde 202. |
| `GET /partidas/{partidaId}/ranking` | `pendiente` hasta que el ranking procesó la partida; después, el puesto anterior y el nuevo. |
| `GET /cursos/{cursoId}/ranking` | Ranking semanal del curso. |
| `GET /cursos/{cursoId}/analitica` | Aciertos por concepto. Solo para el docente del curso. |
| `GET /cursos/{cursoId}/conceptos/{conceptoId}` | Detalle agregado de un concepto, sin identificar alumnos. |
| `GET /docentes/yo/cursos` | Cursos del docente con su participación semanal. |
| `GET /docentes/yo/notificaciones` · `PATCH /notificaciones/{id}/leida` | Avisos de bajo dominio. |
| `GET /metricas` | Latencia partida → ranking de los últimos 1.000 eventos. |

| Tópico | Particiones | Clave | Lo publica | Lo consumen (grupos) |
| --- | --- | --- | --- | --- |
| `partida.finalizada` | 3 | `curso_id` | api (outbox) | `ranking`, `rachas`, `analitica` |
| `concepto.bajo_dominio` | 1 | `curso_id` | api (outbox de analítica) | `notificaciones` |
| `partida.finalizada.dlq` | 1 | la original | consumidores | inspección en Kafka UI |

La retención es de 7 días. Ejemplo de `partida.finalizada`; el resto de los contratos está en [docs/eventos.md](docs/eventos.md):

```json
{ "event_id": "5f0c7a1e-…", "tipo": "partida.finalizada", "version": 1, "ocurrido_en": "2026-11-18T14:05:12.345Z",
  "partida_id": "b1e5d0a2-…", "curso_id": "bio-2b", "alumno_id": "alu-01", "minijuego": "trivia", "puntaje": 820,
  "respuestas": [{ "pregunta_id": "mitosis-p1", "concepto_id": "mitosis", "correcta": false, "tiempo_ms": 6400 }] }
```

## Deploy en la nube

Corre en una VM de Azure for Students: Chile Central, Standard_B2als_v2 (2 vCPU, 4 GB), Ubuntu 24.04. Usa el mismo `docker-compose.yml` más [docker-compose.prod.yml](docker-compose.prod.yml), que suma Caddy con HTTPS (Let's Encrypt) y deja expuestos solo los puertos 80 y 443. Kafka, PostgreSQL y Redis no se publican.

**URL:** https://studyleague-959617.chilecentral.cloudapp.azure.com

**Credenciales:** el acceso tiene dos niveles.
1. Al entrar, el navegador pide usuario y clave (basic auth): usuario `catedra`. **La clave se entrega por separado y no está en el repositorio.** Esto protege la web, Swagger (`/api/docs`), Kafka UI (`/kafka-ui`) y el login de la API (`/api/auth/*`).
2. Después se entra a la app con los [usuarios de prueba](#usuarios-de-prueba). Las demás rutas de la API (`/api/*`) se protegen con sus propios tokens JWT.

**Alcance del acceso:** el login necesita Basic Auth, pero las demás rutas `/api/*` usan el token JWT en ese mismo header. Los usuarios y claves de demo son públicos y los datos cargados son ficticios; por eso esta instancia sigue siendo una demo, no un sistema con datos reales. La API permite CORS solo desde los orígenes indicados por `CORS_ORIGINS` (por defecto, la web local); CORS no reemplaza la autenticación ni restringe clientes fuera del navegador.

`deploy/azure.sh` automatiza el deploy. Requiere Azure CLI con `az login`, `ssh` y `rsync`. Crea la VM, copia el clon local, genera en la VM un `.env` con secretos propios y levanta todo:

```bash
./deploy/azure.sh up        # crea o prende la VM y despliega (también sirve para actualizar)
./deploy/azure.sh down      # apaga y desasigna la VM para no gastar crédito
./deploy/azure.sh estado    # prendida o apagada, y la URL
./deploy/azure.sh ssh bash scripts/replay.sh   # cualquier script, ejecutado en la VM
```

## Desarrollo y pruebas automáticas

Para desarrollar fuera de Docker hace falta Node.js 22.

```bash
npm install
npm run infra:up                                  # Kafka, Kafka UI, PostgreSQL y Redis en Docker
KAFKA_BROKERS=localhost:9094 npm run dev -w services/api
KAFKA_BROKERS=localhost:9094 npm run dev -w services/ranking-consumer
npm run dev -w apps/web
```

`npm run build` compila todo y `npm run typecheck` verifica los tipos. Los scripts de verificación corren contra el stack levantado y modifican los datos de la demo, así que hay que ejecutarlos en secuencia y terminar con `demo-reset`:

| Script | Qué verifica |
| --- | --- |
| `bash scripts/verificar-fase1.sh` | Los cuatro criterios de aceptación, el outbox con Kafka caído, la seguridad y un pico de 200 alumnos. Borra los volúmenes. |
| `bash scripts/verificar-resiliencia.sh` | Que la API arranque y guarde partidas con Kafka detenido y las publique al volver. |
| `bash scripts/verificar-outbox-alerta.sh` | Detiene la API, provoca una alerta y comprueba que queda pendiente en el outbox y llega una vez al reiniciar. Restablece los datos de demo al inicio. |
| `bash scripts/verificar-seed.sh` | El seed del ranking: puesto y puntos de Tomás antes y después de jugar. |
| `node scripts/verificar-api-fase2.mjs` | Las rutas de la fase 2: permisos, contratos y datos. |
| `node scripts/verificar-fase2.mjs`, `verificar-alerta-fase2.mjs`, `verificar-estados-fase2.mjs` | Recorridos de punta a punta en Chrome. Necesitan Node 22 y Chrome. |
| `bash scripts/replay.sh` · `bash scripts/medir-carga.sh` | Replay y carga (ver arriba). |

## Estructura del repositorio

| Carpeta | Contenido |
| --- | --- |
| `packages/shared` | Tópicos, contratos de eventos, cliente de Kafka, reglas del juego, del ranking y de las rachas |
| `services/api` | API de partidas (Fastify + Swagger) con outbox |
| `services/*-consumer` | Ranking, rachas, analítica y notificaciones |
| `apps/web` | Web en React según los mockups |
| `tools/simulador`, `tools/seed-ranking` | Generador de partidas en masa y seed del ranking de la demo |
| `infra/` | Creación de tópicos, esquema y datos de PostgreSQL, Caddyfile |
| `deploy/` | Script de Azure y cloud-init de la VM |
| `scripts/` | Reset de la demo, replay, medición de carga y verificaciones |
| `docs/` | Arquitectura, eventos, endpoints, informe de fase 2 y mediciones |

## Límites conocidos de la PoC

- **Un solo broker de Kafka, sin replicación.** En producción harían falta 3 brokers con factor de replicación 3, o un servicio gestionado.
- **Una sola VM.** Todo comparte 2 vCPU. Sirve para la demo y para medir el ASR, no para alta disponibilidad.
- **El snapshot del replay es fijo.** Los contadores base de la demo (`scripts/analitica-base.sql`) representan el historial anterior a la retención. En producción, el snapshot se generaría periódicamente.
- **Corrección sin estado.** Un alumno autenticado puede consultar la corrección de una pregunta sin haberla jugado. Se mitigaría con una sesión de partida en el servidor.
- **Bonus de rapidez.** La API corrige los aciertos, pero el cliente declara `tiempo_ms`; un cliente modificado puede inflar el bonus. Para un ranking competitivo real habría que registrar el tiempo de cada respuesta en el servidor.
- **Solo está la trivia.** Los demás minijuegos, el alta de cursos y la carga de contenido tienen pantallas de marcador: no son parte de lo que valida la PoC.
