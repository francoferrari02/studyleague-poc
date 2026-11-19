/**
 * Sesión de partida: la arma el servidor al repartir las preguntas (GET /cursos/:id/partida-nueva)
 * y el cliente la devuelve al corregir cada pregunta y al registrar la partida (POST /partidas).
 *
 * Es un texto firmado con HMAC (no un JWT de login: no sirve como token de acceso). Fija quién juega,
 * en qué curso, con qué preguntas y si la partida suma al ranking, así el cliente no puede:
 *  - elegir sus preguntas ni mandar más de las asignadas;
 *  - cambiar una respuesta después de ver la corrección (eso se guarda en Redis, ver abajo);
 *  - sumar al ranking más de una partida por día y curso.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Minijuego } from "@studyleague/shared";
import { config } from "./config.js";

export interface SesionPartida {
  partida_id: string;
  alumno_id: string;
  curso_id: string;
  minijuego: Minijuego;
  preguntas: string[];
  /** Solo la primera partida que el alumno empieza en el día (hora de Argentina) en el curso suma al ranking. */
  cuenta_para_ranking: boolean;
  /** Vencimiento, en milisegundos desde 1970. */
  vence: number;
}

/** Tiempo para terminar la partida: una trivia dura ~3 minutos; se deja margen por cortes de conexión. */
export const DURACION_SESION_MS = 2 * 3600_000;

// Clave propia, derivada del secreto de la API: una firma de sesión no vale como JWT ni al revés.
const clave = createHash("sha256").update(`${config.jwtSecret}:sesion-partida`).digest();
const firmar = (datos: string) => createHmac("sha256", clave).update(datos).digest("base64url");

export function crearSesion(datos: Omit<SesionPartida, "vence">): string {
  const contenido: SesionPartida = { ...datos, vence: Date.now() + DURACION_SESION_MS };
  const cuerpo = Buffer.from(JSON.stringify(contenido)).toString("base64url");
  return `${cuerpo}.${firmar(cuerpo)}`;
}

/** La sesión si la firma es válida (aunque esté vencida: quien llama decide), o null. */
export function leerSesion(sesion: string): (SesionPartida & { vencida: boolean }) | null {
  const [cuerpo, firma, ...resto] = sesion.split(".");
  if (!cuerpo || !firma || resto.length) return null;
  const esperada = Buffer.from(firmar(cuerpo));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString()) as SesionPartida;
    return { ...datos, vencida: Date.now() > datos.vence };
  } catch {
    return null;
  }
}

/** Redis: marca de "ya empezó una partida que suma al ranking hoy en este curso". */
export const clavePartidaDelDia = (cursoId: string, alumnoId: string, fecha: string) => `partida_del_dia:${cursoId}:${alumnoId}:${fecha}`;
/** Redis (hash pregunta → respuesta en JSON): la primera respuesta corregida de cada pregunta de la partida. */
export const claveRespuestasCorregidas = (partidaId: string) => `corregidas:${partidaId}`;
