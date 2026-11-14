# Informe de Fase 2 (en curso)

## Tareas y verificaciones

| Tarea | Estado | Commit |
| --- | --- | --- |
| R1 | Verificado con Redis: Tomás 7º/1270 → 4º/2090; restaurado 7º | `R1: corregir el ranking inicial y verificar los puestos de Tomás` |

R1: `npm run build`, `docker compose config -q` y `bash scripts/verificar-seed.sh` terminaron con código 0 (Node 22.12.0). El script comprueba ZREVRANK y ZSCORE en ambos estados.

Se exportó el submódulo puro `@studyleague/shared/ranking` para que el seed no cargue el cliente nativo de Kafka innecesariamente. En el host ese binario había sido compilado para Node 20 y fallaba bajo Node 22. El seed ahora funciona sin recompilar Kafka ni escribir fuera del proyecto.

Los 29 frames se extrajeron a `.tmp-mockups/`, ignorada por Git; son bundles anidados y se leyó su template JSON interno para obtener HTML/CSS reales. Se eliminará la carpeta al cerrar la fase.

## Decisiones confirmadas

- D1 es Ingreso docente y D2 es Mis cursos en el plan, mapa de rutas y frames; la consigna describe otras funciones para esos códigos.
- D6 muestra Mitosis 34%/18 respuestas, Organelas 47%/31, Membrana celular 55%/39, Fotosíntesis 68%/47 y Célula 82%/52. Varias combinaciones no corresponden a porcentajes redondeados de aciertos enteros. La consigna pide unas 18 respuestas por concepto. Se consultó cómo reconciliar los datos antes de R2.

R2: contadores acordados: Célula 42/51, Fotosíntesis 32/47, Membrana 21/38, Organelas 14/30, Mitosis 6/18. Mitosis conserva alerta enviada y notificación; el frontend calculará todos los porcentajes. D7 muestra 18 respuestas: se conserva ese conteo y se acepta 33 % en vez de 34 %.

Navegación verificada en el HTML: D2 → D6 desde la tarjeta de Biología o Analítica; D6 → D7 desde Ver detalle. D3 = Crear curso; D4 = Curso creado (modal y código); D5 = Cargar contenido. D3–D5 quedan fuera de la implementación de esta fase. No se agrega una pantalla de resumen.

R2 verificado: dos ejecuciones consecutivas de `npm run demo:reset` terminaron en código 0 con exactamente cinco agregados y una notificación de Mitosis; Tomás volvió a 1270/7º. Build y Compose válidos.

R3 verificado con Docker: antes del cambio `/health` y login fallaron tras reiniciar la API con Kafka detenido; después, salud/login OK y tres partidas 202 pendientes. Al iniciar Kafka el outbox se drenó en aproximadamente 4 s. `npm run build` y `docker compose config -q` verdes. Productor diferido, publicaciones secuenciales y backoff 200–5000 ms. Corregido comentario de idempotencia Lua.
