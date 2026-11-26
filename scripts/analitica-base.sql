-- Contadores de partida de la demo para Biología · 2.º B (los de los mockups, salvo tres:
-- Organelas 8/19 (42 %) cae a 8/21 (38 %) si Tomás falla sus dos preguntas y dispara el aviso;
-- Membrana 10/22 (45 %) baja a 10/24 (42 %) en el mismo caso, pero queda sobre el umbral;
-- Mitosis 6/20 (30 %) sigue bajo el umbral aunque Tomás acierte sus dos preguntas (8/22, 36 %)).
-- Representan el historial anterior a la ventana de retención de Kafka: un "snapshot".
-- Lo usan demo-reset.sh y replay.sh (snapshot + reproducción del log = estado completo).
INSERT INTO analitica_concepto (curso_id, concepto_id, respuestas, aciertos, alerta_enviada) VALUES
 ('bio-2b', 'celula', 51, 42, false),
 ('bio-2b', 'fotosintesis', 47, 32, false),
 ('bio-2b', 'membrana', 22, 10, false),
 ('bio-2b', 'organelas', 19, 8, false),
 ('bio-2b', 'mitosis', 20, 6, true);
