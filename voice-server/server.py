"""
Voice server: VoxCPM2 (TTS) + selectable ASR behind a single FastAPI app.

Designed to run on a RunPod L40S GPU, but the same file runs locally on an
Apple Silicon Mac for development — set VOICE_DEVICE=cpu/mps/auto as needed.

Endpoints
---------
GET  /health           -> liveness + which models are loaded
POST /asr              -> multipart audio file  -> { "text": "...", "model": "..." }
POST /tts/stream       -> JSON {text, ...}       -> streaming 16-bit PCM
POST /tts              -> JSON {text, ...}       -> a single WAV file

The TTS stream sends raw little-endian int16 PCM. The sample rate is reported
in the `X-Sample-Rate` response header so the browser can play it with the
Web Audio API as chunks arrive (lowest possible latency).
"""

import io
import json
import os
import re
import sys
import tempfile
import threading
import wave

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

# --------------------------------------------------------------------------- #
# Configuration (all overridable via environment variables)
# --------------------------------------------------------------------------- #
VOICE_DEVICE = os.environ.get("VOICE_DEVICE", "auto")                # auto|cuda|mps|cpu
VOXCPM_MODEL = os.environ.get("VOXCPM_MODEL", "openbmb/VoxCPM2")
DEFAULT_ASR_MODEL = os.environ.get("DEFAULT_ASR_MODEL", "sensevoice-small")
SENSEVOICE_MODEL = os.environ.get("SENSEVOICE_MODEL", "iic/SenseVoiceSmall")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "large-v3")           # tiny..large-v3
WHISPER_COMPUTE = os.environ.get("WHISPER_COMPUTE", "")               # e.g. float16/int8
MISTRAL_API_KEY = os.environ.get("MISTRAL_API_KEY", "")
VOXTRAL_REALTIME_MODEL = os.environ.get(
    "VOXTRAL_REALTIME_MODEL",
    "voxtral-mini-transcribe-realtime-2602",
)
VOXTRAL_TARGET_DELAY_MS = int(os.environ.get("VOXTRAL_TARGET_DELAY_MS", "240"))
VOXTRAL_CHUNK_MS = int(os.environ.get("VOXTRAL_CHUNK_MS", "480"))
API_KEY = os.environ.get("VOICE_API_KEY", "")                         # optional bearer guard
ENABLE_DENOISER = os.environ.get("ENABLE_DENOISER", "0") == "1"
TORCH_COMPILE = os.environ.get("TORCH_COMPILE", "1") == "1"
# A fixed reference voice cloned on EVERY request so the whole conversation keeps
# one consistent timbre (instead of VoxCPM inventing a new voice per sentence).
DEFAULT_REFERENCE_WAV = os.environ.get("DEFAULT_REFERENCE_WAV", "")
# Directory of pre-generated voice presets (voices.json + <id>.wav), built by
# make_voices.py. Selecting a preset clones its wav for a consistent voice.
VOICES_DIR = os.environ.get("VOICES_DIR", "/workspace/voices")
DEFAULT_VOICE = os.environ.get("DEFAULT_VOICE", "")
DEFAULT_TTS_TIMESTEPS = int(os.environ.get("TTS_TIMESTEPS", "10"))
VOICE_PROMPT_SECONDS = float(os.environ.get("VOICE_PROMPT_SECONDS", "8"))
VOICE_PROMPT_TEXT_CHARS = int(os.environ.get("VOICE_PROMPT_TEXT_CHARS", "80"))
VOICE_LOCK_AUDIO_TEXT_RATIO = float(os.environ.get("VOICE_LOCK_AUDIO_TEXT_RATIO", "3.2"))


