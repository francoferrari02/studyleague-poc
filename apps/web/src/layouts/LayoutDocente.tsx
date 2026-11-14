import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Notificaciones, rutaAviso, type Aviso, type Avisos } from "../pages/docente/Notificaciones";
import { Link, NavLink, Outlet, useParams, useSearchParams } from "react-router-dom";
import { Bell, BookOpen, ChartBar, Folder, Trophy, X } from "@phosphor-icons/react";
import { useAuth } from "../auth";
import { useDatos } from "../hooks";
import { Avatar, ErrorVista, Marca, Skeleton } from "../components/ui";
import type { CursosDocente } from "../pages/docente/datos";
export function LayoutDocente() {
  const { sesion, salir } = useAuth(); const { cursoId } = useParams();
  const { datos, error, reintentar } = useDatos<CursosDocente>("/docentes/yo/cursos", 5000);
  const [params, setParams] = useSearchParams();
  const avisos = useDatos<Avisos>("/docentes/yo/notificaciones", 5000);
  const [nueva, setNueva] = useState<Aviso | null>(null);
  const [errorLectura, setErrorLectura] = useState("");
  const vistos = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (!avisos.datos) return;
    if (vistos.current) {
      const aviso = avisos.datos.notificaciones.find(n => !n.leida && !vistos.current!.has(n.id));
      if (aviso) setNueva(aviso);
    }
    vistos.current = new Set(avisos.datos.notificaciones.map(n=>n.id));
  }, [avisos.datos]);
  function cerrarAvisos() { const copia = new URLSearchParams(params); copia.delete("notificaciones"); setParams(copia, { replace: true }); }
  async function leer(n: Aviso) {
    setNueva(null);
    if (n.leida) return;
    try { await api(`/notificaciones/${n.id}/leida`, { metodo: "PATCH" }); avisos.reintentar(); setErrorLectura(""); }
    catch(e) { setErrorLectura((e as Error).message); }
  }
  const curso = datos?.cursos.find(c=>c.id===cursoId) ?? datos?.cursos[0];
  return <div className="docente-marco"><aside className="docente-lateral"><Marca /><nav aria-label="Navegación docente"><NavLink to="/docente/cursos" end><BookOpen size={22} />Mis cursos</NavLink>{curso && <NavLink to={`/docente/cursos/${encodeURIComponent(curso.id)}/analitica`}><ChartBar size={22} />Analítica</NavLink>}<span className="nav-pendiente" title="Disponible en otra fase"><Folder size={22} />Contenido</span><span className="nav-pendiente" title="Disponible en otra fase"><Trophy size={22} />Ranking</span><Link to="/docente/cursos?notificaciones=1"><Bell size={22} />Notificaciones{(avisos.datos?.no_leidas ?? 0)>0 && <span className="contador">{avisos.datos?.no_leidas}</span>}</Link></nav><div className="docente-perfil"><Avatar nombre={datos?.docente.nombre ?? sesion?.nombre ?? "Docente"} /><div><strong>{datos?.docente.nombre ?? sesion?.nombre}</strong><div className="muted">{datos?.docente.escuela}</div></div></div><button className="salir" onClick={salir}>Cerrar sesión</button></aside><main className="docente-main"><button className="icono-boton docente-campana" aria-label={`Notificaciones, ${avisos.datos?.no_leidas ?? 0} sin leer`} onClick={()=>params.has("notificaciones") ? cerrarAvisos() : setParams(p=>{const copia = new URLSearchParams(p); copia.set("notificaciones","1"); return copia;})}><Bell size={22} />{(avisos.datos?.no_leidas ?? 0)>0 && <span className="contador">{avisos.datos?.no_leidas}</span>}</button>{error && <ErrorVista error={error} reintentar={reintentar} />}{datos ? <Outlet context={datos} /> : !error && <Skeleton />}{params.has("notificaciones") && <Notificaciones datos={avisos.datos} error={avisos.error || errorLectura} cerrar={cerrarAvisos} leer={n=>void leer(n)} reintentar={avisos.reintentar} />}{nueva && <div className="notificacion-toast" role="status"><Link to={rutaAviso(nueva)} onClick={()=>void leer(nueva)}><strong>{nueva.mensaje}</strong><span>Tocá para ver el detalle</span></Link><button aria-label="Cerrar aviso nuevo" onClick={()=>setNueva(null)}><X size={18} /></button></div>}</main></div>;
}
