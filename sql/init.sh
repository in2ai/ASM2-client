#!/bin/sh
set -eu

: "${QUESTDB_HOST:=questdb}"
: "${QUESTDB_PORT:=8812}"
: "${QUESTDB_USER:=admin}"
: "${QUESTDB_PASSWORD:=quest}"
: "${QUESTDB_DB:=qdb}"

echo "Waiting for QuestDB PGWire on $QUESTDB_HOST:$QUESTDB_PORT ..."

# Wait until the PG port responds
until pg_isready -h "$QUESTDB_HOST" -p "$QUESTDB_PORT" -U "$QUESTDB_USER" >/dev/null 2>&1; do
  sleep 5
done

echo "QuestDB is reachable. Executing init.sql ..."

export PGPASSWORD="$QUESTDB_PASSWORD"

psql -h "$QUESTDB_HOST" -p "$QUESTDB_PORT" -U "$QUESTDB_USER" -d "$QUESTDB_DB" -f init.sql

echo "SQL applied successfully. Exiting."