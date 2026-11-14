import { Link, useOutletContext } from "react-router-dom";
import { BookOpen, CalendarBlank, Plus, Warning } from "@phosphor-icons/react";
import { BarraProgreso, Boton, Chip, Encabezado, Tarjeta } from "../../components/ui";
import type { CursosDocente } from "./datos";
export function Cursos() {
  const datos = useOutletContext<CursosDocente>();
  return <div className="pila cursos-docente"><Encabezado titulo="Mis cursos"><Boton disabled title="Crear cursos corresponde a la próxima fase"><Plus size={18} />Crear curso</Boton></Encabezado><div className="cursos-cuadricula">{datos.cursos.map(c=><Link key={c.id} to={`/docente/cursos/${encodeURIComponent(c.id)}/analitica`}><Tarjeta className="pila"><div className="fila"><div className="curso-icono"><BookOpen size={24} /></div><div><h2>{c.nombre}</h2><p className="muted">{c.alumnos} alumnos</p></div></div><p className="fila"><CalendarBlank size={18} /><span>Próximo día de juego: <strong>{c.proximo_dia ?? "Sin definir"}</strong></span></p><div className="curso-aviso">{c.bajo_dominio>0 && <Chip tono="coral"><Warning size={14} />{c.bajo_dominio} {c.bajo_dominio===1 ? "concepto con bajo dominio" : "conceptos con bajo dominio"}</Chip>}</div><div className="pila participacion"><div className="fila entre"><span className="muted">Participación de la semana</span><strong>{c.participaron} de {c.alumnos}</strong></div><BarraProgreso valor={c.participaron} maximo={c.alumnos} /></div></Tarjeta></Link>)}</div>{!datos.cursos.length && <Tarjeta><p className="vacio">Todavía no tenés cursos asignados.</p></Tarjeta>}</div>;
}
