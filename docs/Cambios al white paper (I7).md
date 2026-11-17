# Cambios al white paper (I7)

Lista de cambios al **borrador v2** del white paper para que refleje lo que la PoC ya construyó y midió. Está ordenada por sección del documento. Cada punto dice qué cambiar y, cuando hace falta, propone un texto. Los números salen de [mediciones-nube.json](mediciones-nube.json).

**Entrega:** jueves 19/11. **Límite:** 5 páginas, sin contar portada, índice y anexos.

## 0. Antes de empezar: el límite de páginas

Hoy el cuerpo (Introducción a Conclusión) ocupa **exactamente 5 páginas**, de la 3 a la 7. Este documento pide agregar una sección de resultados con una tabla (punto 7.1), así que **hay que recortar más o menos lo mismo que se agrega**. Candidatos:

- **Sección 1:** la cita del Cirujano General y la frase de UNESCO sobre recuperar la concentración. Alcanzan los datos de Kids Online y PISA.
- **Sección 4:** el ejemplo de las plataformas de streaming.
- **Sección 6.1:** el punto de KRaft se puede reducir a media línea.
- **Sección 7:** los «No riesgos» se pueden reducir a una oración.

Si las referencias cuentan dentro de las 5 páginas, hay que confirmarlo con la cátedra. Hoy empiezan en la página 8.

## Portada

- Agregar **Instituto Tecnológico de Buenos Aires (ITBA)** arriba de «Trabajo Práctico Integrador Final».
- Agregar, debajo de los integrantes o en la introducción:
  - **Repositorio:** https://github.com/francoferrari02/studyleague-poc (antes de entregar, confirmar que la cátedra tiene acceso: hoy el repo es privado).
  - **Versión desplegada:** https://studyleague-959617.chilecentral.cloudapp.azure.com (usuario `catedra`; la clave se entrega por separado).

## Introducción

Sumar al final una oración con el resultado, porque es lo primero que se lee:

> La prueba de concepto, desplegada en la nube, procesó 1.000 partidas en 60 segundos sin errores, con el ranking actualizado en 34 ms en el 95 % de los casos, y reconstruyó la analítica completa releyendo el historial de Kafka.

## 3. Necesidades del negocio (ASR)

- Cambiar «Los números son supuestos que la prueba de concepto permite medir» por:
  > Los números son supuestos del negocio. La sección 7 muestra cómo se midieron en la prueba de concepto.
- Para el escenario de performance, dejar claro qué mide el SLI y usar siempre la misma definición:
  > desde que la API registra la partida hasta que el ranking la refleja.

## 5. Alternativas evaluadas

En el párrafo «Elección», después de «la analítica se recupera de una caída y además se puede recalcular», agregar la evidencia:

> En la prueba de concepto, borrar la analítica y releer los 4.000 eventos retenidos la reconstruyó idéntica en 36 segundos (sección 7).

## 6. Apache Kafka y la prueba de concepto

**6.2 y la Figura 1.**
- La figura incluye `rachas-consumer`. **Ya está implementado** (C3), así que la figura queda bien.
- Mencionar que las rachas también se guardan en Redis.

**Persistencia.** Cambiar «Redis (clave/valor) guarda el ranking» por «guarda el ranking y las rachas».

**Agregar el outbox,** que hoy aparece solo como mitigación de un riesgo y ya está implementado. Una oración alcanza:

> La API guarda la partida y su evento en la misma transacción (patrón *transactional outbox*). Un publicador los envía a Kafka y reintenta hasta que se confirman: si Kafka está caído, el alumno puede seguir jugando.

**Último párrafo.** Cambiar «se despliega igual en una máquina virtual en la nube» por:

> se despliega igual en una máquina virtual de Azure (2 vCPU, 4 GB de RAM), detrás de un proxy con HTTPS y credenciales.

**Datos que conviene nombrar, si entran:**
- Kafka 4.1 en modo KRaft, con un broker.
- El tópico `partida.finalizada` tiene 3 particiones, la clave es `curso_id` y la retención es de 7 días.

## 7. Evaluación de la arquitectura

### 7.1 Nueva subsección: resultados de la prueba de concepto

Es lo más importante que falta: hoy la sección 7 analiza, pero no muestra ninguna medición. Va al principio de la sección 7 o justo antes de «Riesgos».

> **Resultados.** Se midió en la máquina virtual de Azure con el simulador incluido en el repositorio (`scripts/medir-carga.sh`), que juega partidas como alumnos reales. Como el simulador corre en la misma máquina, los resultados son conservadores.

