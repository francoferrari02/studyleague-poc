import { NavLink, Outlet } from "react-router-dom";
import { Bell, BookOpen, ChartBar, Ranking, Stack } from "@phosphor-icons/react";

/** Barra lateral de 240 px (Mis cursos, Analítica, Contenido, Ranking, Notificaciones). */
export function LayoutDocente() {
  // TODO(PoC): tomar el curso seleccionado del estado en lugar de fijarlo.
  const curso = "bio-2b";
  const item = ({ isActive }: { isActive: boolean }) => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    textDecoration: "none",
    color: isActive ? "var(--violeta)" : "var(--texto)",
    background: isActive ? "var(--violeta-suave)" : "transparent",
    fontWeight: 500,
  });

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "var(--fuente-docente)", fontSize: 14 }}>
      <aside
        style={{
          width: 240,
          background: "var(--superficie)",
          borderRight: "1px solid var(--borde)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ fontFamily: "var(--fuente-titulo)", fontSize: 22, marginBottom: 24 }}>
          Study<span style={{ color: "var(--violeta)" }}>League</span>
        </div>
        <NavLink to="/docente/cursos" end style={item}>
          <Stack size={20} /> Mis cursos
        </NavLink>
        <NavLink to={`/docente/cursos/${curso}/analitica`} style={item}>
          <ChartBar size={20} /> Analítica
        </NavLink>
        <NavLink to={`/docente/cursos/${curso}/contenido`} style={item}>
          <BookOpen size={20} /> Contenido
        </NavLink>
        <NavLink to={`/docente/cursos/${curso}/ranking`} style={item}>
          <Ranking size={20} /> Ranking
        </NavLink>
        <NavLink to="/docente/cursos?notificaciones=1" style={item}>
          <Bell size={20} /> Notificaciones
        </NavLink>
        <div style={{ marginTop: "auto", color: "var(--texto-secundario)" }}>Prof. Laura Gómez</div>
      </aside>
      <main style={{ flex: 1, background: "var(--fondo-docente)", padding: 32 }}>
        <Outlet />
      </main>
    </div>
  );
}
