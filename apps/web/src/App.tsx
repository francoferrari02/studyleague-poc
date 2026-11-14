import { Link, Route, Routes } from "react-router-dom";
import { PANTALLAS } from "./pantallas";
import { LayoutAlumno } from "./layouts/LayoutAlumno";
import { LayoutDocente } from "./layouts/LayoutDocente";
import { Marcador } from "./components/Marcador";

/** Portada de la demo: elegir qué experiencia abrir. */
function Portada() {
  return (
    <main style={{ fontFamily: "var(--fuente-docente)", padding: 48, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--fuente-titulo)" }}>
        Study<span style={{ color: "var(--violeta)" }}>League</span>
      </h1>
      <p>Prueba de concepto. Elegí la experiencia:</p>
      <ul>
        <li>
          <Link to="/alumno">App del alumno</Link>
        </li>
        <li>
          <Link to="/docente/cursos">Web del docente</Link>
        </li>
      </ul>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Portada />} />
      <Route element={<LayoutAlumno />}>
        {PANTALLAS.filter((p) => p.rol === "alumno").map((p) => (
          <Route key={p.ruta} path={p.ruta} element={<Marcador pantalla={p} />} />
        ))}
      </Route>
      <Route element={<LayoutDocente />}>
        {PANTALLAS.filter((p) => p.rol === "docente").map((p) => (
          <Route key={p.ruta} path={p.ruta} element={<Marcador pantalla={p} />} />
        ))}
      </Route>
    </Routes>
  );
}
