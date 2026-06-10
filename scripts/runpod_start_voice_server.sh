#!/usr/bin/env bash
# Start the VoxCPM voice server on RunPod after code has been synced.
set -euo pipefail

POD_HOST="${POD_HOST:?Set POD_HOST to the RunPod SSH host/IP}"
POD_PORT="${POD_PORT:?Set POD_PORT to the RunPod SSH port}"
KEY="${KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/workspace/voxcpm-voice-server}"
LOG_FILE="${LOG_FILE:-/workspace/server.log}"
RESTART="${RESTART:-0}"

SSH_COMMON=(
  -p "$POD_PORT"
  -i "$KEY"
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=3
  -o TCPKeepAlive=yes
  -o StrictHostKeyChecking=accept-new
)

remote() {
  ssh "${SSH_COMMON[@]}" "root@${POD_HOST}" "$@"
}

if [[ "$RESTART" == "1" ]]; then
  echo "Stopping existing voice server if present..."
  remote "pkill -f '[s]erver.py' || true"
fi

if remote "pgrep -af '[s]erver.py'"; then
  echo "Voice server is already running. Set RESTART=1 to restart it."
  exit 0
fi

echo "Starting voice server in ${REMOTE_DIR}; log: ${LOG_FILE}"
remote "cd '${REMOTE_DIR}' && mkdir -p /workspace/hf /workspace/modelscope /workspace/voices && nohup setsid bash run_pod.sh > '${LOG_FILE}' 2>&1 < /dev/null &"

echo "Startup command sent. Recent log lines:"
sleep 2
remote "tail -n 60 '${LOG_FILE}' || true"

cat <<NEXT

Next:
  1. Watch startup:
     ssh root@${POD_HOST} -p ${POD_PORT} -i ${KEY} "tail -f ${LOG_FILE}"

  2. Open the local API tunnel in another terminal:
     POD_HOST=${POD_HOST} POD_PORT=${POD_PORT} KEY=${KEY} voice-server/tunnel.sh

  3. Check health through the tunnel:
     curl http://127.0.0.1:8001/health
NEXT
