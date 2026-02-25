#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "${PROJECT_ROOT}"

if [[ ! -f ".env" ]]; then
  echo "Missing .env in ${PROJECT_ROOT}. Copy .env.example and fill required values first."
  exit 1
fi

echo "[deploy] Building application images"
docker compose -f "${COMPOSE_FILE}" build app gateway worker migrate

echo "[deploy] Validating compose configuration"
docker compose -f "${COMPOSE_FILE}" config >/dev/null

echo "[deploy] Applying Prisma migrations"
docker compose -f "${COMPOSE_FILE}" run --rm migrate

echo "[deploy] Starting app services"
docker compose -f "${COMPOSE_FILE}" up -d app gateway worker

echo "[deploy] Starting edge proxy"
docker compose -f "${COMPOSE_FILE}" up -d edge

echo "[deploy] Current service status"
docker compose -f "${COMPOSE_FILE}" ps

echo "[deploy] Pruning stale Docker cache and dangling images"
docker image prune -f || true
docker builder prune -f --filter "until=168h" || true
