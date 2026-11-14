-- Datos de ejemplo: los mismos de los mockups (Biología 2.º B, Prof. Laura Gómez, Unidad 3: La célula).

INSERT INTO escuelas (id, nombre) VALUES
  ('esc-12', 'Escuela N.º 12 Manuel Belgrano');

-- Usuarios de prueba (las claves en texto plano están solo acá y en el README):
--   alumno  "tomas" / "alumno123" (alu-01); el resto de los alumnos entra con su id
--           ("alu-02", "alu-03", ...) y la misma clave "alumno123".
--   docente "laura.gomez" / "docente123" (doc-laura).
-- Los hashes bcrypt se generan acá con pgcrypto para no versionar hashes a mano.

INSERT INTO docentes (id, escuela_id, nombre, email, usuario, clave_hash) VALUES
  ('doc-laura', 'esc-12', 'Prof. Laura Gómez', 'laura.gomez@escuela12.edu.ar',
   'laura.gomez', crypt('docente123', gen_salt('bf')));

INSERT INTO alumnos (id, escuela_id, nombre_visible, usuario, clave_hash)
  SELECT id, 'esc-12', nombre_visible,
         CASE id WHEN 'alu-01' THEN 'tomas' ELSE id END,
         crypt('alumno123', gen_salt('bf'))
  FROM (VALUES
    ('alu-01', 'Tomás R.'),
    ('alu-02', 'Valentina S.'),
    ('alu-03', 'Joaquín M.'),
    ('alu-04', 'Camila P.'),
    ('alu-05', 'Lucas F.'),
    ('alu-06', 'Martina G.'),
    ('alu-07', 'Benjamín L.'),
    ('alu-08', 'Sofía D.'),
    ('alu-09', 'Mateo A.'),
    ('alu-10', 'Emma C.'),
    ('alu-11', 'Santiago V.'),
    ('alu-12', 'Isabella N.'),
    ('alu-13', 'Thiago B.'),
    ('alu-14', 'Mía H.'),
    ('alu-15', 'Felipe O.'),
    ('alu-16', 'Catalina T.'),
    ('alu-17', 'Bautista E.'),
    ('alu-18', 'Olivia K.'),
    ('alu-19', 'Facundo Z.'),
    ('alu-20', 'Lola W.'),
    ('alu-21', 'Agustín I.'),
    ('alu-22', 'Renata Q.'),
    ('alu-23', 'Nicolás J.'),
    ('alu-24', 'Julieta U.'),
    ('alu-25', 'Ignacio Y.'),
    ('alu-26', 'Delfina X.'),
    ('alu-27', 'Valentino R.'),
    ('alu-28', 'Antonella S.'),
    ('alu-29', 'Franco M.'),
    ('alu-30', 'Pilar G.')
  ) AS v(id, nombre_visible);

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
