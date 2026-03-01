#!/usr/bin/env bash
set -euo pipefail

BRANCH="${DEPLOY_BRANCH:-main}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "${PROJECT_ROOT}"

echo "[deploy] Updating repository branch ${BRANCH}"
git fetch --prune origin "${BRANCH}"
git reset --hard
git clean -fd -e .env
git checkout -B "${BRANCH}" "origin/${BRANCH}"
git branch --set-upstream-to="origin/${BRANCH}" "${BRANCH}" || true

bash infra/deploy/deploy-vds.sh
