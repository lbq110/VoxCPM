#!/usr/bin/env bash
# Local-only checks to run before starting the RunPod GPU.
# The goal is to catch config, syntax, and web build issues while the GPU is off.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RUN_WEB=1
RUN_BUILD=1
FAILED=0

usage() {
  cat <<'USAGE'
Usage: scripts/pre_gpu_prepare.sh [--fast] [--skip-web]

Runs local checks before starting the RunPod GPU:
  - required local tools
  - ignored secret/audio/build paths
  - web/.env.local shape without printing secrets
  - voice-server Python syntax
  - shell script syntax
  - web lint, typecheck, and build unless skipped
  - writes .gpu-prep/next-runpod-commands.txt

Options:
  --fast      skip the Next.js production build, keep lint + typecheck
  --skip-web  skip all web npm checks
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fast)
      RUN_BUILD=0
      shift
      ;;
    --skip-web)
      RUN_WEB=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

ok() {
  printf '[ok] %s\n' "$*"
}

warn() {
  printf '[warn] %s\n' "$*"
}

fail() {
  printf '[fail] %s\n' "$*" >&2
  FAILED=1
}

need_tool() {
  if command -v "$1" >/dev/null 2>&1; then
    ok "found $1"
  else
    fail "missing required tool: $1"
  fi
}

check_ignored_if_exists() {
  local path="$1"
  if [[ ! -e "$path" ]]; then
    ok "$path absent"
    return
  fi
  if git check-ignore -q "$path"; then
    ok "$path is ignored"
  else
    fail "$path exists but is not ignored"
  fi
}

check_env_file() {
  local env_file="web/.env.local"
  if [[ ! -f "$env_file" ]]; then
    warn "missing $env_file; copy web/.env.example and fill it before testing"
    return
  fi

  if grep -Eq '^OPENROUTER_API_KEY=.+$' "$env_file" &&
    ! grep -Eq '^OPENROUTER_API_KEY=$|^OPENROUTER_API_KEY=sk-or\.\.\.$' "$env_file"; then
    ok "$env_file has OPENROUTER_API_KEY"
  else
    fail "$env_file is missing a real OPENROUTER_API_KEY"
  fi

  if grep -Eq '^VOICE_SERVER_URL=http://(localhost|127\.0\.0\.1):8001/?$' "$env_file"; then
    ok "$env_file points to the local RunPod tunnel"
  else
    warn "$env_file VOICE_SERVER_URL is not http://localhost:8001"
  fi

  if grep -Eq '^VOICE_API_KEY=.+$' "$env_file"; then
    ok "$env_file has VOICE_API_KEY"
  else
    warn "$env_file has no VOICE_API_KEY; keep the voice server unset too, or fill both sides"
  fi
}

write_command_sheet() {
  mkdir -p .gpu-prep
  cat > .gpu-prep/next-runpod-commands.txt <<'COMMANDS'
# Next RunPod session
#
# 1. Start the RunPod pod in the console.
# 2. Copy the current "SSH over exposed TCP" host and port.
# 3. On the Mac, export them:
#
#    export POD_HOST=<pod-ip-or-host>
#    export POD_PORT=<ssh-port>
#    export KEY=~/.ssh/id_ed25519
#
# 4. Sync only the voice-server code to /workspace:
#
#    scripts/runpod_sync_voice_server.sh
#
# 5. Start the server. Use RESTART=1 if an old server is already running:
#
#    scripts/runpod_start_voice_server.sh
#    RESTART=1 scripts/runpod_start_voice_server.sh
#
# 6. Keep the API tunnel open in another terminal:
#
#    POD_HOST=$POD_HOST POD_PORT=$POD_PORT voice-server/tunnel.sh
#
# 7. Health check through the tunnel:
#
#    curl http://127.0.0.1:8001/health
#
# 8. Start the web app:
#
#    cd web
#    npm run dev -- -p 3001
#
# Optional after a fresh /workspace/voices reset:
#
#    ssh root@$POD_HOST -p $POD_PORT -i $KEY
#    cd /workspace/voxcpm-voice-server
#    python make_voices.py
#    python make_voices_extra.py
COMMANDS
  ok "wrote .gpu-prep/next-runpod-commands.txt"
}

echo "== Local tool checks =="
need_tool git
need_tool rg
need_tool python3
need_tool bash
need_tool ssh
need_tool rsync
need_tool curl
if [[ "$RUN_WEB" -eq 1 ]]; then
  need_tool npm
fi
if [[ "$FAILED" -ne 0 ]]; then
  echo "Missing required local tools. Install them before continuing." >&2
  exit 1
fi

echo
echo "== Git and ignored runtime files =="
if [[ -n "$(git status --porcelain)" ]]; then
  warn "working tree has uncommitted changes; commit or review them before opening GPU time"
else
  ok "working tree is clean"
fi
check_ignored_if_exists web/.env.local
check_ignored_if_exists web/.next
check_ignored_if_exists web/node_modules
check_ignored_if_exists voice-server/voices-snapshot
check_ignored_if_exists .gpu-prep

echo
echo "== Env and secret checks =="
check_env_file
secret_pattern='sk-or-''v1-|OPENROUTER_API_KEY=sk-or-''v1|VOICE_API_KEY=[A-Za-z0-9_-]''{8,}|MISTRAL_API_KEY=[A-Za-z0-9_-]''{8,}|194\.''68|69\.''30\.''85'
if rg -n "$secret_pattern" \
  CHAT_APP.md voice-server web scripts \
  --glob '!voice-server/voices-snapshot/**' \
  --glob '!web/.env.local' \
  --glob '!web/.next/**' \
  --glob '!web/node_modules/**' \
  >/tmp/voxcpm-secret-scan.txt; then
  cat /tmp/voxcpm-secret-scan.txt >&2
  fail "possible secret or stale RunPod IP found in tracked source"
else
  ok "no obvious real key or stale RunPod IP pattern in source"
fi

echo
echo "== Voice-server checks =="
python3 -m py_compile \
  voice-server/server.py \
  voice-server/make_voices.py \
  voice-server/make_voices_extra.py
ok "voice-server Python syntax"

bash -n \
  voice-server/run_local.sh \
  voice-server/run_pod.sh \
  voice-server/tunnel.sh \
  scripts/runpod_sync_voice_server.sh \
  scripts/runpod_start_voice_server.sh
ok "shell script syntax"

echo
echo "== Web checks =="
if [[ "$RUN_WEB" -eq 0 ]]; then
  warn "web checks skipped"
elif [[ ! -d web/node_modules ]]; then
  warn "web/node_modules missing; run 'cd web && npm ci' before opening GPU time"
else
  (cd web && npm run lint)
  ok "web lint"
  (cd web && npm run typecheck)
  ok "web typecheck"
  if [[ "$RUN_BUILD" -eq 1 ]]; then
    (cd web && npm run build)
    ok "web production build"
  else
    warn "web production build skipped by --fast"
  fi
fi

echo
echo "== RunPod command sheet =="
write_command_sheet

echo
if [[ "$FAILED" -ne 0 ]]; then
  echo "Pre-GPU preparation found problems. Fix them before starting the pod." >&2
  exit 1
fi

echo "Pre-GPU preparation passed. Keep the GPU off until you have POD_HOST/POD_PORT ready."
