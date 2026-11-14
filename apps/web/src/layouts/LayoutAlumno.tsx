import { NavLink, Outlet } from "react-router-dom";
import { ChartLineUp, House, Trophy } from "@phosphor-icons/react";

/** Marco móvil de 390 px con la barra inferior de 3 ítems (Inicio, Ranking, Mi progreso). */
export function LayoutAlumno() {
  const item = ({ isActive }: { isActive: boolean }) => ({
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 4,
    fontSize: 14,
    textDecoration: "none",
    color: isActive ? "var(--violeta)" : "var(--texto-secundario)",
  });

  return (
    <div style={{ minHeight: "100vh", background: "#e9e6f7", display: "flex", justifyContent: "center" }}>
      <div
        style={{
          width: "100%",
          maxWidth: 390,
          minHeight: "100vh",
          background: "var(--fondo-alumno)",
          fontFamily: "var(--fuente-alumno)",
          fontSize: 16,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <main style={{ flex: 1, padding: 20 }}>
          <Outlet />
        </main>
        <nav
          style={{
            display: "flex",
            justifyContent: "space-around",
            padding: "12px 0 20px",
            background: "var(--superficie)",
            borderTop: "1px solid var(--borde)",
          }}
        >
          <NavLink to="/alumno" end style={item}>
            <House size={24} weight="fill" /> Inicio
          </NavLink>
          <NavLink to="/alumno/ranking" style={item}>
            <Trophy size={24} weight="fill" /> Ranking
          </NavLink>
          <NavLink to="/alumno/progreso" style={item}>
            <ChartLineUp size={24} weight="fill" /> Mi progreso
          </NavLink>
        </nav>
      </div>
    </div>
  );
}
