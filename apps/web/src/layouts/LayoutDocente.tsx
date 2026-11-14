import { NavLink, Outlet, useParams } from "react-router-dom";
import { Bell, BookOpen, ChartBar, Folder, Trophy } from "@phosphor-icons/react";
import { useAuth } from "../auth";
import { useDatos } from "../hooks";
import { Avatar, ErrorVista, Marca, Skeleton } from "../components/ui";
import type { CursosDocente } from "../pages/docente/datos";
export function LayoutDocente() {
  const { sesion, salir } = useAuth(); const { cursoId } = useParams();
  const { datos, error, reintentar } = useDatos<CursosDocente>("/docentes/yo/cursos", 5000);
  const curso = datos?.cursos.find(c=>c.id===cursoId) ?? datos?.cursos[0];
  return <div className="docente-marco"><aside className="docente-lateral"><Marca /><nav aria-label="Navegación docente"><NavLink to="/docente/cursos" end><BookOpen size={22} />Mis cursos</NavLink>{curso && <NavLink to={`/docente/cursos/${encodeURIComponent(curso.id)}/analitica`}><ChartBar size={22} />Analítica</NavLink>}<span className="nav-pendiente" title="Disponible en otra fase"><Folder size={22} />Contenido</span><span className="nav-pendiente" title="Disponible en otra fase"><Trophy size={22} />Ranking</span><NavLink to="/docente/cursos?notificaciones=1"><Bell size={22} />Notificaciones</NavLink></nav><div className="docente-perfil"><Avatar nombre={datos?.docente.nombre ?? sesion?.nombre ?? "Docente"} /><div><strong>{datos?.docente.nombre ?? sesion?.nombre}</strong><div className="muted">{datos?.docente.escuela}</div></div></div><button className="salir" onClick={salir}>Cerrar sesión</button></aside><main className="docente-main">{error && <ErrorVista error={error} reintentar={reintentar} />}{datos ? <Outlet context={datos} /> : !error && <Skeleton />}</main></div>;
}
