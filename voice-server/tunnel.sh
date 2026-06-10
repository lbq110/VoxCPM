#!/usr/bin/env bash
# Open an SSH tunnel from this Mac to the RunPod voice server's localhost:8000.
# Keep this running while you use the chat app.
#
# If you stop/recreate the pod, RunPod may give a new IP + SSH port. Get the
# values from the pod's "SSH over exposed TCP" panel.
set -euo pipefail

POD_HOST="${POD_HOST:?Set POD_HOST to the RunPod SSH host/IP}"
POD_PORT="${POD_PORT:?Set POD_PORT to the RunPod SSH port}"
KEY="${KEY:-$HOME/.ssh/id_ed25519}"
LOCAL_PORT="${LOCAL_PORT:-8001}"

echo "Tunneling localhost:${LOCAL_PORT} -> ${POD_HOST}:${POD_PORT} (pod's :8000)"
echo "Leave this open. Ctrl-C to close."
exec ssh -N -L "${LOCAL_PORT}:localhost:8000" \
  -p "$POD_PORT" -i "$KEY" \
  -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o TCPKeepAlive=yes \
  -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=accept-new \
  "root@${POD_HOST}"
