import type { Pantalla } from "../pantallas";

/** Marcador de una pantalla todavía no implementada. */
export function Marcador({ pantalla }: { pantalla: Pantalla }) {
  return (
    <section
      style={{
        background: "var(--superficie)",
        border: "2px dashed var(--borde)",
        borderRadius: pantalla.rol === "alumno" ? "var(--radio-tarjeta-alumno)" : "var(--radio-tarjeta-docente)",
        padding: 24,
      }}
    >
      <p style={{ color: "var(--texto-secundario)", margin: 0 }}>Pendiente · mockups {pantalla.mockups.join(", ")}</p>
      <h2 style={{ fontFamily: pantalla.rol === "alumno" ? "var(--fuente-titulo)" : undefined }}>{pantalla.titulo}</h2>
      <code>{pantalla.ruta}</code>
    </section>
  );
}
