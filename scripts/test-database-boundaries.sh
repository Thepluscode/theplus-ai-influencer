#!/bin/sh
set -eu

container="theplus-db-boundaries-$$"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run --rm -d \
  --name "$container" \
  -e POSTGRES_PASSWORD=postgres \
  -v "$(pwd):/repo:ro" \
  postgres:16 >/dev/null

attempt=0
until docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Postgres test container did not become ready" >&2
    exit 1
  fi
  sleep 1
done

docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -f /repo/scripts/sql/database-boundaries.sql
