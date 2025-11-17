CREATE TABLE IF NOT EXISTS metrics (
    ts TIMESTAMP,
    tag SYMBOL,        -- string identifier for the metric
    value DOUBLE       -- float metric value
) TIMESTAMP(ts) PARTITION BY DAY;

CREATE TABLE IF NOT EXISTS word_counts (
    ts TIMESTAMP,      -- timestamp of the count update
    word SYMBOL        -- the word being counted
) TIMESTAMP(ts) PARTITION BY DAY;

CREATE TABLE IF NOT EXISTS topic_counts (
    ts TIMESTAMP,      -- timestamp of the count update
    word SYMBOL        -- the topic being counted
) TIMESTAMP(ts) PARTITION BY DAY;

CREATE TABLE IF NOT EXISTS user_activity (
    ts TIMESTAMP,        -- event timestamp
    user_id SYMBOL       -- user identifier
) TIMESTAMP(ts) PARTITION BY DAY;

CREATE TABLE IF NOT EXISTS requests (
    ts TIMESTAMP,
    user_id SYMBOL,
    endpoint SYMBOL,
    method SYMBOL,
    status INT,
    latency DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY;
