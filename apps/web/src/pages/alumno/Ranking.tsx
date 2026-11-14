import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Trophy } from "@phosphor-icons/react";
import type { Ranking as DatosRanking, FilaRanking } from "../../api";
import { useAuth } from "../../auth";
import { useDatos } from "../../hooks";
import { fmt, type InicioAlumno } from "../../datos";
import { Avatar, ErrorVista, Skeleton } from "../../components/ui";
function Fila({ fila, propia }: { fila: FilaRanking; propia: boolean }) { return <div className={`ranking-fila ${propia ? "propia" : ""}`}><strong>{fila.puesto}</strong><Avatar nombre={fila.nombre_visible} /><span>{fila.nombre_visible}{propia && <small>Vos</small>}</span><strong>{fmt(fila.puntos)} <small>pts</small></strong></div>; }
export function Ranking() {
  const [params, setParams] = useSearchParams();
  const { datos: inicio, error, reintentar } = useDatos<InicioAlumno>("/alumnos/yo/inicio");
  if (error) return <ErrorVista error={error} reintentar={reintentar} />;
  if (!inicio) return <Skeleton />;
  const curso = inicio.cursos.find(c=>c.id===params.get("curso")) ?? inicio.cursos[0];
  if (!curso) return <p className="vacio">Todavía no tenés cursos para ver su ranking.</p>;
  return <><h1 className="titulo-alumno ranking-titulo">Ranking · {curso.nombre.replace(" ·", "")}</h1>{inicio.cursos.length>1 && <label className="selector-curso">Curso<select value={curso.id} onChange={e=>setParams({curso:e.target.value})}>{inicio.cursos.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>}<RankingCurso key={curso.id} cursoId={curso.id} /></>;
}
function RankingCurso({ cursoId }: { cursoId: string }) {
  const { sesion } = useAuth(); const { datos, error, reintentar } = useDatos<DatosRanking>(`/cursos/${encodeURIComponent(cursoId)}/ranking`, 3000);
  const filaRef = useRef<HTMLDivElement | null>(null); const [visible, setVisible] = useState(true);
  const propia = datos?.ranking.find(f=>f.alumno_id===sesion?.id); const puesto = propia?.puesto;
  useEffect(() => {
    if (!filaRef.current) return; const observer = new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting), { threshold: 0.8 });
    observer.observe(filaRef.current);return ()=>observer.disconnect();
  }, [puesto]);
  if (error && !datos) return <ErrorVista error={error} reintentar={reintentar} />;
  if (!datos) return <Skeleton />;
  return <div className="pila ranking"><div className="ranking-periodo"><strong>Semana</strong></div><p className="muted">Se reinicia en {datos.dias_reinicio} {datos.dias_reinicio===1 ? "día" : "días"}</p>{error && <ErrorVista error={error} reintentar={reintentar} />}{datos.ranking.length===0 ? <p className="vacio">El ranking está vacío. ¡Jugá la primera partida!</p> : <><div className="podio">{[2,1,3].map(p => {const f=datos.ranking[p-1];return f ? <div className={`podio-lugar podio-${p}`} key={p} ref={f.alumno_id===sesion?.id ? filaRef : undefined}><Avatar nombre={f.nombre_visible} /><strong>{f.nombre_visible}</strong><small>{fmt(f.puntos)} pts</small><div className="podio-base">{p===1 && <Trophy size={24} weight="fill" />}{p}</div></div> : <div key={p} />;})}</div><div className="ranking-lista">{datos.ranking.slice(3).map(f=><div key={f.alumno_id} ref={f.alumno_id===sesion?.id ? filaRef : undefined}><Fila fila={f} propia={f.alumno_id===sesion?.id} /></div>)}</div></>}{propia && !visible && <div className="ranking-fija" aria-label="Tu puesto semanal"><Fila fila={propia} propia /></div>}</div>;
}
