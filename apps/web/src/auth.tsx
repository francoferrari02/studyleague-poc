import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { guardarSesion, obtenerSesion, vencimiento, type Rol, type Sesion } from "./api";
const Contexto = createContext<{ sesion: Sesion | null; salir: () => void }>({ sesion: null, salir: () => {} });
export function Autenticacion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState(obtenerSesion);
  useEffect(() => { const actualizar = () => setSesion(obtenerSesion()); window.addEventListener("sesion", actualizar); return () => window.removeEventListener("sesion", actualizar); }, []);
  useEffect(() => {
    if (!sesion) return;
    const resto = vencimiento(sesion.token)-Date.now();
    if (resto<=0) { guardarSesion(null); return; }
    const timer = setTimeout(()=>guardarSesion(null), Math.min(resto, 2147483647));
    return ()=>clearTimeout(timer);
  }, [sesion]);
  return <Contexto.Provider value={{ sesion, salir: () => guardarSesion(null) }}>{children}</Contexto.Provider>;
}
export const useAuth = () => useContext(Contexto);
export function Protegida({ rol }: { rol: Rol }) {
  const { sesion } = useAuth();
  if (!sesion) return <Navigate to="/alumno/ingreso" replace />;
  if (sesion.rol !== rol) return <Navigate to={sesion.rol === "docente" ? "/docente/cursos" : "/alumno"} replace />;
  return <Outlet />;
}
