import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle, Clock, ListChecks, Play, X } from "@phosphor-icons/react";
import { api } from "../../api";
import { useDatos } from "../../hooks";
import type { Feedback, InicioAlumno, Partida, PartidaNueva, Pregunta, Respuesta } from "../../datos";
import { BarraProgreso, Boton, Chip, ErrorVista, OpcionRespuesta, Skeleton, Tarjeta, Temporizador } from "../../components/ui";
export function AntesDeJugar() {
  const [params] = useSearchParams(); const cursoId = params.get("curso");
  const { datos, error, reintentar } = useDatos<InicioAlumno>("/alumnos/yo/inicio");
  const [cargando, setCargando] = useState(false); const [fallo, setFallo] = useState(""); const navegar = useNavigate();
  const curso = datos?.cursos.find(c=>c.id===cursoId) ?? datos?.cursos.find(c=>c.minijuegos.includes("trivia"));
  async function empezar() {
    if (!curso || cargando) return; setCargando(true); setFallo("");
    try { const { preguntas, partida_id, sesion, cuenta_para_ranking } = await api<PartidaNueva>(`/cursos/${encodeURIComponent(curso.id)}/partida-nueva?minijuego=trivia`); if (!preguntas.length) throw Error("Todavía no hay preguntas de trivia en este curso."); navegar("/alumno/partida", { state: { curso, preguntas, partidaId: partida_id, sesion, cuentaParaRanking: cuenta_para_ranking } }); }
    catch(e){setFallo((e as Error).message);setCargando(false);}
  }
  if (error) return <ErrorVista error={error} reintentar={reintentar} />;
  if (!datos) return <Skeleton />;
  return <div className="pila antes-jugar"><Link to="/alumno" className="fila"><ArrowLeft size={24} />{curso?.nombre ?? "Inicio"}</Link><div className="emblema-trivia"><ListChecks size={64} weight="fill" /></div><h1 className="titulo-alumno">Trivia</h1><p className="muted">{curso?.nombre}</p><Tarjeta className="pila"><p className="fila"><ListChecks size={24} />Hasta 10 preguntas</p><p className="fila"><Clock size={24} />20 s por pregunta</p><p className="fila"><Play size={24} weight="fill" />~3 min</p></Tarjeta><p className="regla-puntos">Cada acierto suma 100 puntos. ¡Respondé rápido y sumá bonus!</p>{fallo && <ErrorVista error={fallo} />}<Boton onClick={() => void empezar()} disabled={!curso || cargando}>{cargando ? "Preparando…" : "¡Empezar!"}</Boton></div>;
}
interface Juego { curso: { id: string; nombre: string }; preguntas: Pregunta[]; partidaId: string; sesion: string; cuentaParaRanking: boolean }
export function Trivia() {
  const { state } = useLocation(); const juego = state as Juego | null;
  if (!juego?.preguntas?.length || !juego.sesion) return <Navigate to="/alumno/jugar" replace />;
  return <PartidaTrivia key={juego.partidaId} juego={juego} />;
}
function PartidaTrivia({ juego }: { juego: Juego }) {
  const navegar = useNavigate(); const [indice, setIndice] = useState(0); const [segundos, setSegundos] = useState(20);
  const [feedback, setFeedback] = useState<Feedback | null>(null); const [elegida, setElegida] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState(false); const [error, setError] = useState(""); const [finalizando, setFinalizando] = useState(false);
  const respuestas = useRef<Respuesta[]>([]); const inicio = useRef(performance.now()); const bloqueada = useRef(false); const enviando = useRef(false);
  const controlador = useRef<AbortController | null>(null); const pregunta = juego.preguntas[indice];
  useEffect(() => () => controlador.current?.abort(), []);
  const corregir = useCallback(async (respuesta: string | null, repetir = false) => {
    if (bloqueada.current && !repetir) return;
    bloqueada.current = true; setOcupada(true); setError(""); setElegida(respuesta);
    if (!repetir) respuestas.current[indice] = { pregunta_id: pregunta.pregunta_id, respuesta_dada: respuesta, tiempo_ms: respuesta === null ? 20000 : Math.min(20000, Math.round(performance.now()-inicio.current)) };
    controlador.current?.abort(); controlador.current = new AbortController();
    try { setFeedback(await api<Feedback>(`/cursos/${encodeURIComponent(juego.curso.id)}/preguntas/${encodeURIComponent(pregunta.pregunta_id)}/correccion`, { cuerpo: { respuesta_dada: respuesta, sesion: juego.sesion }, signal: controlador.current.signal })); }
    catch(e) { if (!controlador.current.signal.aborted) setError((e as Error).message); }
    finally { setOcupada(false); }
  }, [indice, pregunta.pregunta_id, juego.curso.id, juego.sesion]);
  useEffect(() => {
    inicio.current = performance.now(); bloqueada.current = false; setSegundos(20);
    const timer = setInterval(() => { if (bloqueada.current) return; const s = Math.max(0, Math.ceil(20-(performance.now()-inicio.current)/1000)); setSegundos(s); if (!s) void corregir(null); }, 100);
    return () => clearInterval(timer);
  }, [indice, corregir]);
  async function finalizar() {
    if (enviando.current) return; enviando.current=true; setFinalizando(true);setError("");
    controlador.current = new AbortController();
    try {
      const inicioEnvio = performance.timeOrigin + performance.now();
      const partida = await api<Partida>("/partidas", { cuerpo: { sesion: juego.sesion, partida_id: juego.partidaId, curso_id: juego.curso.id, minijuego: "trivia", respuestas: respuestas.current }, signal: controlador.current.signal });
      navegar("/alumno/resultado", { replace: true, state: { partida, curso: juego.curso, inicioEnvio } });
    } catch(e) { if (!controlador.current.signal.aborted) setError((e as Error).message); enviando.current=false;setFinalizando(false); }
  }
  function siguiente() { if (indice===juego.preguntas.length-1) { void finalizar(); return; } setFeedback(null);setElegida(null);setError("");setIndice(i=>i+1); }
  return <div className="pila trivia"><header className="fila"><Link className="cerrar-partida" aria-label="Cerrar partida" to="/alumno"><X size={20} /></Link><div className="trivia-progreso"><strong className="muted">{indice+1}/{juego.preguntas.length}</strong><BarraProgreso valor={indice+1} maximo={juego.preguntas.length} /></div><Chip tono="amarillo">{respuestas.current.length} resp.</Chip></header>{!juego.cuentaParaRanking && <p className="muted" role="note">Partida de práctica: hoy ya empezaste una partida que suma al ranking en este curso. Esta no suma puntos, pero tus respuestas sí le sirven a tu profe.</p>}{!feedback && <Temporizador segundos={segundos} />}<Chip>{pregunta.concepto_nombre}</Chip><h1 className="titulo-alumno pregunta-enunciado">{pregunta.enunciado}</h1><div className="pila opciones">{pregunta.opciones.map((opcion, i) => <OpcionRespuesta key={opcion} indice={i} estado={feedback ? opcion===feedback.respuesta_correcta ? "correcta" : opcion===elegida ? "incorrecta" : "normal" : opcion===elegida ? "seleccionada" : "normal"} disabled={bloqueada.current || ocupada} onClick={() => void corregir(opcion)}>{opcion}</OpcionRespuesta>)}</div>{ocupada && <p role="status">Corrigiendo tu respuesta…</p>}{feedback && <>{feedback.correcta ? <div className="feedback-bien fila" role="status"><CheckCircle weight="fill" size={30} /><strong>¡Respuesta correcta!</strong></div> : <Tarjeta className="feedback-error"><h2>Casi. La respuesta era {feedback.respuesta_correcta}</h2><strong>Lo que explicó tu profe</strong><p>{feedback.explicacion}</p></Tarjeta>}<Boton disabled={finalizando} onClick={siguiente}>{finalizando ? "Guardando partida…" : indice===juego.preguntas.length-1 ? "Ver resultado" : feedback.correcta ? "Siguiente" : "Entendido, seguir"}</Boton></>}{error && <ErrorVista error={error} reintentar={() => feedback ? void finalizar() : void corregir(elegida, true)} />}</div>;
}
