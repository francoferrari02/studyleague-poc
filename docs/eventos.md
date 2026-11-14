# Contratos de eventos

Los tipos están en `packages/shared/src/events.ts`. Los eventos llevan solo identificadores (nunca nombres ni datos personales, porque los usuarios son menores).

## Tópicos

| Tópico | Particiones | Clave | Productor | Consumidores (grupos) |
| --- | --- | --- | --- | --- |
| `partida.finalizada` | `PARTIDA_PARTICIONES` (3) | `curso_id` | api | ranking, rachas, analitica |
| `concepto.bajo_dominio` | 1 | `curso_id` | analitica-consumer | notificaciones |
| `partida.finalizada.dlq` | 1 | la del mensaje original | consumidores | (inspección manual en Kafka UI) |

Retención: `RETENCION_HORAS` (168 h = 7 días). La auto-creación de tópicos está desactivada; los crea `kafka-init`.

## partida.finalizada

```json
{
  "event_id": "5f0c7a1e-2b0a-4f3e-9a51-8f2a0f1d6c11",
  "tipo": "partida.finalizada",
  "version": 1,
  "ocurrido_en": "2026-11-18T14:05:12.345Z",
  "partida_id": "b1e5d0a2-7c39-4d8e-8e0b-3a6f6f2d9a77",
  "curso_id": "bio-2b",
  "alumno_id": "alu-01",
  "minijuego": "trivia",
  "puntaje": 820,
  "respuestas": [
    { "pregunta_id": "mitosis-p1", "concepto_id": "mitosis", "correcta": false, "tiempo_ms": 6400 }
  ]
}
```

## concepto.bajo_dominio

Se publica cuando un concepto suma 10 respuestas o más (`BAJO_DOMINIO_MIN_RESPUESTAS`) con menos del 40 % de aciertos (`BAJO_DOMINIO_UMBRAL`), una sola vez por concepto y curso.

```json
{
  "event_id": "0a9d3c6e-1f4b-4b7a-9d2e-6c1b5e8f7a33",
  "tipo": "concepto.bajo_dominio",
  "version": 1,
  "ocurrido_en": "2026-11-18T14:05:13.010Z",
  "curso_id": "bio-2b",
  "concepto_id": "mitosis",
  "respuestas_totales": 18,
  "aciertos": 6,
  "porcentaje_aciertos": 0.34
}
```

## Garantías

- **Orden:** solo dentro de una partición. Como la clave es `curso_id`, las partidas de un curso se procesan en orden.
- **Entrega al menos una vez:** un evento puede llegar repetido. Cada consumidor guarda los `event_id` ya procesados (Redis con `SET NX` o la tabla `eventos_procesados`) y descarta los repetidos.
- **Cambios de contrato:** agregar campos opcionales no rompe a nadie; un cambio incompatible sube `version`.
