# Informe de Fase 2 · StudyLeague PoC

Implementadas las tareas de revisión, base del frontend, Trivia, ranking y pantallas docentes solicitadas. Stack ejecutado con Docker Compose; Node del host 22.12.0 y contenedores Node 22.23.5. No se modificaron esquemas de base ni contratos de eventos. No se crearon commits de secretos, `.env` ni HTML extraídos.

## Tareas y commits

Cada tarea cerró con `npm run build` y `docker compose config -q` en verde.

| Tarea | Estado | Commit |
| --- | --- | --- |
| R1 | Redis confirma Tomás 7º/1270 → 4º/2090; script restaura el estado inicial | `76c49ba` |
| R2 | Reset repetible, sin reprocesar eventos antiguos; Mitosis con aviso existente y Organelas sin aviso | `deb8dbe` |
| R3 | HTTP arranca sin Kafka; partidas 202, outbox con backoff y recuperación real | `746fe8b` |
| F0 | Componentes, JWT, sesión tolerante a storage bloqueado, roles, layouts y fuentes locales | `5eab9b8` |
| F1 | Login, errores amigables, redirección por rol y demo apagada por defecto | `63e5358` |
| F3 | Home con cursos, próxima fecha, racha, puntos y puesto reales | `0465cd9` |
| F4 | Trivia, 20 s, feedback del servidor, resultado final autoritativo e idempotente | `d2911ba` |
| F6 | Polling ~500 ms, A12/A13, timeout de 10 s, reintento y cancelación al salir | `8cd678b` |
| F7 | Ranking semanal, nombres visibles, podio y fila propia sticky | `953c9eb` |
| D1 | Ingreso docente con diseño de escritorio | `59a9730` |
| D2 | Mis cursos propios, participación y acceso a D6 | `88cc7e8` |
| D6 | KPIs reales, barras, umbral 40 %, tabla y refresco | `8767f25` |
| D7 | Conteos y distribución de opciones reales, sin identificar alumnos | `077fd22` |
| D8 | Panel, contador, toast, lectura al abrir detalle y polling ~5 s; cierre de integración | commit `D8: …` (HEAD de esta fase) |

El commit de cierre D8 incluye correcciones descubiertas en las pruebas integradas: DNS dinámico de nginx al reiniciar API, expiración activa de sesión, espera de salud al terminar el reset, semillas adicionales autorizadas y ajustes visuales de A1/A3. También contiene scripts, mediciones e informe final.

## Endpoints creados en esta fase

| Endpoint | Acceso y propósito |
| --- | --- |
| `POST /auth/login` | Login unificado; mantiene los dos endpoints anteriores; acepta usuario o email docente |
| `GET /salud` | Alias público de `/health`, sin dependencia de Kafka |
| `GET /alumnos/yo/inicio` | Alumno del JWT; cursos, fechas, racha y ranking |
| `GET /docentes/yo/cursos` | Solo cursos propios, perfil y participación |
| `GET /cursos/:cursoId/conceptos/:conceptoId` | Solo docente dueño; estadísticas agregadas y opciones elegidas |
| `POST /cursos/:cursoId/preguntas/:preguntaId/correccion` | Alumno inscripto y trivia habilitada; feedback stateless con límite 60/min |

Swagger los documenta en `/docs`. Inventario previo, contratos y ampliaciones en [endpoints-fase2.md](endpoints-fase2.md). Se ampliaron home/ranking/analítica y el listado B2; `POST /partidas` admite UUID opcional para reintentos seguros. Notificaciones y marcar como leída reutilizan endpoints existentes.

B2 ya no entrega soluciones ni explicaciones. La única revelación para el alumno es el endpoint de feedback, después de enviar una respuesta; el listado docente D7 sí incluye la opción correcta para interpretar su distribución. El simulador y el verificador de Fase 1 obtienen las soluciones desde PostgreSQL mediante credenciales internas, sin endpoint servidor-only expuesto.

## Decisiones y datos

