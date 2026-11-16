# Plan de implementación · StudyLeague PoC

TP Integrador Final · Ingeniería de Software II · 2.º cuatrimestre 2026
Equipo: Franco Ferrari, Nicolás Mazzitelli, Mateo Pirola, Nicolás Revale

**Entrega:** jueves 19/11/2026 (white paper + repo + URL en la nube + credenciales). **Defensa:** jueves 26/11/2026.

**Última actualización: sábado 14/11/2026, 17:00.** Las Fases 1 (backend, consumidores, infra) y 2 (frontend del alumno y pantallas del docente) están hechas y verificadas en local. Lo que falta está en la sección 0 y se detalla en la sección 4.

Leyenda de estado: **HECHO** (con el commit) · **PARCIAL** (qué falta) · **PENDIENTE**.

---

## 0. Para el equipo: dónde estamos y cómo seguir

### 0.1 Qué ya funciona (en local)

- Flujo completo del alumno con Trivia: ingreso → inicio → partida con temporizador de 20 s y feedback por pregunta → "calculando tu puesto" → puesto nuevo → ranking semanal.
- Flujo del docente: ingreso → Mis cursos → analítica por concepto (barras con el umbral del 40 %) → detalle del concepto → avisos de bajo dominio que aparecen solos.
- Backend con autenticación JWT, corrección de respuestas en el servidor, outbox transaccional, productor idempotente, tres tópicos de Kafka y DLQ.
- Consumidores `ranking`, `analitica` y `notificaciones` completos (idempotentes por `event_id`).
- Medición local: desde que el navegador envía la partida hasta que se ve el puesto, p50 53 ms y p95 113 ms sobre 20 partidas (el objetivo es p95 < 3 s). El consumidor de ranking mide p95 28 ms por su cuenta. **Son números locales: hay que volver a medirlos en la nube.**
- Resiliencia verificada: con Kafka detenido la API arranca, acepta partidas (202) y el outbox las publica al volver Kafka (~4 s).

### 0.2 Qué falta, en orden de prioridad

| # | Qué | Tareas | Por qué en este orden |
| --- | --- | --- | --- |
| 1 | **Deploy en la nube** con HTTPS y credenciales | I4 | Es lo que más puede salir mal y no se puede hacer a último momento. Sin esto no hay entrega. |
| 2 | **Rachas** | C3 | `rachas-consumer` todavía no calcula nada (`TODO(PoC)`), así que la racha que muestra A3 es siempre 0. |
| 3 | **README final, mediciones en la nube y white paper** | I6, I7 | La entrega incluye el documento con números reales, el link al repo y la URL. |
| 4 | **Prueba en máquina limpia** | I5 | Otra persona levanta todo siguiendo solo el README. |
| 5 | **Tests unitarios y CI** | C7 | Hoy no hay ningún test ni `npm test` en la CI. |
| 6 | **Deseables**: otros 4 minijuegos, unirse a un curso, progreso, alta de curso y carga de contenido, ranking del docente | F5, F2, F8, F15–F17, B5, B6 (lo que falta), C6 | Solo si lo anterior está resuelto. |

### 0.3 Cómo levantar el proyecto

```bash
git clone https://github.com/francoferrari02/studyleague-poc.git
cd studyleague-poc
cp .env.example .env        # completar JWT_SECRET (mínimo 32 caracteres, ver README)
nvm use 22                  # se requiere Node 22
npm ci
docker compose up -d --build
npm run demo:reset          # antes de cada demo o ensayo (borra toda la actividad de la PoC)
```

- Alumno: http://localhost:5173/alumno/ingreso · `tomas` / `alumno123` (hay también `alu-02` … `alu-30` con la misma clave).
- Docente: http://localhost:5173/docente/ingreso · `laura.gomez` / `docente123`. Otro docente de demo: `docente.demo` / `docente123`.
- Swagger: http://localhost:3000/docs · Kafka UI: ver README.
- Para disparar la alerta de bajo dominio con la pantalla D8 abierta: `docker compose run --rm simulador --alumnos 4 --segundos 0 --bajo-dominio organelas`.

