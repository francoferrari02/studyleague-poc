# Registro de cambios para la entrega

Este documento distingue lo que se preparó para el TP de las mejoras adicionales incorporadas durante la auditoría. Estado al 17/11/2026. Los cambios están publicados en `main`; **publicar en GitHub no actualiza la VM de Azure**.

## Entregables y flujo principal

| Commit | Cambio | Motivo |
| --- | --- | --- |
| [`ac03654`](https://github.com/francoferrari02/studyleague-poc/commit/ac03654) | Se agregó el borrador v2 recibido y el [white paper final](StudyLeague%20-%20White%20paper%20TP%20Integrador%20Final.pdf) en PDF y DOCX; el README enlaza ambos formatos. | Entregable obligatorio. El PDF tiene portada, índice, cinco páginas de contenido (incluidas las referencias) y anexos. |
| [`ac03654`](https://github.com/francoferrari02/studyleague-poc/commit/ac03654) | `analitica-consumer` guarda `concepto.bajo_dominio` en el outbox de PostgreSQL en la misma transacción que actualiza los contadores y la marca de idempotencia. El publicador de la API lo envía a Kafka. Se añadió `scripts/verificar-outbox-alerta.sh` y se actualizaron README, arquitectura y eventos. | Antes, un fallo después de confirmar la analítica podía perder el aviso. Este cambio responde al requisito de confiabilidad de la PoC. Si la API está detenida, el aviso queda pendiente hasta que vuelva. |

El white paper presenta el problema y el producto, relaciona necesidades del negocio con atributos de calidad, explica Kafka, compara alternativas y describe una historia de usuario no trivial, la arquitectura y las mediciones. La consigna y la presentación de defensa son documentos separados; la defensa todavía no se preparó.

## Mejoras adicionales de la auditoría

| Commit | Cambio | Relación con la entrega |
| --- | --- | --- |
| [`ac03654`](https://github.com/francoferrari02/studyleague-poc/commit/ac03654) | Se actualizaron `@fastify/jwt`, `@fastify/swagger-ui` y el lockfile. | Reduce alertas de dependencias de producción; no era obligatorio para la historia de usuario. |
| [`c8dafa9`](https://github.com/francoferrari02/studyleague-poc/commit/c8dafa9) | Se marcó el plan de implementación del 14/11 como histórico, se documentó el alcance del acceso de demo y se restringió CORS a `CORS_ORIGINS`. | Documentación y seguridad adicionales. CORS no impide llamadas desde clientes fuera del navegador. |
| [`841a3d0`](https://github.com/francoferrari02/studyleague-poc/commit/841a3d0) | Los tres endpoints de login comparten un límite de diez fallos por IP y usuario en cinco minutos; luego responden `429` y `Retry-After`. | Seguridad adicional. El contador está en memoria y presupone la única instancia de API de esta PoC. |
| [`ea8a705`](https://github.com/francoferrari02/studyleague-poc/commit/ea8a705) | Caddy exige Basic Auth en `/api/auth/*`; las demás rutas de la API siguen usando JWT. | Seguridad adicional. Un cliente que llame directamente al login en la nube deberá enviar también Basic Auth. |

Estas mejoras no agregan minijuegos ni cambian las reglas de puntaje. El bonus de rapidez aún usa el tiempo informado por el cliente; para un ranking competitivo real haría falta registrar el tiempo de cada respuesta en el servidor.

## Cambios del 19/11 (todavía sin commit)

| Cambio | Motivo |
| --- | --- |
| **Límite de login con la IP real y en Redis.** La API confía en `X-Forwarded-For` solo desde la red interna (`trustProxy`), y los contadores pasan a Redis: 10 fallos por IP y usuario, y 100 por IP, en 5 minutos. | Detrás de Caddy, todos los pedidos llegaban con la IP del proxy: diez fallos de cualquiera bloqueaban esa cuenta para todos. Ahora el bloqueo es por red, sobrevive a reinicios de la API y frena también a quien prueba muchas cuentas. |
| **Sesión de partida en `POST /partidas`.** `partida-nueva` devuelve una sesión firmada con las preguntas asignadas; la corrección y el registro la exigen, y no se puede cambiar una respuesta ya corregida. Solo la primera partida del día por curso suma al ranking (`cuenta_para_ranking` en el evento); las demás son de práctica. | Antes un cliente podía mandar hasta 50 respuestas elegidas, consultar las correcciones y registrar partidas perfectas sin límite. |
| **Guion de la demo en el README.** Simulador con `--alumnos 5`, puestos esperados de Tomás, reset el mismo día, ventanas separadas, partidas de práctica, día que no es de juego y sin carga en vivo. | Con `--alumnos 4` después del paso 2, Organelas quedaba en 40,0 % y no llegaba el aviso. |

## Verificación realizada

- Se comprobaron compilación y tipos de los workspaces, configuración de Docker Compose y verificaciones locales de las fases 1 y 2. La prueba de fase 1 incluyó 200 partidas sin fallos.
- `scripts/verificar-outbox-alerta.sh` comprobó que un aviso queda pendiente con la API detenida y llega una sola vez cuando vuelve.
- Se probó Caddy localmente: login sin Basic Auth `401`, con Basic Auth válida `200`, ruta de salud `200` y ruta docente con JWT `200`. También funcionó el ingreso docente desde Chrome a través del proxy.
- La auditoría de dependencias de producción local informó cero vulnerabilidades. La auditoría completa aún informa cuatro alertas altas en herramientas de desarrollo.

## Estado pendiente de la entrega

1. **Azure actualizado el 18/11 con `main` (`25e77b7`).** En la VM pasaron `scripts/verificar-outbox-alerta.sh`, `scripts/verificar-api-fase2.mjs` y el límite de logins (10 fallos y luego `429` con `Retry-After`). Caddy responde `401` sin Basic Auth en la web y en `/api/auth/login`. Después de las pruebas se restableció la demo con `scripts/demo-reset.sh`. Falta repetir en el navegador, con la clave de `catedra`, el ingreso de alumno y docente.
2. **GitHub Actions muestra una X roja por una causa externa al código.** En la [ejecución del commit `ea8a705`](https://github.com/francoferrari02/studyleague-poc/actions/runs/44213355577), GitHub indicó que el job no se inició porque la cuenta está bloqueada por un problema de facturación. Una ejecución verde requerirá resolver ese bloqueo y volver a correr el workflow.
3. **Entrega a la cátedra:** presentar el PDF final, el enlace al repositorio, la URL de Azure y la credencial de acceso por el canal correspondiente. No guardar la clave de Azure en el repositorio.

Los límites de alcance de la PoC (un broker y una VM, solo trivia completa y corrección sin sesión de partida) están en el [README](../README.md#límites-conocidos-de-la-poc). No son tareas necesarias para la entrega del 19/11.