- **Reset Bash + SQL:** reutiliza Compose y el seed sin agregar un ejecutable/paquete. Detiene API y consumidores, elimina/recrea los tres tópicos, limpia tablas transaccionales/proyecciones y Redis exclusivo de la PoC, aplica cursos extra idempotentes y restaura el ranking. Espera salud HTTP antes de terminar. Es un reset de toda la actividad de esta PoC, no una herramienta para un entorno compartido de producción.
- **Contadores acordados:** Célula 42/51 → 82 %; Fotosíntesis 32/47 → 68 %; Membrana celular 21/38 → 55 %; Organelas 14/30 → 47 %; Mitosis 6/18 → 33 %. Todos los porcentajes de la app se calculan desde contadores reales. Mitosis queda con `alerta_enviada=true` y un aviso existente. Los demás, sin alerta enviada.
- **Cursos extra:** `003_demo_cursos.sql`, idempotente, también aplicado por `demo-reset` sobre volúmenes existentes. Laura recibe Biología 3.º A y Ciencias Naturales 1.º C; `docente.demo` recibe Historia y Matemática 2.º B. Tomás se inscribe en estas dos últimas. No se inventaron preguntas, minijuegos ni actividad histórica. Sus métricas/inscripciones son cero, salvo Tomás en Historia/Matemática. En A3 figuran como Próximamente.
- **Feedback:** reutiliza `corregirRespuesta`, no escribe respuestas, no publica eventos ni suma puntos. Contador en memoria por alumno, con limpieza de ventanas vencidas: sin dependencia adicional y suficiente para la instancia única de la PoC. No limita globalmente varias instancias y se reinicia con el proceso.
- **Autoridad final:** el navegador guarda opción elegida y tiempo por pregunta. Envía un solo POST al terminar; el servidor corrige otra vez. Un UUID generado por el cliente impide duplicados, incluso en peticiones concurrentes; primera escritura gana. Los reintentos no pueden cambiar el puntaje de la partida original.
- **Privacidad:** se muestran nombres visibles en ranking, y solo conteos/distribuciones agregados al docente. Los ids sirven para navegación/autorización y no se imprimen en pantallas.
- **Resiliencia:** el productor se conecta desde el outbox, sin bloquear HTTP. Lote ordenado, envíos secuenciales, backoff 200–5000 ms y consumidores idempotentes. El orden entre múltiples publicadores exige coordinación adicional; la PoC usa uno.
- **Simulador dirigido:** el concepto objetivo falla siempre; Mitosis se mantiene baja y el resto saludable. Evita alertas incidentales durante la demostración de Organelas. El modo sin objetivo conserva probabilidades originales.

## Navegación y diferencias con los frames

Se extrajeron y leyeron los 29 frames del bundle, incluyendo sus templates anidados y recursos. Se capturaron los frames relevantes en Chrome para comparación. La referencia visual fue el sistema existente, sin introducir otra dirección gráfica.

