import { Link } from "react-router-dom";
import { BookOpen, Flame, Play, Trophy } from "@phosphor-icons/react";
import { useAuth } from "../../auth";
import { useDatos } from "../../hooks";
import type { InicioAlumno } from "../../datos";
import { Chip, ErrorVista, Skeleton, Tarjeta } from "../../components/ui";
export function Inicio() {
  const { datos, error, reintentar } = useDatos<InicioAlumno>("/alumnos/yo/inicio"); const { salir } = useAuth();
  if (error) return <ErrorVista error={error} reintentar={reintentar} />;
  if (!datos) return <Skeleton />;
  const curso = datos.cursos.find(c => c.hoy_es_dia_juego && c.minijuegos.includes("trivia")) ?? datos.cursos.find(c => c.minijuegos.includes("trivia"));
  return <div className="pila inicio-alumno"><header className="fila entre"><h1 className="titulo-alumno">Hola, {datos.nombre_visible.split(" ")[0]}</h1><Chip tono="amarillo"><Flame weight="fill" size={20} />{curso?.racha ?? 0}</Chip></header>{curso ? <><Tarjeta className="invitacion"><Chip>{curso.nombre.split(" ·")[0]}</Chip><h2 className="titulo-alumno">{curso.hoy_es_dia_juego ? "¡Hoy es día de juego!" : "¿Repasamos un poco?"}</h2><p>{curso.nombre.split(" ·")[0]} · Trivia</p><Link className="boton boton-principal" to={`/alumno/jugar?curso=${encodeURIComponent(curso.id)}`}><Play size={22} weight="fill" />Jugar</Link></Tarjeta><Link to={`/alumno/ranking?curso=${encodeURIComponent(curso.id)}`}><Tarjeta className="fila"><Trophy size={32} weight="fill" color="var(--amarillo)" /><div><strong>Tu posición</strong><p className="muted">{curso.puesto ? `${curso.puesto}.º de ${curso.alumnos} esta semana` : "Jugá para entrar al ranking"}</p><small>{curso.puntos.toLocaleString("es-AR")} puntos semanales</small></div></Tarjeta></Link></> : <Tarjeta>No hay trivias disponibles todavía.</Tarjeta>}<h2 className="titulo-alumno">Tus cursos</h2>{datos.cursos.map(c => <Tarjeta className="curso-alumno" key={c.id}><BookOpen size={28} weight="fill" color="var(--violeta)" /><div><h3>{c.nombre}</h3><p className="muted">{c.minijuegos.length ? "Próximo día de juego" : "Próximamente"}</p></div><Chip>{c.proximo_dia ?? "Sin definir"}</Chip></Tarjeta>)}{datos.cursos.length === 0 && <p className="vacio">Todavía no estás inscripto a un curso.</p>}<button className="salir" onClick={salir}>Cerrar sesión</button></div>;
}
