----------------------------
-- Metrics
----------------------------

CREATE TABLE IF NOT EXISTS metrics (
    ts TIMESTAMP,
    user_id SYMBOL,
    user_role SYMBOL,
    tag SYMBOL,        -- string identifier for the metric
    value DOUBLE       -- float metric value
) TIMESTAMP(ts) PARTITION BY DAY;

CREATE TABLE IF NOT EXISTS word_counts (
    ts TIMESTAMP,      -- timestamp of the count update
    lang SYMBOL,
    user_id SYMBOL,
    user_role SYMBOL,
    word SYMBOL        -- the word being counted
) TIMESTAMP(ts) PARTITION BY DAY;

CREATE TABLE IF NOT EXISTS topic_counts (
    ts TIMESTAMP,      -- timestamp of the count update
    user_id SYMBOL,
    user_role SYMBOL,
    word SYMBOL,       -- the topic being counted
    topic_id SYMBOL    -- numeric topic index as string
) TIMESTAMP(ts) PARTITION BY DAY;

CREATE TABLE IF NOT EXISTS topic_intl (
    ts TIMESTAMP,
    topic_id SYMBOL,
    word SYMBOL,
    lang SYMBOL
) TIMESTAMP(ts) PARTITION BY DAY;

CREATE TABLE IF NOT EXISTS user_activity (
    ts TIMESTAMP,         -- event timestamp
    user_id SYMBOL,       -- user identifier
    user_role SYMBOL
) TIMESTAMP(ts) PARTITION BY DAY;

----------------------------
-- Authentication
----------------------------

CREATE TABLE IF NOT EXISTS credentials (
  user_id SYMBOL,
  source SYMBOL,            -- 'GDrive', 'Dropbox'...
  credentials VARCHAR,      -- JSON with arbitrary fields depending on source
  issued_at TIMESTAMP,
  needs_refresh_at TIMESTAMP,
  expires_at TIMESTAMP,
  is_admin BOOLEAN
) timestamp(issued_at) PARTITION BY HOUR;