-- Desglose ficticio del mismo snapshot, por pregunta y opción. Cada concepto
-- suma exactamente las respuestas y aciertos de analitica_concepto. Tomás
-- (alu-01) queda fuera del historial: su partida en vivo se ve por separado.
-- Las filas se reparten determinísticamente entre alumnos alu-02..alu-27;
-- no son partidas y no alteran el ranking ni la participación semanal.
WITH conteos (pregunta_id, respuesta_dada, cantidad) AS (VALUES
  ('celula-p1', 'La célula', 23),
  ('celula-p1', 'El tejido', 2),
  ('celula-p1', 'El órgano', 1),
  ('celula-p2', 'Núcleo definido', 19),
  ('celula-p2', 'Membrana plasmática', 3),
  ('celula-p2', 'Ribosomas', 2),
  ('celula-p2', 'Material genético', 1),
  ('fotosintesis-p2', 'Oxígeno', 16),
  ('fotosintesis-p2', 'Dióxido de carbono', 5),
  ('fotosintesis-p2', 'Nitrógeno', 2),
  ('fotosintesis-p2', 'Metano', 1),
  ('fotosintesis-p3', 'Clorofila', 16),
  ('fotosintesis-p3', 'Hemoglobina', 3),
  ('fotosintesis-p3', 'Melanina', 2),
  ('fotosintesis-p3', 'Queratina', 2),
  ('membrana-p2', 'Controlar qué sustancias entran y salen de la célula', 5),
  ('membrana-p2', 'Fabricar proteínas', 3),
  ('membrana-p2', 'Producir energía', 2),
  ('membrana-p2', 'Guardar el ADN', 1),
  ('membrana-p3', 'Una doble capa de lípidos con proteínas', 5),
  ('membrana-p3', 'Celulosa', 3),
  ('membrana-p3', 'Almidón', 2),
  ('membrana-p3', 'ADN', 1),
  ('organelas-p1', 'Cloroplasto', 4),
  ('organelas-p1', 'Mitocondria', 4),
  ('organelas-p1', 'Ribosoma', 1),
  ('organelas-p1', 'Núcleo', 1),
  ('organelas-p2', 'Mitocondria', 4),
  ('organelas-p2', 'Aparato de Golgi', 3),
  ('organelas-p2', 'Lisosoma', 1),
  ('organelas-p2', 'Vacuola', 1),
  ('mitosis-p1', 'Anafase', 3),
  ('mitosis-p1', 'Metafase', 4),
  ('mitosis-p1', 'Profase', 2),
  ('mitosis-p1', 'Telofase', 1),
  ('mitosis-p3', 'Dos', 3),
  ('mitosis-p3', 'Cuatro', 4),
  ('mitosis-p3', 'Una', 2),
  ('mitosis-p3', 'Ocho', 1)
), votos AS (
  SELECT pregunta_id, respuesta_dada,
         row_number() OVER (PARTITION BY pregunta_id ORDER BY respuesta_dada, numero) AS alumno_num
    FROM conteos CROSS JOIN LATERAL generate_series(1, cantidad) AS serie(numero)
)
INSERT INTO analitica_respuestas_base (pregunta_id, alumno_id, respuesta_dada)
SELECT pregunta_id, 'alu-' || lpad((alumno_num + 1)::text, 2, '0'), respuesta_dada
  FROM votos;
