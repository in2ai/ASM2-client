-- Activate TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create chat and message tables in DB (previously SQLite)
CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    status TEXT,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_chats_user_updated
    ON chats(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_created
    ON messages(chat_id, created_at ASC);


-- Create metric tables (previously QuestDB)
CREATE TABLE IF NOT EXISTS metrics (
    ts TIMESTAMPTZ NOT NULL,
    user_id TEXT,
    user_role TEXT,
    tag TEXT,
    value DOUBLE PRECISION
  );

CREATE TABLE IF NOT EXISTS word_counts (
    ts TIMESTAMPTZ NOT NULL,
    lang TEXT,
    user_id TEXT,
    user_role TEXT,
    word TEXT
    );

CREATE TABLE IF NOT EXISTS topic_counts (
    ts TIMESTAMPTZ NOT NULL,
    user_id TEXT,
    user_role TEXT,
    word TEXT,
    topic_id TEXT
    );

CREATE TABLE IF NOT EXISTS topic_intl (
    ts TIMESTAMPTZ NOT NULL,
    topic_id TEXT,
    word TEXT,
    lang TEXT
    );

CREATE TABLE IF NOT EXISTS user_activity (
    ts TIMESTAMPTZ NOT NULL,
    user_id TEXT,
    user_role TEXT
    );

SELECT create_hypertable('metrics', 'ts', if_not_exists => TRUE);
SELECT create_hypertable('word_counts', 'ts', if_not_exists => TRUE);
SELECT create_hypertable('topic_counts','ts', if_not_exists => TRUE);
SELECT create_hypertable('topic_intl', 'ts', if_not_exists => TRUE);
SELECT create_hypertable('user_activity', 'ts', if_not_exists => TRUE);

ALTER TABLE metrics SET (timescaledb.compress, timescaledb.compress_segmentby='tag,user_id');
ALTER TABLE word_counts SET (timescaledb.compress, timescaledb.compress_segmentby='lang,user_id');
ALTER TABLE topic_counts SET (timescaledb.compress, timescaledb.compress_segmentby='topic_id,user_id');
ALTER TABLE topic_intl SET (timescaledb.compress, timescaledb.compress_segmentby='topic_id,lang');
ALTER TABLE user_activity SET (timescaledb.compress, timescaledb.compress_segmentby='user_id');

SELECT add_compression_policy('metrics', INTERVAL '7 days');
SELECT add_compression_policy('word_counts', INTERVAL '7 days');
SELECT add_compression_policy('topic_counts', INTERVAL '7 days');
SELECT add_compression_policy('topic_intl', INTERVAL '7 days');
SELECT add_compression_policy('user_activity', INTERVAL '7 days');

-- (Optional) auto-delete chunks older than 180 days. Disabled
-- SELECT add_retention_policy('metrics', INTERVAL '180 days');

-- Create credential tables

CREATE TABLE IF NOT EXISTS credentials (
    user_id TEXT,
    source TEXT,
    credentials TEXT,
    issued_at TIMESTAMPTZ NOT NULL,
    needs_refresh_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_admin BOOLEAN
    );

CREATE TABLE IF NOT EXISTS source_preferences (
    user_id TEXT,
    selected_sources TEXT,
    updated_at TIMESTAMPTZ NOT NULL
    );

CREATE INDEX IF NOT EXISTS idx_credentials_user_source_issued
    ON credentials (user_id, source, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_preferences_user_updated
    ON source_preferences (user_id, updated_at DESC);

-- Global indexing deletion guard and persistent alerts for managers/admins

CREATE TABLE IF NOT EXISTS indexing_deletion_guard (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    threshold_percentage DOUBLE PRECISION
        CHECK (threshold_percentage >= 1 AND threshold_percentage <= 100)
);

INSERT INTO indexing_deletion_guard (
    id
)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS indexing_alerts (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    deleted_documents INTEGER NOT NULL CHECK (deleted_documents > 0),
    total_documents INTEGER NOT NULL CHECK (total_documents > 0),
    percentage DOUBLE PRECISION NOT NULL CHECK (percentage > 0 AND percentage <= 100),
    threshold_percentage DOUBLE PRECISION NOT NULL
        CHECK (threshold_percentage >= 1 AND threshold_percentage <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
