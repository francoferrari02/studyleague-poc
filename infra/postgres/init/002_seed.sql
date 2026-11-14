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

-- Más preguntas de la Unidad 3 (La célula), para que una partida de trivia tenga 10 preguntas:
-- 2 de trivia por concepto y 5 de verdadero o falso. Los otros minijuegos quedan con las de arriba.
INSERT INTO preguntas (id, concepto_id, minijuego, enunciado, opciones, respuesta, explicacion) VALUES
  -- Trivia
  ('celula-p1', 'celula', 'trivia',
   '¿Cuál es la unidad básica de estructura y función de todos los seres vivos?',
   '["El átomo", "La célula", "El tejido", "El órgano"]', '"La célula"',
   'La célula es la unidad más pequeña con vida propia: todo ser vivo está formado por una o más células. Los tejidos y los órganos son conjuntos de células.'),
  ('celula-p2', 'celula', 'trivia',
   '¿Qué tiene una célula eucariota que no tiene una procariota?',
   '["Núcleo definido", "Membrana plasmática", "Ribosomas", "Material genético"]', '"Núcleo definido"',
   'Las eucariotas guardan el ADN dentro de un núcleo rodeado por una membrana. Las procariotas, como las bacterias, también tienen membrana, ribosomas y ADN, pero no tienen núcleo.'),
  ('fotosintesis-p2', 'fotosintesis', 'trivia',
   '¿Qué gas liberan las plantas durante la fotosíntesis?',
   '["Dióxido de carbono", "Oxígeno", "Nitrógeno", "Metano"]', '"Oxígeno"',
   'En la fotosíntesis la planta toma dióxido de carbono del aire y libera oxígeno. El dióxido de carbono es lo que absorbe, no lo que libera.'),
  ('fotosintesis-p3', 'fotosintesis', 'trivia',
   '¿Qué pigmento capta la energía de la luz para hacer la fotosíntesis?',
   '["Hemoglobina", "Melanina", "Clorofila", "Queratina"]', '"Clorofila"',
   'La clorofila está en los cloroplastos y absorbe la energía de la luz. Es también la que les da el color verde a las hojas.'),
  ('membrana-p2', 'membrana', 'trivia',
   '¿Cuál es la función principal de la membrana plasmática?',
   '["Fabricar proteínas", "Controlar qué sustancias entran y salen de la célula", "Guardar el ADN", "Producir energía"]',
   '"Controlar qué sustancias entran y salen de la célula"',
   'La membrana es selectiva: deja pasar algunas sustancias y frena otras. Las proteínas se fabrican en los ribosomas y la energía se obtiene en las mitocondrias.'),
  ('membrana-p3', 'membrana', 'trivia',
   '¿De qué está formada principalmente la membrana plasmática?',
   '["Una doble capa de lípidos con proteínas", "Celulosa", "Almidón", "ADN"]', '"Una doble capa de lípidos con proteínas"',
   'La membrana es una doble capa de fosfolípidos con proteínas incrustadas (modelo de mosaico fluido). La celulosa forma la pared celular de las plantas, no la membrana.'),
  ('organelas-p2', 'organelas', 'trivia',
   '¿En qué organela se obtiene la mayor parte de la energía (ATP) de la célula?',
   '["Mitocondria", "Aparato de Golgi", "Lisosoma", "Vacuola"]', '"Mitocondria"',
   'Las mitocondrias hacen la respiración celular: obtienen energía (ATP) a partir de la glucosa y el oxígeno. Por eso se las llama la "central de energía" de la célula.'),
  ('mitosis-p3', 'mitosis', 'trivia',
   '¿Cuántas células hijas se forman al terminar la mitosis (junto con la citocinesis)?',
   '["Una", "Dos", "Cuatro", "Ocho"]', '"Dos"',
   'La mitosis forma dos células hijas idénticas a la célula madre, con la misma cantidad de cromosomas. Las cuatro células hijas son el resultado de la meiosis, no de la mitosis.'),
  -- Verdadero o falso
  ('celula-p3', 'celula', 'verdadero_falso',
   'Todas las células tienen núcleo.',
   '["Verdadero", "Falso"]', '"Falso"',
   'Las células procariotas, como las bacterias, no tienen núcleo: su ADN está suelto en el citoplasma.'),
  ('mitosis-p4', 'mitosis', 'verdadero_falso',
   'Las células que se forman en la mitosis tienen la misma información genética que la célula madre.',
   '["Verdadero", "Falso"]', '"Verdadero"',
   'Antes de la mitosis el ADN se duplica y cada célula hija recibe una copia completa. Por eso son genéticamente iguales a la célula madre.'),
  ('organelas-p3', 'organelas', 'verdadero_falso',
   'Los ribosomas son las estructuras donde se fabrican las proteínas.',
   '["Verdadero", "Falso"]', '"Verdadero"',
   'Los ribosomas leen la información que llega del ADN (a través del ARN) y arman las proteínas. Pueden estar libres en el citoplasma o pegados al retículo endoplasmático.'),
  ('fotosintesis-p4', 'fotosintesis', 'verdadero_falso',
   'La fotosíntesis ocurre en las mitocondrias.',
   '["Verdadero", "Falso"]', '"Falso"',
   'La fotosíntesis ocurre en los cloroplastos. En las mitocondrias ocurre la respiración celular, que es casi el proceso inverso.');