### 0.4 Documentos del repo que hay que leer antes de tocar algo

- `README.md` (cómo correr, estructura, demo-reset, frontend).
- `docs/informe-fase2.md` (qué se hizo, decisiones, desvíos respecto de los mockups, mediciones).
- `docs/endpoints-fase2.md` (contratos de los endpoints).
- `docs/arquitectura.md` (incluye "Limitaciones conocidas") y `docs/eventos.md` (contratos de eventos).

### 0.5 Reglas de trabajo

- Una tarea por commit, en español, con el código del plan: `C3: calcular rachas en el consumidor`.
- Cambios por pull request con la CI en verde (`npm run build` y `docker compose config -q`). Cuando exista `C7`, también `npm test`.
- Cada tarea cierra con `npm run build` y `docker compose config -q` en verde, y probando lo que dice "Listo cuando".
- Sin secretos en el repo (`.env` no se versiona). Sin imágenes `latest`. Dependencias nuevas solo con versión fija y justificación en el commit.
- No cambiar el esquema de base ni los contratos de eventos sin avisar al equipo: los consumidores dependen de ellos.
- Los números del mockup nunca se hardcodean en la interfaz; todo sale de datos reales.

### 0.6 Decisiones y límites que hay que conocer (para defender y para no romperlos)

- **B2 ya no entrega las respuestas correctas.** El alumno ve el feedback por pregunta con `POST /cursos/:cursoId/preguntas/:preguntaId/correccion` (stateless, no guarda, no publica eventos, no suma puntos, límite de 60 consultas por minuto por alumno, en memoria). El puntaje y el ranking salen **solo** del `POST /partidas` final, que corrige todo de nuevo en el servidor.
- **Limitación aceptada:** un alumno autenticado puede consultar la corrección de preguntas sin haber jugado. La mitigación futura (sesión de partida en el servidor) está escrita en `docs/arquitectura.md`.
- **`POST /partidas` es idempotente:** acepta un UUID del cliente; la primera escritura gana.
- **D7 muestra la distribución de opciones elegidas, no una evolución temporal** (así es el frame; la consigna original lo pedía por error).
- **`npm run demo:reset`** detiene API y consumidores, borra y recrea los tres tópicos, limpia tablas y Redis de la PoC y vuelve a sembrar. Es solo para la demo, nunca para un entorno compartido. Hay que verificar que funcione igual con `docker-compose.prod.yml` en la VM.
- **Estado inicial de la demo:** Tomás 7.º con 1.270 puntos y 4.º con 2.090 tras la partida de demo. Conceptos: Célula 42/51 (82 %), Fotosíntesis 32/47 (68 %), Membrana 21/38 (55 %), Organelas 14/30 (47 %), Mitosis 6/18 (33 %, con aviso ya enviado). Con seis respuestas incorrectas más, Organelas baja del 40 % y dispara el aviso en vivo (~4,6 s hasta verse en D8).
- **Cursos extra de demo** (`003_demo_cursos.sql`): Laura tiene Biología 2.º B, Biología 3.º A y Ciencias Naturales 1.º C; `docente.demo` tiene Historia y Matemática 2.º B (Tomás inscripto). Los cuatro nuevos no tienen preguntas ni actividad: sus KPIs son cero y en A3 figuran como "Próximamente".
- **Pantallas con marcador** (no son funciones terminadas): A2, A8–A11, A15, D3, D4, D5, D9.
- **El orden de los eventos asume un único publicador del outbox** (una sola instancia de la API). Con varios hay que coordinarlos.
- **Si el evento se pierde después del COMMIT de analítica, el aviso de bajo dominio puede perderse** (se reintenta la publicación 5 veces). Es una limitación conocida y una buena respuesta para el Q&A.
- **El host necesita Node 22** (el binario nativo de Kafka del Mac de Franco estaba compilado para Node 20); dentro de Docker no hay problema.

---

## 1. Alcance y prioridades

Si el domingo a la noche algo de "Imprescindible" no anda, se recorta de "Deseable" para recuperar tiempo.

