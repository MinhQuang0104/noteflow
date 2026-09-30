#!/usr/bin/env bash

set -euo pipefail

mkdir -p \
  /workspace/backend/storage/app \
  /workspace/backend/storage/framework/cache/data \
  /workspace/backend/storage/framework/sessions \
  /workspace/backend/storage/framework/views \
  /workspace/backend/storage/logs \
  /workspace/backend/bootstrap/cache

composer install --no-interaction --prefer-dist --no-progress

exec "$@"
