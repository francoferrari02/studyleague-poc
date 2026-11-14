import { Analitica } from "./pages/docente/Analitica";
import { Cursos } from "./pages/docente/Cursos";
import { Ranking } from "./pages/alumno/Ranking";
import { Resultado } from "./pages/alumno/Resultado";
import { AntesDeJugar, Trivia } from "./pages/alumno/Trivia";
import { Inicio } from "./pages/alumno/Inicio";
import { Ingreso } from "./pages-login";
import { Protegida } from "./auth";
import { Componentes } from "./components/ui";
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
      <Route path="/alumno/ingreso" element={<Ingreso />} />
      <Route path="/docente/ingreso" element={<Ingreso docente />} />
      <Route element={<Protegida rol="alumno" />}><Route element={<LayoutAlumno />}>
        <Route path="/alumno" element={<Inicio />} />
        <Route path="/alumno/jugar" element={<AntesDeJugar />} />
        <Route path="/alumno/partida" element={<Trivia />} />
        <Route path="/alumno/resultado" element={<Resultado />} />
        <Route path="/alumno/ranking" element={<Ranking />} />
        {PANTALLAS.filter((p) => p.rol === "alumno" && !p.ruta.endsWith("ingreso") && !["/alumno", "/alumno/jugar", "/alumno/partida", "/alumno/resultado", "/alumno/ranking"].includes(p.ruta)).map((p) => (
          <Route key={p.ruta} path={p.ruta} element={<Marcador pantalla={p} />} />
        ))}
      </Route>
      </Route><Route element={<Protegida rol="docente" />}><Route element={<LayoutDocente />}>
        <Route path="/docente/cursos" element={<Cursos />} />
        <Route path="/docente/cursos/:cursoId/analitica" element={<Analitica />} />
        {PANTALLAS.filter((p) => p.rol === "docente" && !p.ruta.endsWith("ingreso") && !["/docente/cursos", "/docente/cursos/:cursoId/analitica"].includes(p.ruta)).map((p) => (
          <Route key={p.ruta} path={p.ruta} element={<Marcador pantalla={p} />} />
        ))}
      </Route>
      </Route>
      {import.meta.env.DEV && <Route path="/componentes" element={<Componentes />} />}
    </Routes>
  );
}
