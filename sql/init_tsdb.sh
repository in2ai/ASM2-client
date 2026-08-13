#!/bin/sh
set -eu

: "${PG_HOST:=timescaledb}"
: "${PG_PORT:=5432}"
: "${PG_USER:=postgres}"
: "${PG_PASSWORD:=}"
: "${PG_DB:=tsdb}"

if [ -n "${LOGTO_POSTGRES_PASSWORD_FILE:-}" ]; then
  LOGTO_DB_PASSWORD="$(cat "$LOGTO_POSTGRES_PASSWORD_FILE")"
else
  : "${LOGTO_POSTGRES_PASSWORD:?LOGTO_POSTGRES_PASSWORD is required}"
  LOGTO_DB_PASSWORD="$LOGTO_POSTGRES_PASSWORD"
fi

echo "Waiting for PG PGWire on $PG_HOST:$PG_PORT ..."

# Wait until the TimescaleDB port responds
until pg_isready -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" >/dev/null 2>&1; do
  sleep 5
done

echo "TimescaleDB is reachable. Executing init_tsdb.sql ..."

export PGPASSWORD="$PG_PASSWORD"

echo "Creating the Logto role and database when missing ..."

psql -X -v ON_ERROR_STOP=1 \
  -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres \
  --set=logto_password="$LOGTO_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE logto LOGIN CREATEROLE PASSWORD %L', :'logto_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'logto')
\gexec

SELECT format('ALTER ROLE logto WITH LOGIN CREATEROLE PASSWORD %L', :'logto_password')
\gexec

SELECT 'CREATE DATABASE logto OWNER logto TEMPLATE template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'logto')
\gexec

ALTER DATABASE logto OWNER TO logto;
SQL

unset LOGTO_DB_PASSWORD

psql -X -v ON_ERROR_STOP=1 \
  -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" \
  -f init_tsdb.sql

echo "SQL applied successfully. Exiting."
