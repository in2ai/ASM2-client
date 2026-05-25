#!/bin/sh
set -eu

: "${PG_HOST:=timescaledb}"
: "${PG_PORT:=5432}"
: "${PG_USER:=postgres}"
: "${PG_PASSWORD:=}"
: "${PG_DB:=tsdb}"

echo "Waiting for PG PGWire on $PG_HOST:$PG_PORT ..."

# Wait until the TimescaleDB port responds
until pg_isready -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" >/dev/null 2>&1; do
  sleep 5
done

echo "TimescaleDB is reachable. Executing init_tsdb.sql ..."

export PGPASSWORD="$PG_PASSWORD"

psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -f init_tsdb.sql

echo "SQL applied successfully. Exiting."