| Nivel | Qué incluye | Estado |
| --- | --- | --- |
| **Imprescindible** (lo que se demuestra en la defensa) | Flujo de punta a punta con Trivia: A1, A3, A4, A5–A7, A12–A14. Docente: D1, D2, D6, D7, D8. API con corrección en el servidor y outbox. `analitica-consumer` y `notificaciones-consumer` completos. Medición de latencia p95. Deploy en la nube con credenciales. README final. | **Hecho en local.** Falta: deploy en la nube (I4), medición en la nube, README final (I6). |
| **Deseable** | Los otros 4 minijuegos (A8–A11). Rachas (A15 y racha de A3). Alta de curso y carga de contenido (D3–D5). A2 (unirse con código). D9 (ranking docente). Tests unitarios. | Pendiente. **C3 (rachas) y C7 (tests) suben de prioridad** (ver 0.2). |
| **Si sobra tiempo** | D10 (estado vacío). Reprocesar la DLQ desde un script. Notificaciones en tiempo real con SSE en lugar de consultas periódicas. Animaciones (confeti, subida en el ranking). | Pendiente. |

**Fuera de alcance de la PoC** (se menciona como trabajo futuro): app móvil nativa, publicación en tiendas, multi-escuela con administrador, recuperación de contraseña, 3 brokers con replicación, sesión de partida en el servidor.

---

## 2. Frentes de trabajo

| Frente | Contenido | Responsable (completar) |
| --- | --- | --- |
| **B · Backend** | API, endpoints para las pantallas pendientes | ________ |
| **C · Consumidores y datos** | Rachas, tests, datos de ejemplo | ________ |
| **F · Frontend** | Pantallas pendientes del alumno y del docente | ________ |
| **I · Infra, deploy y documentación** | Nube, README, white paper, prueba limpia, demo | ________ |

**Sugerencia de reparto para lo que queda:**
- **Persona 1 (infra):** I4 → I5 → I6. Es el camino crítico.
- **Persona 2 (consumidores/tests):** C3 → C7 → medición en la nube con el simulador (alimenta I7).
- **Persona 3 (frontend deseable):** F5 (otros minijuegos) junto con las preguntas de C6; después F8.
- **Persona 4 (backend + frontend deseable):** B5 (unirse y progreso) con F2; después B6 (crear curso, contenido, ranking docente) con F15–F17.

---

## 3. Estado de todas las tareas

