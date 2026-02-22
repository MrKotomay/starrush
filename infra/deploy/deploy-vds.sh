#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "${PROJECT_ROOT}"

if [[ ! -f ".env" ]]; then
  echo "Missing .env in ${PROJECT_ROOT}. Copy .env.example and fill required values first."
  exit 1
fi

wait_for_healthy() {
  local service="$1"
  local timeout_sec="${2:-120}"
  local start_ts now_ts elapsed container_id state

  container_id="$(docker compose -f "${COMPOSE_FILE}" ps -q "${service}")"
  if [[ -z "${container_id}" ]]; then
    echo "[deploy] Service ${service} container not found."
    return 1
  fi

  start_ts="$(date +%s)"
  while true; do
    state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}")"
    if [[ "${state}" == "healthy" || "${state}" == "running" ]]; then
      echo "[deploy] Service ${service} is ${state}"
      return 0
    fi

    now_ts="$(date +%s)"
    elapsed="$((now_ts - start_ts))"
    if (( elapsed > timeout_sec )); then
      echo "[deploy] Timeout waiting for ${service}. Current state: ${state}"
      docker compose -f "${COMPOSE_FILE}" logs --tail 120 "${service}" || true
      return 1
    fi
    sleep 2
  done
}

echo "[deploy] Building application images"
docker compose -f "${COMPOSE_FILE}" build app gateway worker migrate

echo "[deploy] Starting stateful services"
docker compose -f "${COMPOSE_FILE}" up -d postgres redis

wait_for_healthy postgres 180
wait_for_healthy redis 120

echo "[deploy] Applying Prisma migrations"
docker compose -f "${COMPOSE_FILE}" run --rm migrate

echo "[deploy] Starting app services"
docker compose -f "${COMPOSE_FILE}" up -d app gateway worker

echo "[deploy] Starting edge proxy"
docker compose -f "${COMPOSE_FILE}" up -d edge

echo "[deploy] Current service status"
docker compose -f "${COMPOSE_FILE}" ps
