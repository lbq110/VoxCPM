#!/usr/bin/env bash
# Run the voice server locally on the Mac for development.
# VoxCPM2 (2B) on a 16GB M4 can make the whole voice loop feel stuck.
# On this machine VoxCPM-0.5B is faster on CPU than MPS, so CPU is the
# default for snappier local conversation tests. Override VOICE_DEVICE=mps
# or VOICE_DEVICE=cuda when testing another backend.
set -euo pipefail
cd "$(dirname "$0")"

export VOICE_DEVICE="${VOICE_DEVICE:-cpu}"
export VOXCPM_MODEL="${VOXCPM_MODEL:-openbmb/VoxCPM-0.5B}"
export TTS_TIMESTEPS="${TTS_TIMESTEPS:-4}"
export DEFAULT_ASR_MODEL="${DEFAULT_ASR_MODEL:-sensevoice-small}"
export SENSEVOICE_MODEL="${SENSEVOICE_MODEL:-iic/SenseVoiceSmall}"
export WHISPER_MODEL="${WHISPER_MODEL:-base}"   # compatibility fallback
export VOICES_DIR="${VOICES_DIR:-$(pwd)/voices-snapshot}"
export TORCH_COMPILE="${TORCH_COMPILE:-0}"      # compile adds too much cold-start cost locally
export EAGER_LOAD="${EAGER_LOAD:-1}"
export PORT="${PORT:-8000}"

python server.py