def _load_voices() -> dict:
    path = os.path.join(VOICES_DIR, "voices.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            items = json.load(f)
        resolved = {}
        for v in items:
            item = dict(v)
            wav_path = item.get("file", "")
            if wav_path and not os.path.exists(wav_path):
                local_path = os.path.join(VOICES_DIR, os.path.basename(wav_path))
                if os.path.exists(local_path):
                    item["file"] = local_path
            if not os.path.exists(item.get("file", "")):
                continue
            if not item.get("prompt_text") and item.get("sample"):
                item["prompt_text"] = item["sample"]
            resolved[item["id"]] = item
        return resolved
    except Exception:
        return {}


VOICES = _load_voices()

app = FastAPI(title="VoxCPM Voice Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _auth(request, call_next):
    # Optional bearer-token guard. Leave VOICE_API_KEY empty to disable.
    if API_KEY and request.url.path not in ("/health", "/docs", "/openapi.json"):
        if request.headers.get("authorization") != f"Bearer {API_KEY}":
            return Response(status_code=401, content="unauthorized")
    return await call_next(request)

_tts = None        # voxcpm.VoxCPM
_asr = None        # faster_whisper.WhisperModel
_sensevoice = None  # funasr.AutoModel
_sample_rate = 24000
_voice_prompt_cache = {}
_tts_load_lock = threading.Lock()
_tts_infer_lock = threading.Lock()
_voice_prompt_cache_lock = threading.Lock()
_asr_load_lock = threading.Lock()
_asr_infer_lock = threading.Lock()
_sensevoice_load_lock = threading.Lock()
_sensevoice_infer_lock = threading.Lock()


def _resolve_device() -> str:
    if VOICE_DEVICE != "auto":
        return VOICE_DEVICE
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def _load_tts():
    global _tts, _sample_rate
    if _tts is not None:
        return _tts
    with _tts_load_lock:
        if _tts is not None:
            return _tts
        from voxcpm import VoxCPM

        device = _resolve_device()
        print(f"[tts] loading {VOXCPM_MODEL} on {device}", file=sys.stderr, flush=True)
        model = VoxCPM.from_pretrained(
            VOXCPM_MODEL,
            load_denoiser=ENABLE_DENOISER,
            optimize=TORCH_COMPILE,
            device=None if device == "auto" else device,
        )
        _sample_rate = int(model.tts_model.sample_rate)
        # Warm the CUDA kernels with a throwaway generation so the FIRST real request
        # isn't slow (cold first inference is what causes the opening reply to stutter).
        try:
            ref = DEFAULT_REFERENCE_WAV if os.path.exists(DEFAULT_REFERENCE_WAV) else None
            model.generate(text="预热一下。", inference_timesteps=DEFAULT_TTS_TIMESTEPS,
                           **({"reference_wav_path": ref} if ref else {}))
            print("[tts] warmup done", file=sys.stderr, flush=True)
        except Exception as exc:  # pragma: no cover - warmup is best effort
            print(f"[tts] warmup skipped: {exc}", file=sys.stderr, flush=True)
        _tts = model
        print(f"[tts] ready, sample_rate={_sample_rate}", file=sys.stderr, flush=True)
        return _tts


def _load_asr():
    global _asr
    if _asr is not None:
        return _asr
    with _asr_load_lock:
        if _asr is not None:
            return _asr
        from faster_whisper import WhisperModel

        device = _resolve_device()
        # faster-whisper (CTranslate2) supports cuda/cpu only; MPS falls back to cpu.
        ct_device = "cuda" if device == "cuda" else "cpu"
        compute = WHISPER_COMPUTE or ("float16" if ct_device == "cuda" else "int8")
        print(f"[asr] loading whisper {WHISPER_MODEL} on {ct_device}/{compute}", file=sys.stderr, flush=True)
        _asr = WhisperModel(WHISPER_MODEL, device=ct_device, compute_type=compute)
        print("[asr] ready", file=sys.stderr, flush=True)
        return _asr


def _resolve_sensevoice_model() -> str:
    if os.path.exists(SENSEVOICE_MODEL):
        return SENSEVOICE_MODEL

    if SENSEVOICE_MODEL == "iic/SenseVoiceSmall":
        cache_dir = os.path.expanduser("~/.cache/modelscope/hub/models/iic/SenseVoiceSmall")
        if os.path.exists(os.path.join(cache_dir, "config.yaml")):
            return cache_dir
        try:
            from modelscope import snapshot_download

            return snapshot_download(SENSEVOICE_MODEL)
        except Exception as exc:
            print(f"[asr] SenseVoice snapshot lookup failed: {exc}", file=sys.stderr, flush=True)

    return SENSEVOICE_MODEL


def _load_sensevoice():
    global _sensevoice
    if _sensevoice is not None:
        return _sensevoice
    with _sensevoice_load_lock:
        if _sensevoice is not None:
            return _sensevoice
        from funasr import AutoModel

        device = _resolve_device()
        sv_device = "cuda:0" if device == "cuda" else "cpu"
        model_ref = _resolve_sensevoice_model()
        print(
            f"[asr] loading SenseVoice {model_ref} on {sv_device}",
            file=sys.stderr,
            flush=True,
        )
        _sensevoice = AutoModel(
            model=model_ref,
            disable_update=True,
            log_level="ERROR",
            device=sv_device,
        )
        print("[asr] SenseVoice ready", file=sys.stderr, flush=True)
        return _sensevoice


def _f32_to_pcm16(wav: np.ndarray) -> bytes:
    wav = np.clip(wav, -1.0, 1.0)
    return (wav * 32767.0).astype("<i2").tobytes()


def _pcm16_to_wav(pcm: bytes, sample_rate: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm)
    return buf.getvalue()


# --------------------------------------------------------------------------- #
# Request models
# --------------------------------------------------------------------------- #
class TTSRequest(BaseModel):
    text: str
    voice: str | None = None            # id of a preset from VOICES (see /voices)
    voice_design: str | None = None     # natural-language voice/style description
    reference_wav: str | None = None    # per-request override of the clone reference
    cfg_value: float = 2.0
    inference_timesteps: int = DEFAULT_TTS_TIMESTEPS
    normalize: bool = True


# Safety net: strip a leading emotion tag so it is never spoken, even if the
# client failed to remove it. Tolerant of the formats weaker LLMs emit
# (different brackets, with/without the "emotion" keyword, en/zh colons, or a
# bare "emotion: 词" / "情绪：词" prefix). Bracketed forms are stripped broadly;
# unbracketed forms only when followed by a known emotion word, to stay safe.
_EMO_WORDS = r"温柔|开心|安慰|俏皮|撒娇|害羞|难过|兴奋|认真|平静|gentle|happy|sad|excited|calm|playful|shy|serious|comfort|cheerful"
_TAG_RE = re.compile(
    r"^[\s\n]*(?:"
    r"\[\[[^\]]*\]\]"                                              # [[ … ]]
    r"|【[^】]*】"                                                  # 【 … 】
    r"|\([^)]*(?:emotion|情绪)[^)]*\)"                              # ( … emotion … )
    r"|（[^）]*(?:emotion|情绪)[^）]*）"                            # （ … emotion … ）
    r"|[\[\(（]\s*(?:emotion|情绪)?\s*[:：]?\s*(?:" + _EMO_WORDS + r")\s*[\]\)）]"  # [词] (词) （词）
    r"|(?:emotion|情绪)\s*[:：]\s*(?:" + _EMO_WORDS + r")"          # emotion: 词 / 情绪：词
    r")[\s，,。.：:、]*",
    re.IGNORECASE,
)


def _compose_text(req: TTSRequest) -> str:
    text = _TAG_RE.sub("", (req.text or ""), count=1).strip()
    if not text:
        raise HTTPException(status_code=400, detail="text must be non-empty")
    # NOTE: we intentionally IGNORE req.voice_design here. VoxCPM2 sometimes reads
    # the parenthetical style/control words aloud when combined with voice
    # cloning, leaking e.g. "有活力" into speech. Emotion comes through naturally
    # from the wording instead. (Voice *design* for creating new voices is done
    # via make_voices.py with model.generate directly, not this path.)
    return text


def _selected_voice(req: TTSRequest) -> tuple[str | None, dict | None]:
    voice_id = req.voice or DEFAULT_VOICE
    return voice_id, VOICES.get(voice_id) if voice_id else None


def _clone_kwargs(req: TTSRequest) -> dict:
    """Resolve the selected voice into VoxCPM cloning kwargs.

    A preset may carry a `prompt_text` (the transcript of its wav) — then we do
    "ultimate cloning" (prompt_wav + prompt_text + reference_wav) for maximum
    similarity. Otherwise plain controllable cloning (reference_wav only).
    """
    voice_id, preset = _selected_voice(req)
    if preset:
        if "VoxCPM2" not in VOXCPM_MODEL:
            prompt_text = (preset.get("prompt_text") or "").strip()
            if prompt_text:
                return {"prompt_wav_path": preset["file"], "prompt_text": prompt_text}
            print(
                f"[tts] voice {voice_id} has no prompt_text; 0.5B voice lock skipped",
                file=sys.stderr,
                flush=True,
            )
            return {}
        # Reference-only (controllable) cloning. We deliberately do NOT use
        # prompt_text/ultimate "continuation" cloning: it tends to add a garbled
        # artifact at the very start of the clip.
        return {"reference_wav_path": preset["file"]}

    if "VoxCPM2" not in VOXCPM_MODEL:
        return {}

    ref = req.reference_wav or DEFAULT_REFERENCE_WAV or None
    if ref and not os.path.exists(ref):
        print(f"[tts] reference wav not found, ignoring: {ref}", file=sys.stderr, flush=True)
        ref = None
    return {"reference_wav_path": ref} if ref else {}


def _normalize_text(model, text: str, normalize: bool) -> str:
    if not normalize:
        return text
    if model.text_normalizer is None:
        from voxcpm.utils.text_normalize import TextNormalizer

        model.text_normalizer = TextNormalizer()
    return model.text_normalizer.normalize(text)


def _voice_cache_spec(req: TTSRequest) -> tuple[str, dict] | None:
    voice_id, preset = _selected_voice(req)
    if not voice_id or not preset:
        return None
    if "VoxCPM2" in VOXCPM_MODEL:
        # VoxCPM2 prompt-cache with prompt_text is a continuation path. In a
        # conversation it can leak the reference sample content into playback.
        # Use reference_wav_path via _clone_kwargs instead: it locks timbre
        # without making the model continue the sample transcript.
        return None
    if not (preset.get("prompt_text") or "").strip():
        return None
    return voice_id, preset


def _voice_cache_key(voice_id: str, preset: dict) -> str:
    wav_path, prompt_text = _voice_prompt_inputs(voice_id, preset)
    try:
        mtime = os.path.getmtime(wav_path)
    except OSError:
        mtime = 0
    return (
        f"{VOXCPM_MODEL}|{voice_id}|{wav_path}|{mtime}|"
        f"{VOICE_PROMPT_SECONDS}|{VOICE_PROMPT_TEXT_CHARS}|{hash(prompt_text)}"
    )


def _voice_prompt_inputs(voice_id: str, preset: dict) -> tuple[str, str]:
    prompt_text = re.sub(r"\s+", " ", (preset.get("prompt_text") or "").strip())
    if VOICE_PROMPT_TEXT_CHARS > 0:
        prompt_text = prompt_text[:VOICE_PROMPT_TEXT_CHARS]

    wav_path = preset["file"]
    if VOICE_PROMPT_SECONDS <= 0:
        return wav_path, prompt_text

    try:
        import soundfile as sf

        audio, sr = sf.read(wav_path, dtype="float32", always_2d=True)
        max_samples = int(sr * VOICE_PROMPT_SECONDS)
        if audio.shape[0] <= max_samples:
            return wav_path, prompt_text
        audio = audio[:max_samples]
        if audio.shape[1] > 1:
            audio = audio.mean(axis=1)
        else:
            audio = audio[:, 0]
        cache_dir = os.path.join(VOICES_DIR, ".prompt-cache")
        os.makedirs(cache_dir, exist_ok=True)
        out = os.path.join(cache_dir, f"{voice_id}_{int(VOICE_PROMPT_SECONDS * 1000)}ms.wav")
        if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(wav_path):
            sf.write(out, audio, sr)
        return out, prompt_text
    except Exception as exc:
        print(f"[tts] prompt trim failed for {voice_id}: {exc}", file=sys.stderr, flush=True)
        return wav_path, prompt_text


def _get_voice_prompt_cache(model, voice_id: str, preset: dict):
    key = _voice_cache_key(voice_id, preset)
    with _voice_prompt_cache_lock:
        cached = _voice_prompt_cache.get(key)
        if cached is not None:
            return cached

    prompt_wav_path, prompt_text = _voice_prompt_inputs(voice_id, preset)
    if "VoxCPM2" in VOXCPM_MODEL:
        kwargs = {"reference_wav_path": preset["file"]}
        if prompt_text:
            kwargs.update({"prompt_wav_path": prompt_wav_path, "prompt_text": prompt_text})
    else:
        kwargs = {"prompt_wav_path": prompt_wav_path, "prompt_text": prompt_text}

    print(f"[tts] building voice prompt cache for {voice_id}", file=sys.stderr, flush=True)
    cache = model.tts_model.build_prompt_cache(**kwargs)
    with _voice_prompt_cache_lock:
        _voice_prompt_cache[key] = cache
    return cache


def _stream_with_prompt_cache(model, text: str, req: TTSRequest, voice_id: str, preset: dict):
    text = _normalize_text(model, text, req.normalize)
    prompt_cache = _get_voice_prompt_cache(model, voice_id, preset)
    for wav, _, _ in model.tts_model.generate_with_prompt_cache_streaming(
        target_text=text,
        prompt_cache=prompt_cache,
        inference_timesteps=req.inference_timesteps,
        cfg_value=req.cfg_value,
        retry_badcase_ratio_threshold=VOICE_LOCK_AUDIO_TEXT_RATIO,
    ):
        yield wav.squeeze(0).cpu().numpy()


def _generate_with_prompt_cache(model, text: str, req: TTSRequest, voice_id: str, preset: dict):
    text = _normalize_text(model, text, req.normalize)
    prompt_cache = _get_voice_prompt_cache(model, voice_id, preset)
    wav, _, _ = model.tts_model.generate_with_prompt_cache(
        target_text=text,
        prompt_cache=prompt_cache,
        inference_timesteps=req.inference_timesteps,
        cfg_value=req.cfg_value,
        retry_badcase_ratio_threshold=VOICE_LOCK_AUDIO_TEXT_RATIO,
    )
    return wav.squeeze(0).cpu().numpy()


def _transcribe_whisper(path: str, language: str | None = None) -> tuple[str, str]:
    model = _load_asr()
    with _asr_infer_lock:
        segments, info = model.transcribe(path, language=language or None, vad_filter=True, beam_size=5)
    return "".join(seg.text for seg in segments).strip(), info.language


_SENSEVOICE_TAG_RE = re.compile(r"<\|[^>]+?\|>")


def _transcribe_sensevoice(path: str, language: str | None = None) -> tuple[str, str]:
    model = _load_sensevoice()
    lang = language or "auto"
    with _sensevoice_infer_lock:
        res = model.generate(input=path, language=lang, use_itn=True)
    raw = str(res[0].get("text", "")) if res else ""
    text = _SENSEVOICE_TAG_RE.sub("", raw).strip()
    return text, lang


async def _transcribe_voxtral_realtime(path: str) -> tuple[str, str]:
    if not MISTRAL_API_KEY:
        raise HTTPException(status_code=400, detail="MISTRAL_API_KEY is not configured")

    try:
        from faster_whisper.audio import decode_audio
        from mistralai.client import Mistral
        from mistralai.client.models import AudioFormat
    except Exception as exc:
        raise HTTPException(
            status_code=501,
            detail="Install mistralai[realtime] and faster-whisper to use Voxtral Realtime",
        ) from exc

    wav = decode_audio(path, sampling_rate=16000)
    pcm = _f32_to_pcm16(wav)
    chunk_bytes = max(1600, int(16000 * 2 * VOXTRAL_CHUNK_MS / 1000))

    async def audio_stream():
        for start in range(0, len(pcm), chunk_bytes):
            yield pcm[start : start + chunk_bytes]

    client = Mistral(api_key=MISTRAL_API_KEY)
    audio_format = AudioFormat(encoding="pcm_s16le", sample_rate=16000)
    parts: list[str] = []

    try:
        async for event in client.audio.realtime.transcribe_stream(
            audio_stream=audio_stream(),
            model=VOXTRAL_REALTIME_MODEL,
            audio_format=audio_format,
            target_streaming_delay_ms=VOXTRAL_TARGET_DELAY_MS,
        ):
            event_name = event.__class__.__name__
            if event_name == "RealtimeTranscriptionError":
                raise HTTPException(status_code=502, detail=str(event))
            text = getattr(event, "text", None)
            if text:
                parts.append(str(text))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Voxtral transcription failed: {exc}") from exc

    return "".join(parts).strip(), "auto"


def _normalize_asr_model(model: str | None) -> str:
    value = (model or DEFAULT_ASR_MODEL or "").strip().lower().replace("_", "-")
    if "voxtral" in value:
        return "voxtral-realtime"
    if "sense" in value or "funaudio" in value:
        return "sensevoice-small"
    if "whisper" in value:
        return "whisper"
    return "sensevoice-small"


async def _run_transcription(
    path: str,
    language: str | None,
    model: str | None,
) -> tuple[str, str, str]:
    normalized = _normalize_asr_model(model)
    if normalized == "voxtral-realtime":
        text, lang = await _transcribe_voxtral_realtime(path)
        return text, lang, normalized
    if normalized == "whisper":
        text, lang = _transcribe_whisper(path, language)
        return text, lang, normalized
    text, lang = _transcribe_sensevoice(path, language)
    return text, lang, normalized


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": _resolve_device(),
        "tts_loaded": _tts is not None,
        "asr_loaded": {
            "sensevoice-small": _sensevoice is not None,
            "whisper": _asr is not None,
            "voxtral-realtime": bool(MISTRAL_API_KEY),
        },
        "default_asr_model": _normalize_asr_model(DEFAULT_ASR_MODEL),
        "voxcpm_model": VOXCPM_MODEL,
        "voice_cloning_enabled": "VoxCPM2" in VOXCPM_MODEL,
        "voice_prompt_cache_entries": len(_voice_prompt_cache),
        "sensevoice_model": SENSEVOICE_MODEL,
        "sensevoice_resolved_model": _resolve_sensevoice_model(),
        "voxtral_realtime_model": VOXTRAL_REALTIME_MODEL,
        "whisper_model": WHISPER_MODEL,
        "sample_rate": _sample_rate,
        "reference_wav": DEFAULT_REFERENCE_WAV or None,
    }


@app.get("/voices")
def voices():
    # Reload from disk so freshly generated presets show up without a restart.
    global VOICES
    VOICES = _load_voices()
    return {
        "voices": [
            {"id": v["id"], "label": v.get("label", v["id"]), "gender": v.get("gender", "")}
            for v in VOICES.values()
        ],
        "default": DEFAULT_VOICE or None,
    }


@app.post("/asr")
async def asr(
    file: UploadFile = File(...),
    language: str | None = Form(None),
    model: str | None = Form(None),
):
    data = await file.read()
    suffix = os.path.splitext(file.filename or "")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(data)
        path = tmp.name
    try:
        try:
            text, lang, resolved_model = await _run_transcription(path, language, model)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"ASR failed: {exc}") from exc
        return {"text": text, "language": lang, "model": resolved_model}
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


