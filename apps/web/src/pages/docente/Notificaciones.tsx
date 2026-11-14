import { Link } from "react-router-dom";
import { Warning, X } from "@phosphor-icons/react";
import { ErrorVista } from "../../components/ui";
export interface Aviso { id: number; curso_id: string; concepto_id: string; mensaje: string; leida: boolean; creada_en: string }
export interface Avisos { no_leidas: number; notificaciones: Aviso[] }
export const rutaAviso = (n: Aviso) => `/docente/cursos/${encodeURIComponent(n.curso_id)}/conceptos/${encodeURIComponent(n.concepto_id)}`;
export function Notificaciones({ datos, error, cerrar, leer, reintentar }: { datos: Avisos | null; error: string; cerrar: () => void; leer: (n: Aviso) => void; reintentar: () => void }) {
  return <section className="notificaciones-panel" aria-labelledby="titulo-notificaciones"><header className="fila entre"><h2 id="titulo-notificaciones">Notificaciones</h2><span>{datos?.no_leidas ?? 0} sin leer</span><button className="icono-boton" onClick={cerrar} aria-label="Cerrar notificaciones"><X size={18} /></button></header>{error && <ErrorVista error={error} reintentar={reintentar} />}{datos ? datos.notificaciones.map(n=><Link key={n.id} className={`aviso ${n.leida ? "leido" : "nuevo"}`} to={rutaAviso(n)} onClick={()=>leer(n)}><span className="aviso-icono"><Warning size={20} /></span><span className="aviso-texto"><strong>{n.mensaje}</strong><small>{new Date(n.creada_en).toLocaleString("es-AR",{dateStyle:"short",timeStyle:"short"})}</small><span className="enlace">Ver detalle</span></span>{!n.leida && <span className="aviso-nueva">Nueva</span>}</Link>) : <p className="vacio">Cargando avisos…</p>}<p className="vacio">{datos?.notificaciones.length ? "No tenés más notificaciones" : "No tenés notificaciones"}</p></section>;
}