- **Numeración confirmada:** D1 es Ingreso docente y D2 es Mis cursos. D2 → D6 mediante la tarjeta del curso o Analítica; D6 → D7 mediante Ver detalle o el nombre del concepto. No se inventó una pantalla de resumen.
- **D3/D4/D5:** Crear curso / Curso creado con modal y código / Cargar contenido. Quedan fuera de esta fase; Crear curso y Contenido aparecen inactivos. D9, A2, A8–A11 y A15 conservan marcadores protegidos, sin presentarlos como funciones terminadas.
- **D7:** por confirmación del usuario, muestra distribución de opciones, sin evolución temporal. La mención de evolución en la consigna inicial era un error. Las opciones se cuentan desde `respuestas.respuesta_dada`, filtradas por curso/concepto y asociadas a partidas reales. No se cambió esquema ni eventos.
- **Mitosis:** 33 % real en lugar del 34 % ilustrativo; se conserva el conteo 18 de D7. Los demás contadores difieren como máximo una respuesta de los frames, con los porcentajes acordados.
- **Actividad real:** días de juego, rachas, puntajes, puestos y KPIs no se fijan a “hoy”, 5/6 días, 820 puntos, puesto 4, 26/30 o 2,4 partidas. Dependen del calendario UTC y de lo jugado. Los cursos nuevos de Laura no simulan 28/31 inscriptos ni participación inexistente.
- **A5–A7:** no se muestra un puntaje provisional ni +100/+20 de bonus: el endpoint autorizado devuelve exclusivamente corrección/opción/explicación, y los puntos provienen solo del POST final. El encabezado muestra respuestas acumuladas. El resultado A12/A13 sí usa puntaje del servidor.
- **A1:** se usa el emblema/espaciado del frame con íconos Phosphor; se agrega mostrar/ocultar contraseña e ingreso docente. No se ofrece el alta con código (A2 fuera de alcance). El acceso rápido solo existe con `VITE_DEMO=true`.
- **D1:** el panel violeta conserva la composición y el texto; reemplaza los porcentajes ilustrativos previos al login por una vista textual de funciones para evitar métricas hardcodeadas. No expone analítica sin autenticar.
- **A14:** solo período semanal; no ofrece el selector mensual sin contrato funcional. Se verifica la fila sticky al dejar de verse la fila original.
- **D7 inicial:** el reset siembra agregados, no respuestas históricas. Por eso el conteo de alumnos distintos y distribución empieza vacío; aparece con partidas reales. La UI explica ese vacío. Se muestra la pregunta con más errores; no se inventa “Confunden metafase con anafase” ni acciones de edición/revisión persistentes que no estén implementadas.
- **Detalle visual:** marca e íconos usan Phosphor en lugar de los SVG artesanales del bundle; íconos Fill en alumno y Regular en docente. Se ajustaron A1/A3 después de comparar capturas. No se afirma identidad pixel a pixel.

## Verificación y mediciones

Evidencias locales en `.verificacion/` (ignoradas por Git); scripts reproducibles versionados en `scripts/`.

| Verificación | Resultado |
| --- | --- |
| Build completo + Compose | Verdes en cada cierre de tarea y en el cierre final |
| Seed Redis | `ZREVRANK` 6/3 (puestos 7/4), `ZSCORE` 1270/2090; restaura antes de jugar |
| Reset repetido | Dos ejecuciones consecutivas con exactamente cinco agregados y un aviso de Mitosis; luego reusado en pruebas integradas |
| Fase 1 completa final | TODO OK; 200 partidas, cero fallas y cero pendientes; p50 14 ms, p95 28 ms, máximo 125 ms del consumidor |
| Kafka detenido + API reiniciada | Salud/login disponibles; tres POST 202 pendientes; outbox drenado ~4 s tras recuperar Kafka |
| API Fase 2 | JWT/roles/cursos, Laura 3 cursos y otro docente 2, seed extra idempotente sin modificar ranking/analítica de Biología, distribución real de opciones, listado sin soluciones, corrección sin escritura, UUID concurrente, autoridad final y rate limit 60/61 verificados |
| Navegador principal | 20 partidas completas, alumno → inicio → trivia/feedback → resultado → ranking; docente → cursos → analítica → detalle → avisos; cero `pageerror` |
| Estados de UI | API caída, sin token, alumno entrando a docente, JWT que vence con pantalla abierta y storage bloqueado: verificados |
| Timeout de juego | Espera real 20 s; guarda `respuesta_dada=null` y `tiempo_ms=20000`; A7 y corrección final incorrecta |
| Envío/polling | Doble clic: un solo POST; A12 timeout de 10 s y reintento; se cancela al desmontar |
| Alerta en vivo | Organelas visible 4599 ms después del cruce del umbral; dos tandas, un aviso de Organelas y el único Mitosis del seed; ningún agregado/aviso nuevo en otros cursos |
| Responsive | Alumno contenido en 390 px a 390/768/1440; docente revisado a 390/768/1440 sin desbordes horizontales |

Medición **envío final desde el navegador → puesto visible en A13**, 20 partidas completas, un alumno por partida para no agotar el rate limit con clics automatizados:

