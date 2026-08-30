#!/usr/bin/env bash
# Image build + compose up on the deploy host. Called by .github/workflows/deploy.yml
# after `git reset --hard origin/main`.
#
# Speed: skip `docker compose build` when that image's source paths did not change
# since the last successful deploy. A cache-hit build still re-uploads context
# (compose context is repo root); the only way not to pay that is not to call it.
#
# Image plan (OR of all matches):
#   packages/contracts, packages/Dockerfile, .dockerignore
#     → packages + auth + movie + message + frontend
#       (every app Dockerfile builds contracts from source)
#   packages/auth-client
#     → packages + auth + movie + message
#       (frontend does not COPY auth-client source)
#   any other packages/*
#     → packages + all apps
#   docker-compose.yml `build:` / `image:` of packages
#     → packages + all apps
#   docker-compose.yml `build:` / `image:` of one app
#     → that app
#   Grafana / Prometheus / env / ports / volumes / healthchecks
#     → no image rebuild, just `up -d`
#
# After a packages-source change, app builds use --no-cache so the inlined
# packages stage is not reused from a stale layer.
#
# App Dockerfiles must FROM node:24-alpine and build packages from source.
# FROM an-movie-packages or FROM sha256:… both become docker.io/library/…
# and the deploy-host mirror (docker.m.daocloud.io) 403s unofficial names.
# Do not FROM a local image. Do not use additional_contexts (old BuildKit).
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
COMPOSE_TARGETS_PY="${ROOT}/scripts/compose-image-targets.py"
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

reset_plan() {
  need_packages=0
  need_auth=0
  need_movie=0
  need_message=0
  need_frontend=0
}

mark_all_apps() {
  need_packages=1
  need_auth=1
  need_movie=1
  need_message=1
  need_frontend=1
}

plan_digits() {
  printf '%s%s%s%s%s' "$need_packages" "$need_auth" "$need_movie" "$need_message" "$need_frontend"
}

python_bin() {
  local candidate
  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 \
      && "$candidate" -c "import sys" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

compose_image_targets() {
  local py
  py="$(python_bin)" || return 1
  "$py" "$COMPOSE_TARGETS_PY" "$LAST_SHA" "$CURRENT_SHA"
}

apply_packages_source_plan() {
  if paths_changed packages/contracts packages/Dockerfile; then
    log "packages/contracts or packages/Dockerfile changed → packages + all apps"
    mark_all_apps
    return
  fi
  if paths_changed packages/auth-client; then
    log "packages/auth-client changed → packages + auth + movie + message"
    need_packages=1
    need_auth=1
    need_movie=1
    need_message=1
    return
  fi
  if paths_changed packages; then
    log "packages/ changed → packages + all apps"
    mark_all_apps
  fi
}

apply_compose_image_plan() {
  local targets
  if ! targets="$(compose_image_targets)"; then
    log "ERROR cannot diff compose image specs (need a working python3/python)"
    return 1
  fi
  if [ -z "$targets" ]; then
    log "docker-compose.yml changed (runtime only) → skip image rebuild"
    return
  fi
  log "docker-compose.yml image spec changed → ${targets}"
  for svc in $targets; do
    case "$svc" in
      packages) mark_all_apps ;;
      auth-service) need_auth=1 ;;
      movie-service) need_movie=1 ;;
      message-service) need_message=1 ;;
      frontend) need_frontend=1 ;;
      *)
        log "Unknown compose build target ${svc} → packages + all apps"
        mark_all_apps
        ;;
    esac
  done
}

compute_plan_from_diff() {
  reset_plan
  if [ -z "$LAST_SHA" ]; then
    log "No last successful deploy sha; building all images"
    mark_all_apps
    return
  fi
  log "Planning image builds since ${LAST_SHA}"
  git diff --name-only "$LAST_SHA" "$CURRENT_SHA" || true

  if paths_changed .dockerignore; then
    log ".dockerignore changed → packages + all apps"
    mark_all_apps
  fi
  apply_packages_source_plan
  if paths_changed docker-compose.yml; then
    apply_compose_image_plan
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
}

log_plan() {
  log "plan packages=${need_packages} auth=${need_auth} movie=${need_movie} message=${need_message} frontend=${need_frontend}"
  if [ "$(plan_digits)" = "00000" ]; then
    log "No image sources changed; skipping docker compose build"
  fi
}

expect_eq() {
  local name="$1" got="$2" want="$3"
  if [ "$got" != "$want" ]; then
    echo "FAIL ${name}: expected ${want} got ${got}" >&2
    return 1
  fi
  echo "OK ${name} = ${want}"
}