| Tarea | Estado | Commit / nota |
| --- | --- | --- |
| I1 · Primer `docker compose up` real | **HECHO** | `da239ba` |
| I2 · Repositorio en GitHub | **PARCIAL** | Repo creado y con remoto (`origin`). Falta: proteger `main` con PR + CI y confirmar que los 4 clonan y compilan. Decidir público/privado según la cátedra. |
| I3 · Versiones fijas de imágenes | **HECHO** | `3929f32` (la imagen de nginx fija solo la versión menor) |
| I4 · VM en la nube | **HECHO** | Azure, Chile Central, B2als_v2. `deploy/azure.sh up/down`. Caddy con basic auth (usuario `catedra`) salvo `/api`, que usa JWT. Mediciones en `docs/mediciones-nube.json` |
| I5 · Prueba en máquina limpia | **PENDIENTE** | |
| I6 · README final | **HECHO** | Orientado al corrector: URL, credenciales, 7 pruebas con resultado esperado (incluye replay y carga), endpoints, eventos y números medidos en la nube |
| I7 · Actualizar el white paper | **PENDIENTE** | |
| B1 · Autenticación | **HECHO** | `da4ecb8` |
| B2 · Preguntas para jugar | **HECHO** | `c947008`; en Fase 2 se retiraron las respuestas del listado y se agregó el endpoint de corrección |
| B3 · Corrección en servidor y outbox | **HECHO** | `57bbea6`; en Fase 2 se agregó el UUID de idempotencia |
| B4 · Estado del ranking tras la partida | **HECHO** | `d4dfa09` |
| B5 · Endpoints del alumno | **PARCIAL** | Hechos: inicio (`GET /alumnos/yo/inicio`) y ranking con `nombre_visible`. Faltan: `POST /cursos/unirse` y `GET /alumnos/yo/progreso` |
| B6 · Endpoints del docente | **PARCIAL** | Hechos: cursos propios, analítica, detalle del concepto, notificaciones (listar y marcar leída). Faltan: `POST /cursos`, conceptos y preguntas (alta/edición), `GET /cursos/:id/ranking/detalle` |
| B7 · Métricas para la demo | **HECHO** | `31f67bf` (`GET /metricas`) |
| C1 · `analitica-consumer` | **HECHO** | `d4224ed` |
| C2 · `notificaciones-consumer` | **HECHO** | `2bcbf45` |
| C3 · `rachas-consumer` | **HECHO** | Regla con `cursos.dias_juego` en hora de Argentina, Lua atómico idempotente, `jugados:<alumno>:<semana>`; la API muestra solo la racha vigente; `demo:reset` deja a Tomás con racha 4 |
| C4 · Latencia en `ranking-consumer` | **HECHO** | `31f67bf` |
| C5 · Simulador con el nuevo contrato | **HECHO** | `27cfaa3`; en Fase 2 pasó a leer las soluciones desde PostgreSQL y a fallar siempre el concepto objetivo |
| C6 · Más datos de ejemplo | **PARCIAL** | Hechas: preguntas de trivia y verdadero o falso, seed del ranking (`a1572fc`), cursos extra (`003_demo_cursos.sql`). Faltan preguntas para los otros minijuegos (solo si se hace F5) |
| C7 · Tests unitarios | **PENDIENTE** | Prioridad 5. No hay tests ni `npm test` en la CI |
| F0 · Componentes base | **HECHO** | `5eab9b8` |
| F1 · Ingreso (A1) | **HECHO** | `63e5358` |
| F2 · Unirse a un curso (A2) | **PENDIENTE** | Deseable; depende de B5 |
| F3 · Inicio (A3) | **HECHO** | `0465cd9` (la racha depende de C3) |
| F4 · Trivia (A4–A7) | **HECHO** | `d2911ba` |
| F5 · Otros minijuegos (A8–A11) | **PENDIENTE** | Deseable; el servidor ya corrige los cinco tipos, falta la interfaz y las preguntas |
| F6 · Puesto en vivo (A12–A13) | **HECHO** | `8cd678b` |
| F7 · Ranking (A14) | **HECHO** | `953c9eb` (solo vista semanal) |
| F8 · Mi progreso (A15) | **PENDIENTE** | Deseable; depende de B5 y C3 |
| F10 · Ingreso docente (D1) | **HECHO** | `59a9730` |
| F11 · Mis cursos (D2) | **HECHO** | `88cc7e8` (D10, estado vacío: pendiente, si sobra tiempo) |
| F12 · Notificaciones (D8) | **HECHO** | `a1f8253` |
| F13 · Analítica (D6) | **HECHO** | `8767f25` |
| F14 · Detalle del concepto (D7) | **HECHO** | `077fd22` |
| F15 · Crear curso y modal con código (D3, D4) | **PENDIENTE** | Deseable; depende de B6 |
| F16 · Cargar contenido (D5) | **PENDIENTE** | Deseable; depende de B6 |
| F17 · Ranking del docente (D9) | **PENDIENTE** | Deseable; depende de B6 |
| R1–R3 (arreglos tras la revisión de Fase 1) | **HECHO** | `76c49ba` (ranking inicial), `deb8dbe` (demo-reset), `746fe8b` (API sin Kafka) |

Numeración de pantallas del docente según los mockups: D1 ingreso, D2 mis cursos, D3 crear curso, D4 curso creado (modal con código), D5 cargar contenido, D6 analítica, D7 detalle del concepto, D8 notificaciones, D9 ranking, D10 estado vacío.

---

## 4. Detalle de lo que falta

### I · Infraestructura, deploy y documentación