| Muestras | p50 | p95 | Máximo | SLO |
| --- | --- | --- | --- | --- |
| 20 | 53 ms | 113 ms | 818 ms | p95 < 3000 ms: cumple |

Valores individuales en [mediciones-fase2.json](mediciones-fase2.json). El primer POST incluye el arranque frío del productor. La medición usa Chrome headless local, Docker/Colima local y polling real de A13; no representa una red de producción ni sustituye una prueba de carga del deploy. La medición de 28 ms del consumidor excluye polling/render y se informa por separado.

En el recorrido principal, la alerta tardó 10224 ms desde iniciar el comando del simulador, incluyendo arranque del contenedor/autenticación. En una prueba dirigida aparte, desde la partida que acumuló seis errores de Organelas hasta verla en D8 fueron 4599 ms. El cruce se identifica con las respuestas reales acumuladas por partida; se comparan timestamps de host/VM local.

## Dependencias agregadas

| Dependencia | Versión fija | Motivo |
| --- | --- | --- |
| `@fontsource/fredoka` | 5.3.0 | Títulos/marca locales, sin CDN |
| `@fontsource/nunito` | 5.3.0 | Interfaz alumno local |
| `@fontsource/inter` | 5.3.0 | Interfaz docente local |
| `@playwright/test` | 1.65.1 (dev) | Recorridos reales, aserciones y capturas usando Chrome instalado; no descarga navegadores |
| `pg` en simulador | 8.23.1 | Leer soluciones por vía interna tras retirar respuestas de B2; ya existía en otros workspaces |
| `@types/pg` en simulador | 8.20.0 (dev) | Tipado del acceso interno a PostgreSQL |

Se mantuvo Phosphor ya instalado. El rate limit no agrega dependencia. Se exportó el submódulo puro `shared/ranking` para que el seed no cargue innecesariamente Kafka nativo (el binario del host estaba compilado para Node 20; el seed funciona con Node 22 sin recompilarlo).

## Limitaciones y alcance no verificado

- La corrección stateless permite consultar soluciones sin haber jugado; aceptado por el usuario y documentado con mitigación futura en [arquitectura.md](arquitectura.md#limitaciones-conocidas). El límite en memoria reduce abuso, no impide enumeración.
- No se verificó un deploy remoto, red móvil real, SSE, múltiples publicadores de outbox ni múltiples instancias del rate limit. No forman parte de esta fase.
- No se implementaron los minijuegos restantes, alta/carga de contenido, progreso ni revisión editorial de conceptos. Sus marcadores/rutas no equivalen a funcionalidades terminadas.
- El desarrollo local de procesos que cargan Kafka nativo requiere dependencias instaladas con Node 22; se verificó su ejecución en Docker. El host conserva un binario previo de otra ABI; no fue necesario modificar archivos del usuario fuera del proyecto.
- No se corrió el inspector genérico de estilos de la skill como criterio de identidad; se verificó visualmente contra los frames y con Chrome/Playwright, respetando el violeta, las fuentes y las tarjetas requeridas por el diseño.

## Cómo correrlo

```bash
# Dentro de studyleague-poc; .env existente con JWT_SECRET (no versionado).
npm ci
docker compose up -d --build
npm run demo:reset
# Alumno: http://localhost:5173/alumno/ingreso · tomas / alumno123
# Docente: http://localhost:5173/docente/ingreso · laura.gomez / docente123
# Otro docente: docente.demo / docente123
# Swagger: http://localhost:3000/docs
```

Antes de cada demo/ensayo: `npm run demo:reset`. Con D8 abierto:

```bash
docker compose run --rm simulador --alumnos 4 --segundos 0 --bajo-dominio organelas
```

La secuencia completa de verificación y configuración `VITE_DEMO`/`VITE_API_URL` está en el [README](../README.md#frontend-de-fase-2). Se borraron los HTML de `.tmp-mockups/` al terminar; las capturas comparativas quedan solo como evidencia local ignorada.
