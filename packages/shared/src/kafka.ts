import { KafkaJS } from "@confluentinc/kafka-javascript";
import type { Evento } from "./events.js";
import type { TopicName } from "./topics.js";

const { Kafka, logLevel } = KafkaJS;

function brokers(): string[] {
  return (process.env.KAFKA_BROKERS ?? "localhost:9094").split(",").map((b) => b.trim());
}

function cliente(clientId: string) {
  return new Kafka({ kafkaJS: { clientId, brokers: brokers(), logLevel: logLevel.WARN } });
}

/** Productor idempotente: el broker descarta los reenvíos del propio productor. */
export async function crearProductor(clientId: string) {
  const producer = cliente(clientId).producer({ kafkaJS: { idempotent: true, acks: -1 } });
  await producer.connect();

  return {
    /** Publica un evento. La clave decide la partición: misma clave, mismo orden. */
    async publicar(topic: TopicName, clave: string, evento: Evento) {
      await producer.send({
        topic,
        messages: [{ key: clave, value: JSON.stringify(evento) }],
      });
    },
    /** Manda a la dead letter queue un mensaje que no cumple el contrato. */
    async enviarADlq(topic: TopicName, clave: string, valor: unknown, motivo: string) {
      await producer.send({
        topic,
        messages: [{ key: clave, value: JSON.stringify({ motivo, valor }) }],
      });
    },
    desconectar: () => producer.disconnect(),
  };
}

export interface MensajeRecibido {
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  value: unknown;
}

/**
 * Crea un consumidor dentro de un grupo. Cada grupo lee todos los eventos;
 * dentro del grupo, las particiones se reparten entre instancias.
 */
export async function crearConsumidor(opciones: {
  clientId: string;
  groupId: string;
  topics: TopicName[];
  alRecibir: (mensaje: MensajeRecibido) => Promise<void>;
}) {
  const consumer = cliente(opciones.clientId).consumer({
    kafkaJS: { groupId: opciones.groupId, fromBeginning: true },
  });
  await consumer.connect();
  await consumer.subscribe({ topics: opciones.topics });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const texto = message.value?.toString() ?? "null";
      let value: unknown;
      try {
        value = JSON.parse(texto);
      } catch {
        value = texto;
      }
      await opciones.alRecibir({
        topic,
        partition,
        offset: message.offset,
        key: message.key?.toString() ?? null,
        value,
      });
    },
  });

  const cerrar = async () => {
    await consumer.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", cerrar);
  process.on("SIGINT", cerrar);

  return consumer;
}
