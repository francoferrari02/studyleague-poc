import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
/** Las peticiones se cancelan al navegar; un refresh conserva los datos anteriores. */
export function useDatos<T>(ruta: string, intervalo = 0) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const reintentar = useCallback(() => setVersion(v => v + 1), []);
  const rutaActual = useRef(ruta);
  useEffect(() => {
    if (rutaActual.current !== ruta) { setDatos(null); rutaActual.current = ruta; }
    let activa = true;
    let timer: ReturnType<typeof setTimeout>;
    let controlador: AbortController | null = null;
    const cargar = async () => {
      controlador?.abort(); controlador = new AbortController();
      try { const d = await api<T>(ruta, { signal: controlador.signal }); if (activa) { setDatos(d); setError(""); } }
      catch (e) { if (activa && !controlador.signal.aborted) setError((e as Error).message); }
      if (activa && intervalo) timer = setTimeout(cargar, intervalo);
    };
    const foco = () => { clearTimeout(timer); void cargar(); };
    void cargar(); if (intervalo) window.addEventListener("focus", foco);
    return () => { activa = false; clearTimeout(timer); controlador?.abort(); window.removeEventListener("focus", foco); };
  }, [ruta, intervalo, version]);
  return { datos, error, reintentar };
}
