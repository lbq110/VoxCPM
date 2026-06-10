# Running the Voice Server on RunPod

This records the current RunPod deployment used by the voice conversation lab.

## Current Pod State

- Pod name: `rolling_apricot_chicken`
- GPU used during setup: **RTX A6000 48GB**
- Volume mount: `/workspace`
- Voice server path: `/workspace/voxcpm-voice-server`
- Model/cache paths:
  - `HF_HOME=/workspace/hf`
  - `MODELSCOPE_CACHE=/workspace/modelscope`
  - `VOICES_DIR=/workspace/voices`

The pod was stopped from the RunPod console after testing. The console showed:

- `Compute: Not running`
- `Container storage: Not running`
- `Volume storage: (20 GB) $0.006/hr`

Start the pod again from the RunPod console before running the commands below.

## Before Starting the GPU

Run the local preparation script while the pod is still stopped:

```sh
cd /Users/lubinquan/Desktop/study/tts/VoxCPM
scripts/pre_gpu_prepare.sh --fast
```

Use the full version when you want a local production build too:

```sh
scripts/pre_gpu_prepare.sh
```

This catches the common problems before GPU billing starts:

- missing local tools;
- accidental tracking of `.env`, `.next`, `node_modules`, or voice wavs;
- bad `web/.env.local` shape;
- Python syntax errors in the voice server;
- shell script syntax errors;
- web lint/typecheck/build failures.

It also writes the next command sheet to:

```text
.gpu-prep/next-runpod-commands.txt
```

## One-Time Setup Already Done

System packages installed:

```sh
apt-get update
apt-get install -y --no-install-recommends rsync ffmpeg git
```

Python stack installed:

```sh
pip install --no-cache-dir torch==2.5.1 torchaudio==2.5.1 \
  --index-url https://download.pytorch.org/whl/cu124
pip install --no-cache-dir -r /workspace/voxcpm-voice-server/requirements.txt
```

The current server uses:

- `openbmb/VoxCPM2`
- `iic/SenseVoiceSmall`
- CUDA device
- `TTS_TIMESTEPS=6`

## Start After Pod Restart

SSH details can change if the pod is recreated. Use the current RunPod Connect
tab values. With the same current pod, the command shape is:

```sh
ssh root@<pod-ip> -p <ssh-port> -i ~/.ssh/id_ed25519
```

Set these on the Mac after copying the current values:

```sh
export POD_HOST=<pod-ip-or-host>
export POD_PORT=<ssh-port>
export KEY=~/.ssh/id_ed25519
```

Sync the prepared server code:

```sh
scripts/runpod_sync_voice_server.sh
```

Start the voice server:

```sh
scripts/runpod_start_voice_server.sh
```

If a previous server process is still running and you need a restart:

```sh
RESTART=1 scripts/runpod_start_voice_server.sh
```

The manual equivalent on the pod is:

```sh
cd /workspace/voxcpm-voice-server
nohup setsid bash run_pod.sh > /workspace/server.log 2>&1 < /dev/null &
```

Watch startup:

```sh
tail -f /workspace/server.log
```

Ready signals:

```text
[tts] ready, sample_rate=48000
[asr] SenseVoice ready
INFO:     Application startup complete.
```

Health check on the pod:

```sh
curl http://127.0.0.1:8000/health
```

Expected important fields:

```json
{
  "device": "cuda",
  "tts_loaded": true,
  "asr_loaded": { "sensevoice-small": true },
  "voxcpm_model": "openbmb/VoxCPM2",
  "voice_cloning_enabled": true,
  "sample_rate": 48000
}
```

## Mac Tunnel

Keep the voice API private by tunneling from the Mac:

```sh
POD_HOST=<pod-ip-or-host> POD_PORT=<ssh-port> voice-server/tunnel.sh
```

Then:

```sh
curl http://127.0.0.1:8001/health
```

The web app currently expects:

```text
VOICE_SERVER_URL=http://localhost:8001
```

## Sync Code to Pod

Prefer the scripted sync:

```sh
scripts/runpod_sync_voice_server.sh
```

It excludes local private/generated files such as `voices-snapshot/`, `.venv/`,
`__pycache__/`, and `*.pyc`.

Manual equivalent:

```sh
rsync --no-owner --no-group --no-perms -av voice-server/ \
  root@<pod-ip>:/workspace/voxcpm-voice-server/ \
  -e 'ssh -p <ssh-port> -i ~/.ssh/id_ed25519'
```

## TTS Notes

For VoxCPM2 conversation TTS, use reference-only cloning:

- good: `reference_wav_path`
- avoid: `prompt_wav_path + prompt_text` for live replies

The prompt-cache continuation path can leak the reference sample content into
the generated output. The current `server.py` disables prompt-cache for VoxCPM2
conversation TTS.

## Restore Default Voice Menu

The default preset definitions live in:

- `make_voices.py`
- `make_voices_extra.py`

Run these on the GPU to regenerate the missing wav files:

```sh
cd /workspace/voxcpm-voice-server
python make_voices.py
python make_voices_extra.py
```

Then confirm:

```sh
curl http://127.0.0.1:8000/voices
```

The web dropdown only shows voices whose wav files exist under
`/workspace/voices`.
