# Voice Server — VoxCPM2 TTS + Selectable ASR

One FastAPI service that gives the chat app a voice (VoxCPM2) and ears
(SenseVoice-Small locally, Voxtral Realtime through Mistral, with Whisper kept
as a compatibility option).
Runs on a RunPod CUDA pod in production; runs on your Mac for local testing.

## Endpoints

| Method | Path          | Body                          | Returns |
|--------|---------------|-------------------------------|---------|
| GET    | `/health`     | —                             | JSON status |
| POST   | `/asr`        | multipart `file` (+`language`, `model`)| `{ text, language, model }` |
| POST   | `/tts/stream` | JSON `TTSRequest`             | streamed int16 PCM (`X-Sample-Rate` header) |
| POST   | `/tts`        | JSON `TTSRequest`             | a `audio/wav` file |

ASR `model` values used by the web UI:

- `sensevoice-small` — local FunAudioLLM/FunASR `iic/SenseVoiceSmall`.
- `voxtral-realtime` — Mistral realtime API model
  `voxtral-mini-transcribe-realtime-2602`; requires `MISTRAL_API_KEY`.
- `whisper` — faster-whisper fallback for old clients.

`TTSRequest`: `{ text, voice?, reference_wav?, cfg_value=2.0, inference_timesteps=6, normalize=true }`.

For live conversation, prefer `voice` or `reference_wav` so VoxCPM2 uses
reference-only cloning. Avoid prompt continuation for live replies; it can leak
the reference sample's spoken content into the generated answer.

## Run on RunPod (CUDA 12)

1. Create a **GPU Pod**. A 48GB class card such as A6000/A40/L40S is enough for
   the current VoxCPM2 + SenseVoice setup.
2. Build & push (or use RunPod's "Deploy from GitHub"):
   ```sh
   docker build -t <you>/voxcpm-voice .
   docker push <you>/voxcpm-voice
   ```
3. Expose **HTTP port 8000**. Set env vars:
   - `VOICE_DEVICE=cuda`
   - `VOXCPM_MODEL=openbmb/VoxCPM2`
   - `DEFAULT_ASR_MODEL=sensevoice-small`
   - `SENSEVOICE_MODEL=iic/SenseVoiceSmall`
   - `MISTRAL_API_KEY=<your-mistral-key>`      ← only needed for Voxtral Realtime
   - `VOICE_API_KEY=<a-long-random-secret>`   ← then send `Authorization: Bearer <secret>`
4. First boot downloads the 2B weights. Use `/workspace` as the persistent volume
   and set `HF_HOME=/workspace/hf`, `MODELSCOPE_CACHE=/workspace/modelscope`, and
   `VOICES_DIR=/workspace/voices`.
5. Grab the pod's public URL (e.g. `https://xxxx-8000.proxy.runpod.net`) and put it
   in the web app's `.env.local` as `VOICE_SERVER_URL`.

Sanity check:
```sh
curl https://xxxx-8000.proxy.runpod.net/health
```

## Run locally on the Mac (dev)

```sh
cd voice-server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
./run_local.sh                       # CPU + VoxCPM-0.5B + SenseVoice-Small
# Higher quality / voice cloning path:
VOICE_DEVICE=mps VOXCPM_MODEL=openbmb/VoxCPM2 ./run_local.sh
```

Then point the web app at `http://localhost:8000`.

## Current RunPod Workflow

See `RUNPOD_RUN.md` for the current A6000 pod notes, GPU-off preparation,
scripted sync/start commands, SSH tunnel shape, restart steps, and default voice
preset regeneration steps.
