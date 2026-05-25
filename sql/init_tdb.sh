#!/bin/sh
set -eu

: "${PG_HOST:=PG}"
: "${PG_PORT:=8812}"
: "${PG_USER:=admin}"
: "${PG_PASSWORD:=quest}"
: "${PG_DB:=qdb}"

echo "Waiting for PG PGWire on $PG_HOST:$PG_PORT ..."

# Wait until the TimescaleDB port responds
until pg_isready -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" >/dev/null 2>&1; do
  sleep 5
done

echo "TimescaleDB is reachable. Executing init.sql ..."

export PGPASSWORD="$PG_PASSWORD"

psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -f init.sql

echo "SQL applied successfully. Exiting."
