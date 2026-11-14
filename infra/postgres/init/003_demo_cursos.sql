-- Cursos adicionales de A3/D2; solo datos y aplicación idempotente sobre bases existentes.
BEGIN;
INSERT INTO docentes (id, escuela_id, nombre, email, usuario, clave_hash)
VALUES ('doc-demo', 'esc-12', 'Docente de demo', 'demo@escuela12.edu.ar', 'docente.demo', crypt('docente123',gen_salt('bf')))
ON CONFLICT DO NOTHING;
INSERT INTO cursos (id,docente_id,nombre,codigo,dias_juego,reinicio,minijuegos) VALUES
 ('bio-3a','doc-laura','Biología · 3.º A','BIO3AX','{4}','semanal','{}'),
 ('naturales-1c','doc-laura','Ciencias Naturales · 1.º C','NAT2CX','{2}','semanal','{}'),
 ('historia-2b','doc-demo','Historia · 2.º B','HIS2BX','{4}','semanal','{}'),
 ('matematica-2b','doc-demo','Matemática · 2.º B','MAT2BX','{5}','semanal','{}')
ON CONFLICT DO NOTHING;
INSERT INTO inscripciones (curso_id,alumno_id) VALUES ('historia-2b','alu-01'),('matematica-2b','alu-01')
ON CONFLICT DO NOTHING;
COMMIT;
