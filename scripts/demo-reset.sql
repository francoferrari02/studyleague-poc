-- Solo entorno PoC: borra partidas y proyecciones, conserva usuarios/cursos/preguntas.
BEGIN;
TRUNCATE respuestas, partidas, outbox, eventos_procesados, notificaciones, analitica_concepto RESTART IDENTITY;
INSERT INTO analitica_concepto (curso_id, concepto_id, respuestas, aciertos, alerta_enviada) VALUES
 ('bio-2b', 'celula', 51, 42, false),
 ('bio-2b', 'fotosintesis', 47, 32, false),
 ('bio-2b', 'membrana', 38, 21, false),
 ('bio-2b', 'organelas', 30, 14, false),
 ('bio-2b', 'mitosis', 18, 6, true);
INSERT INTO notificaciones (event_id, docente_id, curso_id, concepto_id, mensaje)
 SELECT '00000000-0000-4000-8000-000000000001', docente_id, id, 'mitosis',
        'Biología · 2.º B: Mitosis tiene bajo dominio (33%)'
 FROM cursos WHERE id = 'bio-2b';
COMMIT;
