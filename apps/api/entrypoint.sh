#!/bin/sh
# Production entrypoint for apps/api.
#
# Runs Alembic migrations before starting the server. Railway's healthcheck
# won't pass until the server binds on $PORT, so migration failures surface
# immediately as a failed deploy rather than a runtime crash.
set -e

echo "[entrypoint] Running database migrations..."
python -m alembic upgrade head

echo "[entrypoint] Starting API server..."
exec python -m uvicorn apps.api.main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --workers 2 \
    --no-access-log
