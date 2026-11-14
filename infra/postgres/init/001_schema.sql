-- Esquema mínimo de la prueba de concepto.
-- PostgreSQL (relacional, ACID) guarda lo que necesita integridad: cursos, preguntas y partidas.
-- El ranking vive en Redis; la analítica usa la tabla agregada analitica_concepto.

-- pgcrypto: el seed genera los hashes bcrypt de las claves de prueba con crypt(..., gen_salt('bf')).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE escuelas (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL
);

CREATE TABLE docentes (
  id          TEXT PRIMARY KEY,
  escuela_id  TEXT NOT NULL REFERENCES escuelas(id),
  nombre      TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  usuario     TEXT NOT NULL UNIQUE,
  clave_hash  TEXT NOT NULL                    -- bcrypt ($2a$); la API compara con bcryptjs
);

CREATE TABLE alumnos (
  id          TEXT PRIMARY KEY,
  escuela_id  TEXT NOT NULL REFERENCES escuelas(id),
  -- Por privacidad, en pantallas se muestra solo nombre + inicial del apellido.
  nombre_visible TEXT NOT NULL,
  usuario     TEXT NOT NULL UNIQUE,
  clave_hash  TEXT NOT NULL                    -- bcrypt ($2a$); la API compara con bcryptjs
);

CREATE TABLE cursos (
  id             TEXT PRIMARY KEY,
  docente_id     TEXT NOT NULL REFERENCES docentes(id),
  nombre         TEXT NOT NULL,
  codigo         CHAR(6) NOT NULL UNIQUE,
  dias_juego     SMALLINT[] NOT NULL,          -- 1 = lunes ... 7 = domingo
  reinicio       TEXT NOT NULL DEFAULT 'semanal' CHECK (reinicio IN ('semanal', 'mensual')),
  minijuegos     TEXT[] NOT NULL
);

CREATE TABLE inscripciones (
  curso_id    TEXT NOT NULL REFERENCES cursos(id),
  alumno_id   TEXT NOT NULL REFERENCES alumnos(id),
  PRIMARY KEY (curso_id, alumno_id)
);

CREATE TABLE conceptos (
  id          TEXT PRIMARY KEY,
  curso_id    TEXT NOT NULL REFERENCES cursos(id),
  nombre      TEXT NOT NULL
);

CREATE TABLE preguntas (
  id            TEXT PRIMARY KEY,
  concepto_id   TEXT NOT NULL REFERENCES conceptos(id),
  minijuego     TEXT NOT NULL,
  enunciado     TEXT NOT NULL,
  opciones      JSONB NOT NULL DEFAULT '[]',
  respuesta     JSONB NOT NULL,
  explicacion   TEXT NOT NULL                 -- la ve el alumno cuando se equivoca (A7)
);

CREATE TABLE partidas (
  id            UUID PRIMARY KEY,
  curso_id      TEXT NOT NULL REFERENCES cursos(id),
  alumno_id     TEXT NOT NULL REFERENCES alumnos(id),
  minijuego     TEXT NOT NULL,
  puntaje       INTEGER NOT NULL,
  finalizada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE respuestas (
  partida_id    UUID NOT NULL REFERENCES partidas(id),
  pregunta_id   TEXT NOT NULL REFERENCES preguntas(id),
  correcta      BOOLEAN NOT NULL,
  tiempo_ms     INTEGER NOT NULL,
  PRIMARY KEY (partida_id, pregunta_id)
);

-- Transactional outbox: la partida y su evento se guardan en la misma transacción.
CREATE TABLE outbox (
  event_id      UUID PRIMARY KEY,
  topic         TEXT NOT NULL,
  clave         TEXT NOT NULL,
  payload       JSONB NOT NULL,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  publicado_en  TIMESTAMPTZ
);
CREATE INDEX outbox_pendientes ON outbox (creado_en) WHERE publicado_en IS NULL;

-- Idempotencia de los consumidores que escriben en PostgreSQL.
CREATE TABLE eventos_procesados (
  consumidor    TEXT NOT NULL,
  event_id      UUID NOT NULL,
  procesado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (consumidor, event_id)
);

-- Tabla agregada que mantiene analitica-consumer.
CREATE TABLE analitica_concepto (
  curso_id        TEXT NOT NULL REFERENCES cursos(id),
  concepto_id     TEXT NOT NULL REFERENCES conceptos(id),
  respuestas      INTEGER NOT NULL DEFAULT 0,
  aciertos        INTEGER NOT NULL DEFAULT 0,
  alerta_enviada  BOOLEAN NOT NULL DEFAULT false,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (curso_id, concepto_id)
);

CREATE TABLE notificaciones (
  id          BIGSERIAL PRIMARY KEY,
  event_id    UUID NOT NULL UNIQUE,
  docente_id  TEXT NOT NULL REFERENCES docentes(id),
  curso_id    TEXT NOT NULL REFERENCES cursos(id),
  concepto_id TEXT NOT NULL REFERENCES conceptos(id),
  mensaje     TEXT NOT NULL,
  leida       BOOLEAN NOT NULL DEFAULT false,
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
