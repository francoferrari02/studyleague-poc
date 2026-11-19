import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { CheckCircle, Flame, Trophy } from "@phosphor-icons/react";
import { api, type FilaRanking } from "../../api";
import { useAuth } from "../../auth";
import { useDatos } from "../../hooks";
import { fmt, type InicioAlumno, type Partida } from "../../datos";
import { Avatar, Boton, Chip, ErrorVista, Tarjeta } from "../../components/ui";
interface EstadoRanking { estado: "pendiente" | "actualizado"; cuenta_para_ranking?: boolean; puesto: number | null; puesto_anterior: number | null; puntos: number; vecinos: FilaRanking[] }
interface ResultadoState { partida: Partida; curso: { id: string; nombre: string }; inicioEnvio: number }
export function Resultado() {
  const { state } = useLocation(); const resultado = state as ResultadoState | null;
  if (!resultado?.partida) return <Navigate to="/alumno" replace />;
  return <ResultadoPartida key={resultado.partida.partida_id} resultado={resultado} />;
}
function ResultadoPartida({ resultado }: { resultado: ResultadoState }) {
  const { sesion } = useAuth(); const { partida, curso } = resultado;
  const [ranking, setRanking] = useState<EstadoRanking | null>(null); const [error, setError] = useState(""); const [intento, setIntento] = useState(0);
  const { datos: inicio } = useDatos<InicioAlumno>("/alumnos/yo/inicio", 3000);
  useEffect(() => {
    let activo = true; let timer: ReturnType<typeof setTimeout>; const controlador = new AbortController(); const limite = Date.now()+10000;
    setError("");
    async function consultar() {
      try {
        const r = await api<EstadoRanking>(`/partidas/${partida.partida_id}/ranking`, { signal: controlador.signal });
        if (!activo) return;
        if (r.estado === "actualizado") { setRanking(r); return; }
        if (Date.now()>=limite) { setError("Tu partida está guardada. El ranking está tardando más de lo habitual; podés consultar de nuevo."); return; }
        timer = setTimeout(consultar, 500);
      } catch(e) { if (activo && !controlador.signal.aborted) setError((e as Error).message); }
    }
    void consultar();
    return () => { activo=false; clearTimeout(timer);controlador.abort(); };
  }, [partida.partida_id, intento]);
  const racha = inicio?.cursos.find(c=>c.id===curso.id)?.racha;
  const practica = partida.cuenta_para_ranking === false || ranking?.cuenta_para_ranking === false;
  const delta = !practica && ranking?.puesto && ranking.puesto_anterior ? ranking.puesto_anterior-ranking.puesto : null;
  const filas = ranking?.puesto ? [...ranking.vecinos, { puesto: ranking.puesto, alumno_id: sesion!.id, nombre_visible: sesion!.nombre, puntos: ranking.puntos }].sort((a,b)=>a.puesto-b.puesto) : [];
  return <div className="pila resultado"><div className="resultado-medalla"><Trophy weight="fill" size={64} /></div><h1 className="titulo-alumno">¡Partida terminada!</h1><p>{partida.aciertos} de {partida.total} correctas</p><div className="puntaje-final"><strong>{fmt(partida.puntaje)}</strong><span>puntos</span></div>{racha !== undefined && <Chip tono="amarillo"><Flame weight="fill" size={20} />Racha de {racha} {racha===1 ? "día" : "días"}</Chip>}<Tarjeta className="estado-ranking">{ranking && practica ? <><h2 className="titulo-alumno" data-ranking-visible="true">Partida de práctica</h2><p className="muted">Hoy ya jugaste la partida que suma al ranking en este curso: esta no suma puntos. Tus respuestas igual le sirven a tu profe.</p>{ranking.puesto && <p>Seguís en el puesto {ranking.puesto}.º</p>}</> : ranking ? <><h2 className="titulo-alumno" data-ranking-visible="true">{delta !== null && delta>0 ? `¡Subiste al puesto ${ranking.puesto}!` : `Tu puesto: ${ranking.puesto}.º`}</h2>{delta !== null && <Chip tono={delta>0 ? "verde" : "violeta"}>{delta>0 ? "+" : ""}{delta}</Chip>}<p className="muted">{ranking.puesto_anterior ? `Puesto anterior: ${ranking.puesto_anterior}.º` : "Tu primera posición de la semana"}</p><div className="vecinos">{filas.map(f => <div className={`ranking-fila ${f.alumno_id===sesion?.id ? "propia" : ""}`} key={f.puesto}><strong>{f.puesto}</strong><Avatar nombre={f.nombre_visible} /><span>{f.nombre_visible}{f.alumno_id===sesion?.id && <small>Vos</small>}</span><strong>{fmt(f.puntos)} <small>pts</small></strong></div>)}</div></> : <div className="pila"><CheckCircle size={32} weight="fill" color="var(--verde)" /><p role="status">Actualizando tu posición…</p><span className="muted">Tu partida ya está guardada</span></div>}</Tarjeta>{error && <ErrorVista error={error} reintentar={()=>setIntento(v=>v+1)} />}<Link className="boton boton-principal" to={`/alumno/ranking?curso=${encodeURIComponent(curso.id)}`}>Ver ranking</Link><Link className="boton boton-texto" to="/alumno">Volver al inicio</Link></div>;
}
