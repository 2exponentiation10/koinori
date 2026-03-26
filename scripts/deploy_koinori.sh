#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/protfolio}"
PROJECT_NAME="${PROJECT_NAME:-koinori}"
PROJECT_DIR="${DEPLOY_ROOT}/${PROJECT_NAME}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${DOCKER_SUDO:-false}" == "true" ]]; then
  DOCKER_CMD=(sudo docker)
else
  DOCKER_CMD=(docker)
fi

mkdir -p "${PROJECT_DIR}/data"

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required on the deployment server."
  exit 1
fi

rsync -a --delete \
  --exclude ".git" \
  --exclude ".github" \
  --exclude ".env" \
  --exclude "shared/" \
  --exclude "node_modules" \
  --exclude "data/*.db" \
  --exclude "data/*.db-*" \
  --exclude ".idea" \
  --exclude ".vscode" \
  "${REPO_ROOT}/" "${PROJECT_DIR}/"

cd "${PROJECT_DIR}"

"${DOCKER_CMD[@]}" compose up -d --build --remove-orphans
"${DOCKER_CMD[@]}" compose ps
