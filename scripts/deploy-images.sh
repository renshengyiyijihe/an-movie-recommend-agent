#!/usr/bin/env bash
# Image build + compose up on the deploy host. Called by .github/workflows/deploy.yml
# after `git reset --hard origin/main`.
#
# Speed: skip `docker compose build` when that image's source paths did not change
# since the last successful deploy. A cache-hit build still re-uploads context
# (compose context is repo root); the only way not to pay that is not to call it.
#
# Intentionally not done:
# - compose down / rm the running stack
# - COMPOSE_BAKE (server BuildKit is too old)
# - multiple services in one `compose build` (Bake off → still per-service
#   context upload, and compose may build them in parallel and OOM)
# - recover last sha from image RepoTags (order is not a source of truth)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}"
export COMPOSE_DOCKER_CLI_BUILD="${COMPOSE_DOCKER_CLI_BUILD:-1}"
export COMPOSE_BAKE="${COMPOSE_BAKE:-false}"
export COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-1}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-an-movie}"

LAST_SHA_FILE="${ROOT}/.last-deploy-sha"
CURRENT_SHA="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short=12 HEAD)"

log() {
  echo "$(date '+%F %T') $*"
}

is_commit() {
  git cat-file -e "$1^{commit}" 2>/dev/null
}

# True when any pathspec differs. git diff errors are treated as "changed".
paths_changed() {
  ! git diff --quiet "$LAST_SHA" "$CURRENT_SHA" -- "$@"
}

need_packages=0
need_auth=0
need_movie=0
need_message=0
need_frontend=0

LAST_SHA=""
if [ -s "$LAST_SHA_FILE" ]; then
  LAST_SHA="$(tr -d '[:space:]' < "$LAST_SHA_FILE")"
  if ! is_commit "$LAST_SHA"; then
    log "Ignoring ${LAST_SHA_FILE}: not a commit in this clone (${LAST_SHA})"
    LAST_SHA=""
  fi
fi

if [ -z "$LAST_SHA" ]; then
  log "No last successful deploy sha; building all images"
  need_packages=1
  need_auth=1
  need_movie=1
  need_message=1
  need_frontend=1
else
  log "Planning image builds since ${LAST_SHA}"
  git diff --name-only "$LAST_SHA" "$CURRENT_SHA" || true

  if paths_changed packages .dockerignore docker-compose.yml; then
    log "packages / .dockerignore / docker-compose.yml changed → packages + all apps"
    need_packages=1
    need_auth=1
    need_movie=1
    need_message=1
    need_frontend=1
  fi
  if paths_changed backend/proto; then
    log "backend/proto changed → auth + movie + message"
    need_auth=1
    need_movie=1
    need_message=1
  fi
  if paths_changed backend/auth-service; then
    log "backend/auth-service changed"
    need_auth=1
  fi
  if paths_changed backend/movie-service; then
    log "backend/movie-service changed"
    need_movie=1
  fi
  if paths_changed backend/message-service; then
    log "backend/message-service changed"
    need_message=1
  fi
  if paths_changed client; then
    log "client changed"
    need_frontend=1
  fi
fi

log "plan packages=${need_packages} auth=${need_auth} movie=${need_movie} message=${need_message} frontend=${need_frontend}"
if [ "$need_packages$need_auth$need_movie$need_message$need_frontend" = "00000" ]; then
  log "No image sources changed; skipping docker compose build"
fi

tag_built() {
  local svc="$1"
  if [ "$svc" = packages ]; then
    docker tag an-movie-packages "an-movie-packages:${SHORT_SHA}"
    return
  fi
  if docker image inspect "an-movie-${svc}:latest" >/dev/null 2>&1; then
    docker tag "an-movie-${svc}:latest" "an-movie-${svc}:${SHORT_SHA}"
  else
    docker tag "an-movie-${svc}" "an-movie-${svc}:${SHORT_SHA}"
  fi
}

build_and_tag() {
  local svc="$1"
  log "docker compose build ${svc}"
  docker compose build "$svc"
  tag_built "$svc"
}

if [ "$need_packages" -eq 1 ]; then
  build_and_tag packages
fi

# Serial on purpose. See file header.
if [ "$need_auth" -eq 1 ]; then
  build_and_tag auth-service
fi
if [ "$need_movie" -eq 1 ]; then
  build_and_tag movie-service
fi
if [ "$need_message" -eq 1 ]; then
  build_and_tag message-service
fi
if [ "$need_frontend" -eq 1 ]; then
  build_and_tag frontend
fi

log "docker compose up -d --remove-orphans"
docker compose up -d --remove-orphans

printf '%s\n' "$CURRENT_SHA" > "$LAST_SHA_FILE"
log "Recorded last successful deploy ${CURRENT_SHA}"
