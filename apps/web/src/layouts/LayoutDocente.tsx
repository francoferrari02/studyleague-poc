import { NavLink, Outlet } from "react-router-dom";
import { Bell, BookOpen, ChartBar } from "@phosphor-icons/react";
import { useAuth } from "../auth";
import { Avatar, Marca } from "../components/ui";
export function LayoutDocente() {
  const { sesion, salir } = useAuth();
  return <div className="docente-marco"><aside className="docente-lateral"><Marca /><nav aria-label="Navegación docente"><NavLink to="/docente/cursos" end><BookOpen size={22} />Mis cursos</NavLink><NavLink to="/docente/cursos?notificaciones=1"><Bell size={22} />Notificaciones</NavLink></nav><div className="docente-perfil"><Avatar nombre={sesion?.nombre ?? "Docente"} /><div><strong>{sesion?.nombre}</strong><div className="muted">Escuela N.º 12 Manuel Belgrano</div></div></div><button className="salir" onClick={salir}>Cerrar sesión</button></aside><main className="docente-main"><Outlet /></main></div>;
}
