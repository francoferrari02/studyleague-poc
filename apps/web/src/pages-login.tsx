import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeSlash, Star, Trophy } from "@phosphor-icons/react";
import { api, guardarSesion, type Sesion } from "./api";
import { useAuth } from "./auth";
import { Boton, Marca } from "./components/ui";
export function Ingreso({ docente = false }: { docente?: boolean }) {
  const { sesion } = useAuth(); const navegar = useNavigate();
  const [usuario, setUsuario] = useState(""); const [clave, setClave] = useState("");
  const [visible, setVisible] = useState(false); const [enviando, setEnviando] = useState(false); const [error, setError] = useState("");
  if (sesion) return <Navigate to={sesion.rol === "docente" ? "/docente/cursos" : "/alumno"} replace />;
  async function entrar(u = usuario, c = clave) {
    if (enviando) return; setEnviando(true); setError("");
    try { const s = await api<Sesion>("/auth/login", { publica: true, cuerpo: { usuario: u, clave: c, rol: docente ? "docente" : "alumno" } }); guardarSesion(s); navegar(s.rol === "docente" ? "/docente/cursos" : "/alumno", { replace: true }); }
    catch (e) { setError((e as Error).message); } finally { setEnviando(false); }
  }
  function enviar(e: FormEvent) { e.preventDefault(); void entrar(); }
  return <div className={docente ? "ingreso-docente" : "alumno-exterior"}>{docente && <aside className="ingreso-presentacion"><Marca /><div><h1>Sabé qué entendió tu curso antes del examen</h1><div className="ingreso-vista"><strong>Una mirada al aprendizaje de tu curso</strong><p>Aciertos por concepto</p><p>Participación de la semana</p><p>Alertas de bajo dominio</p></div></div></aside>}<div className={docente ? "ingreso-docente-contenido" : "alumno-marco ingreso-alumno"}><Marca />{!docente && <div className="ingreso-emblema" aria-hidden="true"><Trophy size={68} weight="fill" /><Star size={24} weight="fill" /><Star size={16} weight="fill" /></div>}<section className="ingreso-formulario"><h1 className="titulo-alumno">{docente ? "Ingresá a tu cuenta" : "¡Bienvenido a tu liga!"}</h1><p className="muted">{docente ? "Escuela N.º 12 Manuel Belgrano" : "Ingresá con el usuario de tu escuela"}</p><form onSubmit={enviar} className="pila"><label>{docente ? "Usuario o email institucional" : "Usuario"}<input autoComplete="username" value={usuario} onChange={e => setUsuario(e.target.value)} placeholder={docente ? "laura.gomez" : "Tu usuario de la escuela"} required /></label><label>Contraseña<div className="campo-clave"><input type={visible ? "text" : "password"} autoComplete="current-password" value={clave} onChange={e => setClave(e.target.value)} placeholder="Tu contraseña" required /><button type="button" aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} onClick={() => setVisible(v => !v)}>{visible ? <EyeSlash size={22} /> : <Eye size={22} />}</button></div></label>{error && <p className="error-vista" role="alert">{error}</p>}<Boton disabled={enviando} type="submit">{enviando ? "Ingresando…" : docente ? "Ingresar" : "Entrar"}</Boton></form>{!docente && import.meta.env.VITE_DEMO === "true" && <Boton variante="secundario" disabled={enviando} onClick={() => void entrar("tomas", "alumno123")}>Entrar como Tomás</Boton>}<Link className="enlace ingreso-otro" to={docente ? "/alumno/ingreso" : "/docente/ingreso"}>{docente ? "Ingreso de alumnos" : "Soy docente"}</Link></section><footer className="muted">Escuela N.º 12 Manuel Belgrano</footer></div></div>;
}
