import { Link } from "react-router-dom";
import { ArrowRight, ChalkboardTeacher, Student } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Marca } from "../components/ui";

type Experiencia = {
  ruta: string;
  icono: Icon;
  rol: string;
  titulo: string;
  descripcion: string;
  usuario: string;
  clave: string;
};

const EXPERIENCIAS: Experiencia[] = [
  {
    ruta: "/alumno/ingreso",
    icono: Student,
    rol: "Alumno",
    titulo: "App del alumno",
    descripcion: "Jugá la trivia del día, sumá puntos y mirá cómo cambia tu puesto en el ranking del curso.",
    usuario: "tomas",
    clave: "alumno123",
  },
  {
    ruta: "/docente/ingreso",
    icono: ChalkboardTeacher,
    rol: "Docente",
    titulo: "Web del docente",
    descripcion: "Mirá el dominio de cada concepto en tus cursos y recibí avisos cuando un tema queda flojo.",
    usuario: "laura.gomez",
    clave: "docente123",
  },
];

/** Portada de la demo: elegir qué experiencia abrir. */
export function Portada() {
  return (
    <div className="portada">
      <header className="portada-encabezado">
        <Marca />
        <span className="chip tono-violeta">Prueba de concepto</span>
      </header>

      <main className="portada-contenido">
        <section className="portada-intro">
          <h1>Aprender jugando, en liga con tu curso</h1>
          <p className="muted">
            Los alumnos juegan minijuegos de repaso y compiten en un ranking semanal. El docente ve en vivo qué
            conceptos entendió el curso y cuáles hay que reforzar.
          </p>
        </section>

        <div className="portada-opciones">
          {EXPERIENCIAS.map(({ ruta, icono: Icono, rol, titulo, descripcion, usuario, clave }) => (
            <Link key={ruta} to={ruta} className="portada-opcion">
              <span className="portada-icono" aria-hidden="true">
                <Icono size={32} weight="duotone" />
              </span>
              <span className="portada-rol">{rol}</span>
              <strong className="portada-titulo">{titulo}</strong>
              <span className="muted">{descripcion}</span>
              <span className="portada-prueba">
                Usuario de prueba: <code>{usuario}</code> · <code>{clave}</code>
              </span>
              <span className="portada-accion">
                Entrar <ArrowRight size={18} weight="bold" />
              </span>
            </Link>
          ))}
        </div>
      </main>

      <footer className="portada-pie muted">TP Integrador Final · Ingeniería de Software II · ITBA</footer>
    </div>
  );
}
