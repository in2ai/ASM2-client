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
CREATE TABLE metrics (
  ts TIMESTAMPTZ NOT NULL,
  user_id TEXT,
  user_role TEXT,
  tag TEXT,
  value DOUBLE PRECISION
  );

CREATE TABLE  word_counts (
    ts TIMESTAMPZ NOT NULL,
    lang TEXT,
    user_id TEXT,
    user_role TEXT,
    word TEXT
);

SELECT create_hypertable('metrics','ts');

ALTER TABLE metrics SET (timescaledb.compress,
  timescaledb.compress_segmentby='tag,user_id');

SELECT add_compression_policy('metrics', INTERVAL '7 days');

-- (Optional) auto-delete chunks older than 180 days. Disabled
-- SELECT add_retention_policy('metrics', INTERVAL '180 days');
