/**
 * notificaciones-consumer (grupo "notificaciones")
 * Recibe concepto.bajo_dominio y crea el aviso para el docente del curso
 * (pantalla D8: campana con contador y toast).
 */
import pg from "pg";
import { CONSUMER_GROUPS, TOPICS, crearConsumidor, log } from "@studyleague/shared";

const SERVICIO = "notificaciones-consumer";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await crearConsumidor({
  clientId: SERVICIO,
  groupId: CONSUMER_GROUPS.NOTIFICACIONES,
  topics: [TOPICS.CONCEPTO_BAJO_DOMINIO],
  async alRecibir(mensaje) {
    // TODO(PoC): buscar el docente del curso e insertar en notificaciones
    // (ON CONFLICT (event_id) DO NOTHING para no duplicar el aviso).
    void db;
    log(SERVICIO, "aviso de bajo dominio recibido", { evento: mensaje.value });
  },
});

log(SERVICIO, "escuchando", { topic: TOPICS.CONCEPTO_BAJO_DOMINIO });
