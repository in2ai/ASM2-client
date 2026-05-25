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