**I4 · Máquina virtual en la nube** — *prioridad 1*
- VM Linux con 2 vCPU y 4 GB de RAM como mínimo (revisar qué créditos tiene el equipo en AWS, Google Cloud o Azure). Instalar Docker y el plugin de Compose.
- Firewall: solo 22, 80 y 443.
- Dominio: si no tienen uno, usar `<ip-publica>.sslip.io`, que resuelve a la IP y le permite a Caddy obtener un certificado HTTPS.
- `.env` en la VM con contraseñas propias (nunca en el repo) y el hash de basic auth. Cambiar `JWT_SECRET`. Las contraseñas de demo (`alumno123`, `docente123`) son públicas en el repo: el basic auth de Caddy es lo que protege el sitio.
- `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`.
- Verificar que `npm run demo:reset` funcione con el compose de producción en la VM (necesita Node 22, npm y `rg` en la máquina donde se ejecute).
- **Listo cuando:** desde otra red, la URL pide usuario y contraseña y luego abre la web, `/api/docs` y `/kafka-ui`; Kafka, PostgreSQL y Redis no responden desde afuera; el flujo de Trivia y el aviso de bajo dominio funcionan en la nube.

**I5 · Prueba en máquina limpia**
- Otro integrante clona el repo en su computadora y lo levanta solo siguiendo el README.
- **Listo cuando:** funciona sin preguntarle nada a nadie.

**I6 · README final** *(completar lo que falta)*
- URL del deploy, cómo pedir las credenciales (en la entrega, no en el repo), guion de la demo con los comandos, tabla de criterios de aceptación con cómo verificar cada uno, y los números medidos en la nube (p95, lag). Reemplazar el `TODO` de la sección "Deploy en la nube".
- Actualizar la sección "Estado" para que diga con claridad qué pantallas son funciones terminadas y cuáles son marcadores.

**I7 · Actualizar el white paper con lo construido**
- Definir **un solo SLI** y citarlo siempre igual. Hoy hay tres cifras locales (17 ms y 28 ms del consumidor, 113 ms de extremo a extremo desde el navegador); en el documento usar la de extremo a extremo (envío de la partida → puesto visible) y aclarar qué mide cada una.
- Reemplazar los supuestos por mediciones **hechas en la nube**: p95 de la latencia, partidas por segundo que soportó el simulador y tiempo en que el lag vuelve a 0 tras reiniciar la analítica.
- Agregar el link al repo y a la URL. Agregar la limitación conocida del endpoint de corrección y la del orden con varios publicadores, si caben.
- Revisar que la sección 6 coincida con lo implementado (tópicos, particiones, outbox).
- Pendientes del documento: saltos de página manuales (antes de Índice, Referencias y Anexo A), nombre de la universidad en la portada, y reemplazar los supuestos señalados.
- Si la cátedra lo pide, sumar la estimación de esfuerzo del MVP completo (PERT por épica) en un anexo.
- Volver a verificar que el cuerpo siga en 5 páginas o menos.

### C · Consumidores y datos

**C3 · `rachas-consumer` completo** — *prioridad 2*
- Archivo: `services/rachas-consumer/src/index.ts` (hoy tiene `TODO(PoC)`).
- Regla: la racha cuenta los días de juego seguidos del curso en que el alumno jugó al menos una partida. Usar `cursos.dias_juego` (leer de PostgreSQL al iniciar y guardar en memoria).
- Guardar en Redis el hash `racha:<curso_id>:<alumno_id>` con `ultimo_dia` y `dias` (**esa es la clave que ya lee `GET /alumnos/yo/inicio`**, campo `dias`), y el set `jugados:<alumno_id>:<semana>` para el calendario de A15.
- Si `ultimo_dia` es hoy, no cambia; si es el día de juego anterior, `dias + 1`; si no, `dias = 1`.
- Debe ser idempotente por `event_id`, como los otros consumidores.
- Decidir con el equipo si `demo:reset` siembra una racha para Tomás (el reset hoy borra las rachas), de modo que A3 se vea como el mockup en la demo.
- **Listo cuando:** un alumno que juega lunes, miércoles y viernes tiene racha 3; si no juega el miércoles, el viernes vuelve a 1; A3 muestra la racha real.