run_self_test() {
  local py failed=0 targets
  py="$(python_bin)" || {
    echo "FAIL no python3/python" >&2
    return 1
  }
  "$py" "$COMPOSE_TARGETS_PY" --self-test || failed=1

  LAST_SHA="$(git rev-parse 848b7553b0c3)"
  CURRENT_SHA="$(git rev-parse 987f4b2a2c9b)"
  if ! targets="$(compose_image_targets)"; then
    echo "FAIL compose grafana-only: command failed" >&2
    failed=1
  else
    expect_eq "compose grafana-only" "$targets" "" || failed=1
  fi
  compute_plan_from_diff
  expect_eq "plan grafana-only" "$(plan_digits)" "00000" || failed=1

  LAST_SHA="$(git rev-parse 848b7553b0c3)"
  CURRENT_SHA="$(git rev-parse 7ffe7db0f2b2)"
  compute_plan_from_diff
  expect_eq "plan poster + grafana" "$(plan_digits)" "00001" || failed=1

  LAST_SHA="$(git rev-parse 335f6f3^)"
  CURRENT_SHA="$(git rev-parse 335f6f3)"
  reset_plan
  apply_packages_source_plan
  expect_eq "packages/contracts → all apps" "$(plan_digits)" "11111" || failed=1

  LAST_SHA="$(git rev-parse f9fd789^)"
  CURRENT_SHA="$(git rev-parse f9fd789)"
  reset_plan
  apply_packages_source_plan
  expect_eq "packages/auth-client → backends only" "$(plan_digits)" "11110" || failed=1

  local df
  for df in client/Dockerfile backend/auth-service/Dockerfile \
    backend/movie-service/Dockerfile backend/message-service/Dockerfile; do
    if grep -qE 'PACKAGES_IMAGE|FROM an-movie-packages|FROM sha256:' "$df" \
      || ! grep -q 'FROM node:24-alpine AS packages' "$df" \
      || ! grep -q 'COPY packages/contracts' "$df"; then
      echo "FAIL ${df}: must build packages from source, not FROM a local image" >&2
      failed=1
    else
      echo "OK ${df} builds packages from source"
    fi
  done
  if grep -q 'COPY packages/auth-client' client/Dockerfile; then
    echo "FAIL client/Dockerfile: must not COPY auth-client" >&2
    failed=1
  fi

  if [ "$failed" -ne 0 ]; then
    echo "deploy-images self-test failed" >&2
    return 1
  fi
  echo "deploy-images self-test ok"
}

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
  if [ "$need_packages" -eq 1 ] && [ "$svc" != packages ]; then
    log "docker compose build --no-cache ${svc} (packages source changed)"
    docker compose build --no-cache "$svc"
  else
    log "docker compose build ${svc}"
    docker compose build "$svc"
  fi
  tag_built "$svc"
}

prune_old_sha_tags() {
  local img
  while read -r img; do
    [ -z "$img" ] && continue
    log "removing old image tag ${img}"
    docker rmi "$img" >/dev/null 2>&1 || true
  done < <(
    docker images --format '{{.Repository}}:{{.Tag}}' \
      | grep -E '^(an-movie-packages|an-movie-auth-service|an-movie-movie-service|an-movie-message-service|an-movie-frontend):[0-9a-f]{12}$' \
      | grep -v ":${SHORT_SHA}$" || true
  )
}

if [ "${1:-}" = "--self-test" ]; then
  run_self_test
  exit 0
fi

if [ "${1:-}" = "--plan" ]; then
  LAST_SHA="$(git rev-parse "${2:?usage: $0 --plan LAST CURRENT}")"
  CURRENT_SHA="$(git rev-parse "${3:?usage: $0 --plan LAST CURRENT}")"
  SHORT_SHA="$(git rev-parse --short=12 "$CURRENT_SHA")"
  compute_plan_from_diff
  log_plan
  printf 'PLAN %s\n' "$(plan_digits)"
  exit 0
fi

LAST_SHA=""
if [ -s "$LAST_SHA_FILE" ]; then
  LAST_SHA="$(tr -d '[:space:]' < "$LAST_SHA_FILE")"
  if ! is_commit "$LAST_SHA"; then
    log "Ignoring ${LAST_SHA_FILE}: not a commit in this clone (${LAST_SHA})"
    LAST_SHA=""
  fi
fi

compute_plan_from_diff
log_plan

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

prune_old_sha_tags

printf '%s\n' "$CURRENT_SHA" > "$LAST_SHA_FILE"
log "Recorded last successful deploy ${CURRENT_SHA}"
