# VoxCPM Voice Conversation Lab

This directory adds a browser voice-chat lab on top of VoxCPM. It is built for
testing a ChatGPT-like speech conversation loop:

```text
Browser mic/text
  -> Next.js web app
  -> SenseVoice-Small ASR on voice-server
  -> OpenRouter Grok streaming LLM
  -> VoxCPM2 TTS on RunPod GPU
  -> Web Audio playback
```

## Current Stack

- Web UI: `web/`, Next.js on `http://localhost:3001`.
- STT: `sensevoice-small` through FunASR on the voice server.
- Optional STT slot: `voxtral-realtime`, wired in the UI and server, but needs
  `MISTRAL_API_KEY`.
- LLM: OpenRouter, default `x-ai/grok-4.3`.
- TTS: `openbmb/VoxCPM2` on RunPod CUDA.
- Voice transport: browser calls Next API routes; Next proxies to the voice
  server, so CORS and voice-server secrets stay server-side.

## What Was Implemented

- A compact voice-chat interface with `Talk`, `End`, `Done`, `Cut`, typed input,
  model selectors, voice selector, voice recording, and voice upload.
- Continuous voice loop: after the assistant finishes speaking, recording starts
  again automatically.
- Mic/VAD handling:
  - browser microphone permission flow,
  - smoothed audio level meter,
  - auto-stop after speech silence,
  - manual `Done` fallback,
  - low-level/empty recording errors,
  - abortable ASR request.
- Metrics:
  - ASR latency,
  - ASR model,
  - language,
  - LLM first token,
  - TTS first audio,
  - TTS total.
- Text rhythm prompt for voice conversation: short spoken sentences first, with
  occasional medium sentences when useful.

## TTS Decisions

VoxCPM2 supports several voice modes. For this app the stable path is:

- use `reference_wav_path` to lock the timbre;
- do not use `prompt_text` / prompt-cache continuation for live conversation.

The prompt-cache path can make VoxCPM2 continue the reference sample itself. In
testing this caused the assistant to play the reference clip content instead of
reading the reply. The server now disables prompt-cache for VoxCPM2 conversation
TTS and uses reference-only cloning.

The web player keeps one TTS request per sentence to preserve prosody. It starts
playback after a small PCM buffer instead of waiting for the whole sentence,
which makes speech start faster while avoiding chopped audio.

Current speed setting:

- `inference_timesteps: 6` per request from the web app.
- `voice-server/run_pod.sh` also defaults `TTS_TIMESTEPS=6`.

Measured after warmup:

- short sentence TTS through the web proxy: first bytes about `0.6s`, total about
  `2s`;
- longer sentence: first bytes about `0.7s`, total about `3.5s`.

## RunPod Status

The RunPod GPU pod was stopped from the console.

Observed stopped state:

- `Compute: Not running`
- `Container storage: Not running`
- only volume storage remains, roughly `$0.006/hr`.

When resuming work:

1. Run the local pre-GPU checklist while the GPU is still off.
2. Start the RunPod pod from the console.
3. Sync the prepared `voice-server/` code.
4. Start the remote voice server.
5. Recreate the SSH tunnel.
6. Confirm `/health`.
7. Start or refresh the web app.

## Save GPU Time

Run this before starting the pod:

```sh
scripts/pre_gpu_prepare.sh --fast
```

For a full local production check, omit `--fast`:

```sh
scripts/pre_gpu_prepare.sh
```

The script checks local tools, ignored secret/audio paths, `web/.env.local`,
Python syntax, shell syntax, web lint, web typecheck, and optionally the Next.js
production build. It also writes:

```text
.gpu-prep/next-runpod-commands.txt
```

After the pod is started and the current RunPod SSH host/port are known:

```sh
export POD_HOST=<pod-ip-or-host>
export POD_PORT=<ssh-port>
export KEY=~/.ssh/id_ed25519

scripts/runpod_sync_voice_server.sh
scripts/runpod_start_voice_server.sh
voice-server/tunnel.sh
```

If an old server process is already running and you want to restart it:

```sh
RESTART=1 scripts/runpod_start_voice_server.sh
```

## Local Dev

Web:

```sh
cd web
npm install
npm run dev -- -p 3001
```

Voice server locally:

```sh
cd voice-server
./run_local.sh
```

Local CPU mode is for wiring tests. Real VoxCPM2 voice locking should use the
RunPod GPU path.

## Current Voice Presets

The app currently exposes only voice entries whose wav files exist under
`/workspace/voices` on the voice server.

Current actual exposed voice after stopping:

- `矮大紧` (`u_wechat_20260529_210719`)

The default designed presets are defined in:

- `voice-server/make_voices.py`
- `voice-server/make_voices_extra.py`

Default preset labels:

- `磁性宠溺男友音`
- `阳光治愈暖男`
- `沉稳大叔音`
- `软糯甜妹`
- `温柔御姐`
- `邻家温柔女友`
- `知性书卷男声`
- `温柔甜美娃娃音`
- `成熟慵懒女声`

Their `voices.json` records exist in the snapshot, but the generated wav files
were missing on the pod, so the server filtered them out. To restore the menu,
restart RunPod and regenerate the preset wav files on the GPU.

## Files To Know

- `web/src/components/Chat.tsx` — main voice chat UI and conversation loop.
- `web/src/lib/useRecorder.ts` — microphone recorder and VAD.
- `web/src/lib/voicePlayer.ts` — streaming PCM playback.
- `web/src/lib/config.ts` — server-side OpenRouter and voice-server config.
- `web/src/app/api/*` — Next.js proxy routes for chat, ASR, TTS, and voices.
- `voice-server/server.py` — FastAPI ASR/TTS/voice server.
- `voice-server/run_pod.sh` — RunPod CUDA startup.
- `voice-server/run_local.sh` — local CPU development startup.

## Git Hygiene

Do not commit:

- `web/.env.local` or any real API keys;
- `voice-server/voices-snapshot/` wav files or prompt cache;
- `.next`, `node_modules`, `__pycache__`, or other generated files.