| Escenario (ASR) | Objetivo | Resultado medido |
| --- | --- | --- |
| Picos: 1.000 partidas en 60 s | Ninguna rechazada ni perdida | 1.000 de 1.000, sin errores |
| Ranking en segundos | p95 < 3 s | p50 16 ms · **p95 34 ms** · máximo 230 ms |
| Analítica sin pérdida | Todas procesadas | 1.000 guardadas y 1.000 procesadas; outbox vacío |
| Margen: 3.000 partidas en 60 s | — | Sin errores · p95 52 ms |
| Reproceso: borrar la analítica y releer el historial | Resultado idéntico | 4.000 eventos en 36 s; idéntica; sin avisos duplicados |
| Confiabilidad: analítica caída durante 1.000 partidas | Al volver, procesa todo lo pendiente | 1.000 de 1.000 procesadas en 23 s |

Una oración de interpretación debajo de la tabla:

> El objetivo de latencia se cumple con dos órdenes de magnitud de margen, y el sistema soportó el triple del pico supuesto en una máquina chica. El reproceso confirma el motivo de elegir Kafka: la analítica se reconstruye sin que los alumnos vuelvan a jugar.

**Recuperación de la analítica (ya medida).** Con `analitica-consumer` detenido se jugaron 1.000 partidas. Al reiniciarlo, procesó las 1.000 pendientes en 23 s. Es una cota superior, porque el lag se consulta cada pocos segundos.

**Arranque en frío.** Si la carga llega minutos después de prender la VM, la latencia sube: p95 de 852 ms y máximo de 4,2 s. Sigue dentro del SLO en el p95, pero el máximo lo supera. Con el sistema caliente vuelve a 29 ms. Dos consecuencias:
- En el documento conviene mencionarlo como observación honesta.
- **Para la demo, prender la VM con tiempo, no justo antes.**

### Árbol de utilidad
Sin cambios. Opcionalmente, agregar «(medido: p95 34 ms)» después del SLO.

### Riesgos
- **Segundo riesgo** (guardar y después publicar): ya está **resuelto** con el outbox. Cambiar el tiempo verbal: «Se mitiga…» por «Se resolvió guardando el evento en la misma transacción que la partida (outbox) y publicándolo con reintentos. Se verificó deteniendo Kafka: las partidas se guardan igual y se publican al volver».
- **Tercer riesgo** (falta de experiencia): agregar que se redujo construyendo y midiendo la PoC.
- **Riesgo nuevo, si entra:** una sola máquina virtual. Todo comparte 2 vCPU, y Kafka es el proceso más pesado: unos 630 MiB de memoria y la mayor parte de la CPU en el pico.

### Supuestos
Al final, agregar: «El pico de 1.000 partidas en 60 s se verificó (ver Resultados)».

### Limitación conocida (si entra)
El endpoint que muestra la corrección de una pregunta no tiene estado: un alumno autenticado puede consultar respuestas sin haber jugado. Se mitigaría con una sesión de partida en el servidor. Mejor declararlo que esperar a que lo pregunten en la defensa.

## 8. Conclusión

Reemplazar el final («…a cambio de una operación más compleja que se valida con la prueba de concepto») por:

> …a cambio de una operación más compleja. La prueba de concepto lo confirmó en la nube: 1.000 partidas en un minuto sin pérdidas, el ranking actualizado en milisegundos y la analítica reconstruida desde el historial de eventos.

## Anexos

**Anexo B, título.** Sacar «(PROPUESTAS)»: las vistas ya describen lo construido.

**Anexo B, vista de desarrollo.** Precisarla así:

> Un repositorio (monorepo con npm workspaces, TypeScript) con un paquete compartido de contratos de eventos (`packages/shared`), la API, los cuatro consumidores, la web en React y un `docker-compose.yml` que levanta todo.

**Anexo B, vista física.** Hoy dice que solo se exponen la API y la interfaz de monitoreo, y no es así. Reemplazar por:

> Una máquina virtual de Azure (Ubuntu 24.04, 2 vCPU, 4 GB) corre Docker con un contenedor por servicio. Solo el proxy Caddy expone los puertos 80 y 443, con HTTPS automático. Detrás del proxy están la web, la API (`/api`), Swagger y la interfaz de Kafka. El acceso tiene dos niveles: usuario y clave del proxy para el entorno, y tokens JWT para la API. Kafka, PostgreSQL y Redis quedan en la red interna.

**Anexo C.** Sin cambios: los cuatro criterios coinciden con lo implementado. La trivia tiene 10 preguntas y el umbral es de 10 respuestas con menos del 40 %. Opcionalmente, al final de cada criterio, agregar cómo se verifica: prueba 2, 4, 5 o 3 del README.

## Revisión final

- [ ] Saltos de página manuales antes del Índice, de Referencias y del Anexo A.
- [ ] El cuerpo no pasa de 5 páginas.
- [ ] Todas las cifras coinciden con [mediciones-nube.json](mediciones-nube.json) y con el README.
- [ ] El link al repo funciona para la cátedra (repo público o docentes invitados).
- [ ] La clave de `catedra` **no** aparece en el documento.
