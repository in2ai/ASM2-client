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
    word SYMBOL        -- the topic being counted
) TIMESTAMP(ts) PARTITION BY DAY;

CREATE TABLE IF NOT EXISTS user_activity (
    ts TIMESTAMP,        -- event timestamp
    user_id SYMBOL,       -- user identifier
    user_role SYMBOL
) TIMESTAMP(ts) PARTITION BY DAY;