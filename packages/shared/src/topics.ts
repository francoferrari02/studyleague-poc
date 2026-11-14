/**
 * Nombres de los tópicos de Kafka. Los crea el servicio kafka-init
 * (infra/kafka/create-topics.sh); la auto-creación está desactivada para
 * controlar la cantidad de particiones.
 */
export const TOPICS = {
  /** Lo publica la API cuando un alumno termina una partida. Clave: curso_id. */
  PARTIDA_FINALIZADA: "partida.finalizada",
  /** Lo publica analitica-consumer cuando un concepto cae bajo el umbral. Clave: curso_id. */
  CONCEPTO_BAJO_DOMINIO: "concepto.bajo_dominio",
  /** Eventos que un consumidor no pudo procesar tras reintentar (dead letter queue). */
  PARTIDA_FINALIZADA_DLQ: "partida.finalizada.dlq",
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

/** Grupos de consumidores: cada grupo recibe todos los eventos (publish-subscribe). */
export const CONSUMER_GROUPS = {
  RANKING: "ranking",
  RACHAS: "rachas",
  ANALITICA: "analitica",
  NOTIFICACIONES: "notificaciones",
} as const;
