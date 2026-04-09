#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_DIR="${OPENCLAW_WORKSPACE:-/home/node/.openclaw/workspace}"
REPO_DIR="${OPENSTUDENT_REPO:-/openstudent-claw}"
WORKSPACE_IDENTITY_PATH="${WORKSPACE_DIR}/IDENTITY.md"
WORKSPACE_IDENTITY_BACKUP_PATH="${WORKSPACE_IDENTITY_PATH}.bak"
REPO_IDENTITY_PATH="${REPO_DIR}/IDENTITY.md"

ROOT_SKILL_DIR="${WORKSPACE_DIR}/skills/bsi_students"
AGENTS_SKILLS_DIR="${WORKSPACE_DIR}/.agents/skills"
DRIZZLE_ENV_FILE=""
ROOT_SKILL_COPY_ITEMS=(
  "SKILL.md"
  "src"
  "package.json"
  "bun.lock"
  "tsconfig.json"
  "drizzle.config.ts"
)

mkdir -p "${WORKSPACE_DIR}/skills" "${WORKSPACE_DIR}/.agents"

if [ -f "${REPO_IDENTITY_PATH}" ]; then
  if [ -f "${WORKSPACE_IDENTITY_PATH}" ]; then
    cp "${WORKSPACE_IDENTITY_PATH}" "${WORKSPACE_IDENTITY_BACKUP_PATH}"
  fi
  cp "${REPO_IDENTITY_PATH}" "${WORKSPACE_IDENTITY_PATH}"
fi

if [ -L "${ROOT_SKILL_DIR}" ] || [ -f "${ROOT_SKILL_DIR}" ]; then
  rm -rf "${ROOT_SKILL_DIR}"
fi
mkdir -p "${ROOT_SKILL_DIR}"

rm -rf "${ROOT_SKILL_DIR:?}/"* "${ROOT_SKILL_DIR}/".[!.]* "${ROOT_SKILL_DIR}/"..?* 2>/dev/null || true

for item in "${ROOT_SKILL_COPY_ITEMS[@]}"; do
  if [ -e "${REPO_DIR}/${item}" ]; then
    cp -R "${REPO_DIR}/${item}" "${ROOT_SKILL_DIR}/"
  fi
done

if [ -f "${ROOT_SKILL_DIR}/.env" ]; then
  DRIZZLE_ENV_FILE="${ROOT_SKILL_DIR}/.env"
elif [ -f "${REPO_DIR}/.env" ]; then
  DRIZZLE_ENV_FILE="${REPO_DIR}/.env"
fi

if [ -f "${ROOT_SKILL_DIR}/package.json" ]; then
  (
    cd "${ROOT_SKILL_DIR}"
    bun install --no-progress
    bun run db:generate

    if [ -n "${DRIZZLE_ENV_FILE}" ]; then
      bun --env-file="${DRIZZLE_ENV_FILE}" drizzle-kit push
    else
      bun drizzle-kit push
    fi
  )
fi

if [ ! -e "${AGENTS_SKILLS_DIR}" ] && [ -d "${REPO_DIR}/.agents/skills" ]; then
  mkdir -p "${WORKSPACE_DIR}/.agents"
  ln -s "${REPO_DIR}/.agents/skills" "${AGENTS_SKILLS_DIR}"
fi

if [ "$#" -ge 2 ] && [ "$1" = "openclaw" ] && [ "$2" = "gateway" ]; then
  if ! openclaw config get gateway.mode >/dev/null 2>&1; then
    openclaw config set gateway.mode local >/dev/null
  fi
fi

exec "$@"
