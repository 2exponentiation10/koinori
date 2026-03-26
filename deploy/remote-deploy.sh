#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/protfolio/koinori}"
RELEASE_ARCHIVE="${RELEASE_ARCHIVE:-/tmp/koinori.tgz}"
ENV_FILE="${ENV_FILE:-/tmp/koinori.env}"

mkdir -p "$APP_DIR/shared/data"

find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name shared -exec rm -rf {} +
tar -xzf "$RELEASE_ARCHIVE" -C "$APP_DIR"
mv "$ENV_FILE" "$APP_DIR/.env"

cd "$APP_DIR"
bash scripts/deploy_koinori.sh
docker image prune -f