**C6 · Más datos de ejemplo** *(solo si se hace F5)*
- Agregar preguntas para los minijuegos que faltan (ordenar, emparejar, definición con palabras clave) en `infra/postgres/init/002_seed.sql`, con al menos 2 por concepto y por minijuego.

**C7 · Tests unitarios**
- Agregar `vitest`. Probar: cálculo de puntaje, corrección de los 5 minijuegos (`packages/shared/src/juego.ts`), regla de bajo dominio (C1), regla de rachas (C3) y `semanaIso`.
- Extraer la lógica que quede acoplada a Kafka o a bases a funciones puras en `packages/shared`.
- Sumar `npm test` a la CI (`.github/workflows/ci.yml`).
- **Listo cuando:** `npm test` pasa en local y en la CI.

### B · Backend (`services/api`)

**B5 · Endpoints del alumno que faltan**
- `POST /cursos/unirse` con `{ codigo }` → inscribe al alumno (A2). Error claro si el código no existe.
- `GET /alumnos/yo/progreso` → racha, días jugados de las últimas dos semanas, puntos de la semana y conceptos más repasados (A15). Depende de C3.

**B6 · Endpoints del docente que faltan**
- `POST /cursos` → crea el curso y genera un código único de 6 caracteres sin caracteres ambiguos (sin 0, O, 1, I) (D3, D4).
- `GET/POST /cursos/:cursoId/conceptos` y `POST/PUT /preguntas` (D5).
- `GET /cursos/:cursoId/ranking/detalle` → puesto, alumno, puntos, partidas jugadas y racha (D9).
- Todos con JWT, rol y comprobación de que el curso es del docente; documentados en Swagger y en `docs/endpoints-fase2.md`.

### F · Frontend (deseable)

Siempre: se ve como su frame del mockup (colores, tipografías, textos), usa datos reales de la API y no se rompe sin datos (estado vacío o de carga). El diseño se lee de `StudyLeague · Mockups PoC.html` (formato "bundler": 29 frames comprimidos en un manifest; extraerlos a una carpeta temporal ignorada por Git o abrir el archivo en un navegador).

- **F5 · Otros minijuegos (A8–A11):** verdadero o falso, ordenar (arrastrar con `@dnd-kit`), emparejar y definición con palabras clave. Reutilizan el temporizador, el feedback por pregunta y el único `POST /partidas` final de F4. Dependen de preguntas en el seed (C6).
- **F2 · Unirse a un curso (A2):** depende de B5.
- **F8 · Mi progreso (A15):** depende de B5 y C3.
- **F15 · Crear curso y modal con código (D3, D4), F16 · Cargar contenido (D5), F17 · Ranking del docente (D9):** dependen de B6. D10 (estado vacío) si sobra tiempo.

---

## 5. Cronograma actualizado

| Día | Infra y docs | Consumidores y tests | Deseables (frontend y backend) |
| --- | --- | --- | --- |
| **Sáb 14** (tarde/noche) | Repartir tareas. Empezar I4 (crear la VM, Docker, dominio) | C3 | — |
| **Dom 15** | I4 terminado y probado; I2 (proteger `main`) | C3 terminado, C7 | Empezar lo que se pueda de los deseables |
| **Lun 16** | I5 (prueba limpia); I6; medir en la nube con el simulador | C7 en la CI | F5, B5 + F2, F8 |
| **Mar 17** | I7 (white paper con números reales) | Corrección de errores | Lo que esté cerca de terminar; el resto se recorta |
| **Mié 18** | Verificación completa (sección 6) sobre la nube, redeploy final | Corrección de errores | — |
| **Jue 19** | **Entrega** | | |

**Corte de alcance (domingo 15 a la noche):** el criterio ya se cumple en local (flujo de Trivia de punta a punta y D6 → D7 → D8). Lo que decide si se siguen haciendo deseables es que **I4 (deploy) esté funcionando**. Si no lo está el domingo a la noche, los cuatro se dedican al deploy y se dejan todos los deseables.

**Congelamiento (martes 17 a la noche):** desde acá, solo corrección de errores, deploy y documentación.

---

