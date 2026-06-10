#!/usr/bin/env bash
# Run the voice server on a CUDA RunPod pod.
set -euo pipefail
cd "$(dirname "$0")"

export HF_HOME="${HF_HOME:-/workspace/hf}"
export MODELSCOPE_CACHE="${MODELSCOPE_CACHE:-/workspace/modelscope}"
export VOICES_DIR="${VOICES_DIR:-/workspace/voices}"
export VOICE_DEVICE="${VOICE_DEVICE:-cuda}"
export VOXCPM_MODEL="${VOXCPM_MODEL:-openbmb/VoxCPM2}"
export DEFAULT_ASR_MODEL="${DEFAULT_ASR_MODEL:-sensevoice-small}"
export SENSEVOICE_MODEL="${SENSEVOICE_MODEL:-iic/SenseVoiceSmall}"
export WHISPER_MODEL="${WHISPER_MODEL:-base}"
export TTS_TIMESTEPS="${TTS_TIMESTEPS:-6}"
export TORCH_COMPILE="${TORCH_COMPILE:-0}"
export EAGER_LOAD="${EAGER_LOAD:-1}"
export PORT="${PORT:-8000}"

mkdir -p "$HF_HOME" "$MODELSCOPE_CACHE" "$VOICES_DIR"
python server.py
