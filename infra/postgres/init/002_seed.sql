-- Datos de ejemplo: los mismos de los mockups (Biología 2.º B, Prof. Laura Gómez, Unidad 3: La célula).

INSERT INTO escuelas (id, nombre) VALUES
  ('esc-12', 'Escuela N.º 12 Manuel Belgrano');

INSERT INTO docentes (id, escuela_id, nombre, email) VALUES
  ('doc-laura', 'esc-12', 'Prof. Laura Gómez', 'laura.gomez@escuela12.edu.ar');

INSERT INTO alumnos (id, escuela_id, nombre_visible) VALUES
  ('alu-01', 'esc-12', 'Tomás R.'),
  ('alu-02', 'esc-12', 'Valentina S.'),
  ('alu-03', 'esc-12', 'Joaquín M.'),
  ('alu-04', 'esc-12', 'Camila P.'),
  ('alu-05', 'esc-12', 'Lucas F.'),
  ('alu-06', 'esc-12', 'Martina G.'),
  ('alu-07', 'esc-12', 'Benjamín L.'),
  ('alu-08', 'esc-12', 'Sofía D.'),
  ('alu-09', 'esc-12', 'Mateo A.'),
  ('alu-10', 'esc-12', 'Emma C.'),
  ('alu-11', 'esc-12', 'Santiago V.'),
  ('alu-12', 'esc-12', 'Isabella N.'),
  ('alu-13', 'esc-12', 'Thiago B.'),
  ('alu-14', 'esc-12', 'Mía H.'),
  ('alu-15', 'esc-12', 'Felipe O.'),
  ('alu-16', 'esc-12', 'Catalina T.'),
  ('alu-17', 'esc-12', 'Bautista E.'),
  ('alu-18', 'esc-12', 'Olivia K.'),
  ('alu-19', 'esc-12', 'Facundo Z.'),
  ('alu-20', 'esc-12', 'Lola W.'),
  ('alu-21', 'esc-12', 'Agustín I.'),
  ('alu-22', 'esc-12', 'Renata Q.'),
  ('alu-23', 'esc-12', 'Nicolás J.'),
  ('alu-24', 'esc-12', 'Julieta U.'),
  ('alu-25', 'esc-12', 'Ignacio Y.'),
  ('alu-26', 'esc-12', 'Delfina X.'),
  ('alu-27', 'esc-12', 'Valentino R.'),
  ('alu-28', 'esc-12', 'Antonella S.'),
  ('alu-29', 'esc-12', 'Franco M.'),
  ('alu-30', 'esc-12', 'Pilar G.');

INSERT INTO cursos (id, docente_id, nombre, codigo, dias_juego, reinicio, minijuegos) VALUES
  ('bio-2b', 'doc-laura', 'Biología · 2.º B', 'K7P2QX', '{1,3,5}', 'semanal',
   '{verdadero_falso,trivia,ordenar_secuencia,emparejar_conceptos,definicion_palabras_clave}');

INSERT INTO inscripciones (curso_id, alumno_id)
  SELECT 'bio-2b', id FROM alumnos;

INSERT INTO conceptos (id, curso_id, nombre) VALUES
  ('celula',       'bio-2b', 'Célula'),
  ('fotosintesis', 'bio-2b', 'Fotosíntesis'),
  ('membrana',     'bio-2b', 'Membrana celular'),
  ('organelas',    'bio-2b', 'Organelas'),
  ('mitosis',      'bio-2b', 'Mitosis');

INSERT INTO preguntas (id, concepto_id, minijuego, enunciado, opciones, respuesta, explicacion) VALUES
  ('mitosis-p1', 'mitosis', 'trivia',
   '¿En qué fase de la mitosis se separan las cromátidas hermanas?',
   '["Profase", "Metafase", "Anafase", "Telofase"]', '"Anafase"',
   'En la anafase las cromátidas hermanas se separan y viajan a polos opuestos de la célula. En la metafase todavía están alineadas en el centro.'),
  ('organelas-p1', 'organelas', 'trivia',
   '¿Qué organela realiza la fotosíntesis?',
   '["Mitocondria", "Cloroplasto", "Ribosoma", "Núcleo"]', '"Cloroplasto"',
   'Los cloroplastos contienen clorofila y transforman la energía de la luz en alimento para la planta.'),
  ('membrana-p1', 'membrana', 'verdadero_falso',
   'Las células animales tienen pared celular.',
   '["Verdadero", "Falso"]', '"Falso"',
   'Solo las células vegetales, los hongos y las bacterias tienen pared celular. Las animales tienen únicamente membrana.'),
  ('mitosis-p2', 'mitosis', 'ordenar_secuencia',
   'Ordená las fases de la mitosis',
   '["Metafase", "Telofase", "Profase", "Anafase"]', '["Profase", "Metafase", "Anafase", "Telofase"]',
   'Primero se condensan los cromosomas (profase), se alinean (metafase), se separan (anafase) y se forman los núcleos nuevos (telofase).'),
  ('fotosintesis-p1', 'fotosintesis', 'definicion_palabras_clave',
   'Definí con tus palabras: ¿Qué es la fotosíntesis?',
   '[]', '["luz", "alimento", "oxígeno", "dióxido de carbono"]',
   'La fotosíntesis es el proceso por el que las plantas usan la luz, el agua y el dióxido de carbono para producir su alimento y liberar oxígeno.');