## 6. Verificación antes de entregar (miércoles 18)

Correr esta lista sobre el deploy en la nube, no solo en local:

- [ ] **Ranking actualizado:** un alumno juega una trivia desde la web y su posición cambia en menos de 3 s (A12 → A13).
- [ ] **Consumidor caído:** `docker compose stop analitica-consumer`, simular 50 partidas, `docker compose start analitica-consumer`; en Kafka UI el lag del grupo `analitica` sube y vuelve a 0, y `analitica_concepto` suma las 50 partidas.
- [ ] **Evento repetido:** reenviar un mensaje de `partida.finalizada` desde Kafka UI; el puntaje del ranking no cambia y el log dice "evento repetido".
- [ ] **Bajo dominio:** `npm run demo:reset` y luego `simulador --alumnos 4 --segundos 0 --bajo-dominio organelas`; aparece un único mensaje en `concepto.bajo_dominio` y la docente ve la notificación (D8) y el detalle (D7).
- [ ] **Outbox:** con Kafka detenido, una partida igual se guarda; al levantarlo, se publica.
- [ ] **Pico:** `simulador --alumnos 200` sin errores; anotar el p95 de `GET /metricas` y el de extremo a extremo.
- [ ] **Seguridad:** sin credenciales no se accede a nada; un alumno no puede ver la analítica; un docente no ve cursos de otro docente.
- [ ] **Desde cero:** `docker compose down -v && docker compose up -d --build` funciona en una máquina limpia.
- [ ] El white paper tiene los números medidos en la nube, el link al repo y la URL, y el cuerpo ocupa 5 páginas o menos.

---

## 7. Después de la entrega (20 al 25/11)

- **Diapositivas** a partir del white paper, siguiendo el guion de 10 minutos del plan del TP.
- **Guion de la demo** (10 min): Kafka UI con los tópicos → partida de Trivia en vivo con el ranking actualizándose → simulador de 200 alumnos con el lag subiendo y bajando → analítica detenida y reiniciada sin perder nada → bajo dominio y aviso a la docente → (si hay tiempo) evento repetido.
- **Antes de cada ensayo:** `npm run demo:reset`.
- **Plan B:** grabar la demo completa en video y tener la PoC levantada también en una notebook.
- **Ensayo** cronometrado de 30 minutos con las preguntas probables. Preguntas que conviene preparar: por qué Kafka y no una cola simple, qué pasa si Kafka se cae (outbox), qué pasa si un evento se repite (idempotencia), qué pasa si se pierde un aviso después del COMMIT, por qué 3 particiones, por qué la clave es `curso_id`, y la limitación del endpoint de corrección.

---

## 8. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El deploy en la nube se deja para el final y falla | Es la tarea 1 (I4): arranca hoy y se prueba el domingo. Si hay problemas con la VM, usar una de 8 GB durante la semana de la defensa. |
| La VM no tiene RAM suficiente | Bajar la memoria de Kafka con `KAFKA_HEAP_OPTS=-Xmx512m` o usar una VM de 8 GB. |
| La racha de A3 se ve en 0 en la demo | C3 (prioridad 2) y decidir si `demo:reset` siembra la racha de Tomás. |
| Los números del white paper son de la PC local y no de la nube | Volver a medir en la VM (I7). Es un riesgo de coherencia entre el documento y el sistema entregado. |
| Mezclar tres cifras de latencia en el documento | Definir un único SLI (extremo a extremo) y citar cada medición con lo que mide. |
| `@confluentinc/kafka-javascript` falla al compilar en la VM | Ya compila y corre en Docker en el Mac. Si falla en la VM, plan B: KafkaJS 2.2.x, ya previsto detrás de `packages/shared/src/kafka.ts`. |
| Se pierde la conexión el día de la defensa | Video grabado y PoC local en una notebook. |
| Dudas de interpretación del enunciado (formato de entrega, repo público, qué credenciales quieren) | Preguntarlo a la cátedra **antes del lunes 16**. |
| Un `demo:reset` mal usado borra datos de la demo | Se usa solo antes de ensayos. Documentado en el README. |
