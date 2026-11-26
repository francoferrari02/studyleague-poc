# Guion de la demo de StudyLeague (10 minutos)

La consigna reserva **10 minutos para la demo**, además de 10 minutos para setup y exposición y 10 minutos para preguntas. Este guion muestra la PoC completa en una secuencia: una partida genera un evento, el ranking y la analítica lo procesan, el docente recibe un aviso y la analítica recupera eventos pendientes después de una interrupción.

## Qué es real y qué está preparado

- Los usuarios, cursos, preguntas, puntajes iniciales y métricas históricas son **datos ficticios precargados** para que la demo empiece con un curso activo. El reset los devuelve a un estado conocido.
- Las partidas jugadas durante la demo se corrigen y guardan en PostgreSQL. La API publica `partida.finalizada` mediante el outbox y Kafka; los consumidores actualizan el ranking en Redis, las rachas y la analítica por concepto. Los avisos nuevos también se generan a partir de eventos.
- El simulador envía partidas reales a la API en nombre de alumnos ficticios; no modifica directamente el ranking ni la analítica. Se usa porque cinco personas no pueden jugar a la vez durante la defensa.
- Algunas pantallas fuera del recorrido de la PoC son marcadores de futuras funcionalidades. No entrar en **Mi progreso**, **Crear curso** ni **Contenido** durante la demo.

Una forma breve de presentarlo: «El curso y su historial son ficticios y están cargados de antemano. Todo lo que ocurre desde que empezamos a jugar se procesa en vivo».

## Preparación antes de que empiece el cronómetro

1. Levantar y verificar el sistema. Para la demo local, desde la raíz del repositorio:

   ```bash
   docker compose up -d --build
   docker compose --profile tools build simulador
   docker compose ps
   ```

   En Azure, comprobar que la VM esté encendida con `./deploy/azure.sh estado`; si está apagada, usar `./deploy/azure.sh up`. La web está en `https://studyleague-959617.chilecentral.cloudapp.azure.com` y Kafka UI en `/kafka-ui`. El acceso inicial de la nube pide las credenciales de la cátedra, distribuidas por separado.

2. Hacer **un ensayo completo** y, después, reiniciar los datos de la demo. Repetir el reset justo antes de la defensa, **el mismo día**:

   ```bash
   bash scripts/demo-reset.sh
   # En Azure: ./deploy/azure.sh ssh bash scripts/demo-reset.sh
   ```

   El reset borra las partidas y eventos del ensayo y deja a Tomás 7.º con 1.270 puntos y racha de 4 días. Es necesario porque solo la primera partida que Tomás empieza por día y curso suma al ranking. No ejecutar el reset mientras se está presentando.

3. Dejar preparadas cuatro vistas, sin cambiar la sesión de una por la otra:

   | Vista | Dónde | Usuario de la app |
   | --- | --- | --- |
   | Alumno | Ventana normal, portada → **App del alumno** | `tomas` / `alumno123` |
   | Docente | Ventana de incógnito, portada → **Web del docente** | `laura.gomez` / `docente123` |
   | Kafka UI | Pestaña adicional | Local: `http://localhost:8080`; nube: `/kafka-ui` |
   | Terminal | Raíz del repositorio | Comandos listos para copiar |

   Si la VM acaba de arrancar, calentarla con una partida **antes del último reset**. La primera petición después del arranque puede tardar más.

4. Confirmar el estado inicial en pantalla: Tomás tiene 1.270 puntos y puesto 7.º; en la analítica de **Biología · 2.º B**, Mitosis tiene 6 aciertos de 20 respuestas (30 %) y ya tiene un aviso; Organelas tiene 8 de 19 (42 %) y Membrana 10 de 22 (45 %), ambas sin aviso; Célula 82 % y Fotosíntesis 68 %. No marcar como «nuevo» el aviso precargado de Mitosis.

## Recorrido en vivo

