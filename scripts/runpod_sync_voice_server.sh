#!/usr/bin/env bash
# Sync local voice-server code to the RunPod persistent volume.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POD_HOST="${POD_HOST:?Set POD_HOST to the RunPod SSH host/IP}"
POD_PORT="${POD_PORT:?Set POD_PORT to the RunPod SSH port}"
KEY="${KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/workspace/voxcpm-voice-server}"

SSH_COMMON=(
  -p "$POD_PORT"
  -i "$KEY"
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=3
  -o TCPKeepAlive=yes
  -o StrictHostKeyChecking=accept-new
)

RSYNC_ARGS=(
  --archive
  --compress
  --human-readable
  --no-owner
  --no-group
  --no-perms
  --exclude 'voices-snapshot/'
  --exclude '.venv/'
  --exclude '__pycache__/'
  --exclude '*.pyc'
)

if [[ "${DELETE_REMOTE:-0}" == "1" ]]; then
  RSYNC_ARGS+=(--delete)
fi

echo "Ensuring remote directory: ${REMOTE_DIR}"
ssh "${SSH_COMMON[@]}" "root@${POD_HOST}" "mkdir -p '${REMOTE_DIR}'"

echo "Syncing voice-server/ -> root@${POD_HOST}:${REMOTE_DIR}/"
rsync "${RSYNC_ARGS[@]}" \
  -e "ssh -p ${POD_PORT} -i ${KEY} -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o TCPKeepAlive=yes -o StrictHostKeyChecking=accept-new" \
  "$ROOT/voice-server/" \
  "root@${POD_HOST}:${REMOTE_DIR}/"

ssh "${SSH_COMMON[@]}" "root@${POD_HOST}" "chmod +x '${REMOTE_DIR}'/run_pod.sh"
echo "Sync complete."
