#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "${PROJECT_ROOT}"

if [[ ! -f ".env" ]]; then
  echo "Missing .env in ${PROJECT_ROOT}. Copy .env.example and fill required values first."
  exit 1
fi

prune_docker_artifacts() {
  local stage="$1"
  echo "[deploy] Docker cleanup (${stage})"
  docker container prune -f || true
  docker image prune -a -f || true
  docker builder prune -a -f || true
  docker network prune -f || true
}

echo "[deploy] Validating compose configuration"
docker compose -f "${COMPOSE_FILE}" config >/dev/null

prune_docker_artifacts "before-build"

echo "[deploy] Building application images"
docker compose -f "${COMPOSE_FILE}" build app gateway worker migrate

echo "[deploy] Applying Prisma migrations"
docker compose -f "${COMPOSE_FILE}" run --rm migrate

echo "[deploy] Starting app services"
docker compose -f "${COMPOSE_FILE}" up -d app gateway worker

echo "[deploy] Starting edge proxy"
docker compose -f "${COMPOSE_FILE}" up -d edge

echo "[deploy] Current service status"
docker compose -f "${COMPOSE_FILE}" ps

prune_docker_artifacts "after-deploy"
