#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/protfolio}"
PROJECT_NAME="${PROJECT_NAME:-koinori}"
PROJECT_DIR="${DEPLOY_ROOT}/${PROJECT_NAME}"

if [[ "${DOCKER_SUDO:-false}" == "true" ]]; then
  DOCKER_CMD=(sudo docker)
else
  DOCKER_CMD=(docker)
fi

mkdir -p "${PROJECT_DIR}/shared/data"

cd "${PROJECT_DIR}"

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

"${DOCKER_CMD[@]}" compose up -d --build --remove-orphans
"${DOCKER_CMD[@]}" compose ps
