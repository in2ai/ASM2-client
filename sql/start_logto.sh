#!/bin/sh
set -eu

: "${LOGTO_DB_HOST:=timescaledb}"
: "${LOGTO_DB_PORT:=5432}"
: "${LOGTO_DB_NAME:=logto}"
: "${LOGTO_DB_USER:=logto}"

if [ -n "${LOGTO_POSTGRES_PASSWORD_FILE:-}" ]; then
  LOGTO_DB_PASSWORD="$(cat "$LOGTO_POSTGRES_PASSWORD_FILE")"
else
  : "${LOGTO_POSTGRES_PASSWORD:?LOGTO_POSTGRES_PASSWORD is required}"
  LOGTO_DB_PASSWORD="$LOGTO_POSTGRES_PASSWORD"
fi

export LOGTO_DB_HOST LOGTO_DB_PORT LOGTO_DB_NAME LOGTO_DB_USER LOGTO_DB_PASSWORD
export DB_URL="$(node <<'NODE'
const url = new URL('postgres://localhost');
url.hostname = process.env.LOGTO_DB_HOST;
url.port = process.env.LOGTO_DB_PORT;
url.pathname = process.env.LOGTO_DB_NAME;
url.username = process.env.LOGTO_DB_USER;
url.password = process.env.LOGTO_DB_PASSWORD;
process.stdout.write(url.toString());
NODE
)"

unset LOGTO_DB_PASSWORD LOGTO_POSTGRES_PASSWORD

npm run cli db seed -- --swe
exec npm start