@app.post("/voices/add")
async def add_voice(
    file: UploadFile = File(...),
    label: str = Form(...),
    gender: str = Form("custom"),
    transcript: str | None = Form(None),
    ultimate: bool = Form(True),
):
    """Extract a voice from an uploaded clip and register it as a preset.

    With ``ultimate`` (default) we transcribe the clip (Whisper) when no
    transcript is given, enabling highest-fidelity cloning.
    """
    os.makedirs(VOICES_DIR, exist_ok=True)
    # Stable-ish id from the label, de-duplicated against existing ids.
    base = "u_" + "".join(c if c.isalnum() else "_" for c in label.strip())[:24].strip("_").lower()
    vid, n = base, 1
    existing = _load_voices()
    while vid in existing:
        n += 1
        vid = f"{base}_{n}"

    data = await file.read()
    if len(data) < 2000:
        raise HTTPException(status_code=400, detail="audio too short/empty")
    dest = os.path.join(VOICES_DIR, f"{vid}.wav")
    # Re-encode whatever was uploaded to a clean mono wav via soundfile/ffmpeg path.
    suffix = os.path.splitext(file.filename or "")[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        import soundfile as sf
        from faster_whisper.audio import decode_audio

        # PyAV-based decode handles m4a/aac/mp3/ogg/wav/… (libsndfile can't do m4a).
        wav = decode_audio(tmp_path, sampling_rate=16000)  # mono float32, 16k
        sf.write(dest, wav, 16000)
        prompt_text = None
        if ultimate:
            prompt_text = (transcript or "").strip() or (
                await _run_transcription(dest, None, DEFAULT_ASR_MODEL)
            )[0]
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    entry = {"id": vid, "label": label.strip(), "gender": gender or "custom", "file": dest}
    if prompt_text:
        entry["prompt_text"] = prompt_text

    items = list(_load_voices().values())
    items.append(entry)
    with open(os.path.join(VOICES_DIR, "voices.json"), "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

    global VOICES
    VOICES = _load_voices()
    return {"id": vid, "label": entry["label"], "gender": entry["gender"], "prompt_text": prompt_text}


class VoiceEdit(BaseModel):
    id: str
    label: str | None = None


def _save_voices(items: list):
    with open(os.path.join(VOICES_DIR, "voices.json"), "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    global VOICES
    VOICES = _load_voices()


def _read_voices_raw() -> list:
    try:
        with open(os.path.join(VOICES_DIR, "voices.json"), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


@app.post("/voices/rename")
def rename_voice(req: VoiceEdit):
    if not req.id.startswith("u_"):
        raise HTTPException(status_code=400, detail="only custom voices can be renamed")
    label = (req.label or "").strip()
    if not label:
        raise HTTPException(status_code=400, detail="label required")
    items = _read_voices_raw()
    found = False
    for v in items:
        if v.get("id") == req.id:
            v["label"] = label
            found = True
    if not found:
        raise HTTPException(status_code=404, detail="voice not found")
    _save_voices(items)
    return {"id": req.id, "label": label}


@app.post("/voices/delete")
def delete_voice(req: VoiceEdit):
    if not req.id.startswith("u_"):
        raise HTTPException(status_code=400, detail="only custom voices can be deleted")
    items = _read_voices_raw()
    kept, removed = [], None
    for v in items:
        if v.get("id") == req.id:
            removed = v
        else:
            kept.append(v)
    if removed is None:
        raise HTTPException(status_code=404, detail="voice not found")
    _save_voices(kept)
    try:
        if removed.get("file") and os.path.exists(removed["file"]):
            os.unlink(removed["file"])
    except OSError:
        pass
    return {"deleted": req.id}


@app.post("/tts/stream")
def tts_stream(req: TTSRequest):
    model = _load_tts()
    text = _compose_text(req)
    cache_spec = _voice_cache_spec(req)
    clone = _clone_kwargs(req)

    def gen():
        with _tts_infer_lock:
            source = (
                _stream_with_prompt_cache(model, text, req, cache_spec[0], cache_spec[1])
                if cache_spec
                else model.generate_streaming(
                    text=text,
                    cfg_value=req.cfg_value,
                    inference_timesteps=req.inference_timesteps,
                    normalize=req.normalize,
                    **clone,
                )
            )
            for chunk in source:
                yield _f32_to_pcm16(chunk)

    return StreamingResponse(
        gen(),
        media_type="application/octet-stream",
        headers={
            "X-Sample-Rate": str(_sample_rate),
            "Cache-Control": "no-store",
        },
    )


@app.post("/tts")
def tts(req: TTSRequest):
    model = _load_tts()
    text = _compose_text(req)
    cache_spec = _voice_cache_spec(req)
    with _tts_infer_lock:
        if cache_spec:
            wav = _generate_with_prompt_cache(model, text, req, cache_spec[0], cache_spec[1])
        else:
            wav = model.generate(
                text=text,
                cfg_value=req.cfg_value,
                inference_timesteps=req.inference_timesteps,
                normalize=req.normalize,
                **_clone_kwargs(req),
            )
    data = _pcm16_to_wav(_f32_to_pcm16(wav), _sample_rate)
    return Response(content=data, media_type="audio/wav")


@app.on_event("startup")
def _warmup():
    if os.environ.get("EAGER_LOAD", "1") == "1":
        try:
            _load_tts()
            default_asr = _normalize_asr_model(DEFAULT_ASR_MODEL)
            if default_asr == "sensevoice-small":
                _load_sensevoice()
            elif default_asr == "whisper":
                _load_asr()
        except Exception as exc:  # pragma: no cover - warmup is best effort
            print(f"[warmup] deferred: {exc}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
