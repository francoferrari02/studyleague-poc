-- Contadores de partida de la demo para Biología · 2.º B (los de los mockups, salvo Organelas:
-- 13/31 la deja a una partida del umbral, para que Tomás dispare el aviso fallando sus dos preguntas).
-- Representan el historial anterior a la ventana de retención de Kafka: un "snapshot".
-- Lo usan demo-reset.sh y replay.sh (snapshot + reproducción del log = estado completo).
INSERT INTO analitica_concepto (curso_id, concepto_id, respuestas, aciertos, alerta_enviada) VALUES
 ('bio-2b', 'celula', 51, 42, false),
 ('bio-2b', 'fotosintesis', 47, 32, false),
 ('bio-2b', 'membrana', 38, 21, false),
 ('bio-2b', 'organelas', 31, 13, false),
 ('bio-2b', 'mitosis', 18, 6, true);
