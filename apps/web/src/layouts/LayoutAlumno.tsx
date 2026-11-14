import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ChartLineUp, House, Trophy } from "@phosphor-icons/react";
export function LayoutAlumno() {
  const { pathname } = useLocation();
  const nav = ["/alumno", "/alumno/ranking", "/alumno/progreso"].includes(pathname);
  return <div className="alumno-exterior"><div className="alumno-marco"><main className="alumno-main"><Outlet /></main>{nav && <nav className="alumno-nav" aria-label="Navegación del alumno"><NavLink to="/alumno" end><House size={24} weight="fill" />Inicio</NavLink><NavLink to="/alumno/ranking"><Trophy size={24} weight="fill" />Ranking</NavLink><NavLink to="/alumno/progreso"><ChartLineUp size={24} weight="fill" />Mi progreso</NavLink></nav>}</div></div>;
}
