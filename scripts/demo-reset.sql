-- Solo entorno PoC: borra partidas y proyecciones, conserva usuarios/cursos/preguntas.
-- demo-reset.sh lo ejecuta junto con analitica-base.sql en una sola transacción.
TRUNCATE respuestas, partidas, outbox, eventos_procesados, notificaciones, analitica_concepto, analitica_respuestas_base RESTART IDENTITY;
INSERT INTO notificaciones (event_id, docente_id, curso_id, concepto_id, mensaje)
 SELECT '00000000-0000-4000-8000-000000000001', docente_id, id, 'mitosis',
        'Biología · 2.º B: Mitosis tiene bajo dominio (30%)'
 FROM cursos WHERE id = 'bio-2b';