| Tiempo máximo | Acción visible | Mensaje y resultado esperado |
| --- | --- | --- |
| **0:00–1:00** | Mostrar brevemente el inicio de Tomás y la analítica inicial de Laura. | «Partimos de datos ficticios precargados. Vamos a provocar cambios reales». Señalar el puesto y los valores iniciales de Mitosis y Organelas. |
| **1:00–4:00** | En Tomás: **Jugar → ¡Empezar!**. Contestar **mal las dos preguntas de Organelas** («¿Qué organela realiza la fotosíntesis?» y «¿En qué organela se obtiene la mayor parte de la energía (ATP) de la célula?») y **mal las dos de Membrana** («¿Cuál es la función principal de la membrana plasmática?» y «¿De qué está formada principalmente la membrana plasmática?»); bien las demás; terminar en **Ver resultado** y abrir **Ver ranking**. | La pantalla de resultado muestra aciertos, puntos de la partida, puesto y puesto anterior. El ranking procesa `partida.finalizada` en segundos. **Mostrar que los puntos semanales subieron**; el puesto puede seguir igual si no alcanzó para superar a otro alumno. En el inicio de Tomás, **la racha pasa de 4 a 5** (el curso juega lunes, miércoles, jueves y viernes; otro día queda en 4). |
| **4:00–5:00** | Volver a Laura: abrir la campana y después **Biología · 2.º B → Analítica**. | Organelas pasa a 8/21 (38 %, menos del 40 %) y aparece el aviso nuevo **«Organelas tiene bajo dominio»**, sin recargar (la web consulta cada 5 s). Membrana también baja, a 10/24 (42 %), pero queda sobre el umbral: no avisa. Célula y Fotosíntesis siguen arriba. En Analítica aumentan las respuestas de los conceptos preguntados; los aciertos suben solo en las bien contestadas. |
| **5:00–7:00** | Explicar el camino del aviso en Kafka UI (tópico `concepto.bajo_dominio`). **Solo si el aviso no apareció** (Tomás acertó alguna de Organelas): desde la terminal, simular cinco partidas con bajo dominio en Organelas. | Cada partida simulada contesta mal las dos de Organelas; el concepto cae por debajo del 40 % en la segunda o tercera y aparece el aviso. Si el aviso ya salió, el simulador no lo repite. |
| **7:00–9:30** | Detener los consumidores de analítica y notificaciones, simular 30 partidas, abrir Kafka UI → **Consumer Groups → analitica**. Reactivar los consumidores y volver a mirar el grupo. | Las partidas se aceptan durante la interrupción; el *lag* de analítica crece. Al reactivar los consumidores, procesan los eventos pendientes y el *lag* vuelve a 0. El consumidor de ranking sigue activo. |
| **9:30–10:00** | Volver a la analítica de Laura. | Cierre: «Una partida se guarda, se distribuye a consumidores independientes y, si uno se detiene, Kafka conserva lo pendiente para que lo procese al volver». |

### Comandos del recorrido

Ejecutar desde la raíz del repositorio. Esperar a que cada comando termine antes del siguiente:

```bash
# Solo si Tomás no disparó el aviso de Organelas
docker compose run --rm simulador --alumnos 5 --segundos 0 --bajo-dominio organelas

# Consumidor interrumpido y recuperación
docker compose stop analitica-consumer notificaciones-consumer
docker compose run --rm simulador --alumnos 30
docker compose start analitica-consumer notificaciones-consumer
```

En la nube, anteponer `./deploy/azure.sh ssh` a cada comando; por ejemplo:

```bash
./deploy/azure.sh ssh docker compose run --rm simulador --alumnos 5 --segundos 0 --bajo-dominio organelas
```

Para observar el *lag*, mantener Kafka UI en el grupo **analitica** y actualizar la vista después de simular y después de reactivar. El simulador imprime cuántas partidas completó. Si el *lag* se procesa tan rápido que no se llega a mostrar, el log de las 30 partidas junto con la analítica actualizada permite explicar el resultado; no prolongar la demo por esa pantalla.

## Dos cosas que pueden confundirse durante la presentación

1. **Tomás suma puntos pero no cambia de puesto.** No es un fallo: el ranking ordena por puntaje acumulado. Señalar el puntaje anterior y el nuevo, y la pantalla de resultado. Si se quiere ensayar un ascenso, practicar hasta responder suficientes preguntas correctamente y hacer el reset antes de la defensa. No prometer un puesto final exacto.
2. **La segunda partida de Tomás no suma al ranking.** La primera que empieza en el día es la competitiva; las siguientes se muestran como **«Partida de práctica»**. Sus respuestas sí alimentan la analítica. Si se jugó durante el ensayo, ejecutar `demo-reset.sh` antes de presentar.

## Qué dejar para exposición o preguntas

El tiempo de demo no alcanza para ejecutar también replay, reenvío de eventos duplicados y la carga de 1.000 partidas. Esas pruebas y sus resultados están documentados en el [README](../README.md), [eventos](eventos.md) y [mediciones en Azure](mediciones-nube.json). Durante la exposición se puede mostrar el diagrama de arquitectura; ante una pregunta, abrir esos resultados o ejecutar `bash scripts/replay.sh` si queda tiempo.

## Cierre operativo

Después de un ensayo, correr `bash scripts/demo-reset.sh` si se necesita dejar la demo lista. Al terminar en local, `docker compose down` apaga los contenedores sin borrar los volúmenes. En Azure, `./deploy/azure.sh down` apaga la VM para evitar seguir consumiendo crédito.
