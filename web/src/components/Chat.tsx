"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AsrModelId,
  type TranscriptionResult,
  useRecorder,
} from "@/lib/useRecorder";
import { takeSentences, VoicePlayer } from "@/lib/voicePlayer";

type VoicePreset = { id: string; label: string; gender: string };
type MetricState = {
  asrModel?: AsrModelId;
  asrMs?: number;
  language?: string;
  llmFirstTokenMs?: number;
  llmTotalMs?: number;
  ttsFirstAudioMs?: number;
  ttsTotalMs?: number;
};

const STT_MODELS: { id: AsrModelId; label: string; detail: string }[] = [
  {
    id: "sensevoice-small",
    label: "SenseVoice-Small",
    detail: "FunAudioLLM local",
  },
  {
    id: "voxtral-realtime",
    label: "Voxtral Realtime",
    detail: "Mistral realtime API",
  },
];

const GROK_MODELS = [
  { id: "x-ai/grok-4.3", label: "Grok 4.3 · fastest current" },
  { id: "x-ai/grok-4.1-fast", label: "Grok 4.1 Fast" },
  { id: "x-ai/grok-4-fast", label: "Grok 4 Fast" },
  { id: "x-ai/grok-3-mini-fast", label: "Grok 3 Mini Fast" },
];

const VOICE_ASR_MODEL: AsrModelId = "sensevoice-small";
const TTS_INFERENCE_TIMESTEPS = 6;
const UPLOAD_STAGES = ["上传音频", "整理样本", "写入音色", "即将完成"];

function messageText(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

const EMOTION_RE =
  /^[\s\n]*(?:(?:\[\[|\[|\(|（|【)\s*(?:emotion|情绪)?\s*[:：]?\s*([^\])）】]{1,16}?)\s*(?:\]\]|\]|\)|）|】)|(?:emotion|情绪)\s*[:：]\s*(\S{1,8}))[\s，,。.：:、]*/i;

function parseEmotion(raw: string): { text: string } {
  const m = raw.match(EMOTION_RE);
  if (m) return { text: raw.slice(m[0].length) };
  return { text: raw };
}

function displayText(raw: string): string {
  const m = raw.match(EMOTION_RE);
  if (m) return raw.slice(m[0].length);
  if (raw.trimStart().startsWith("[[") && !raw.includes("]]")) return "";
  return raw;
}

function formatMs(value?: number) {
  if (typeof value !== "number") return "—";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function ttsOptionsForVoice(voice: string): Record<string, unknown> {
  return {
    ...(voice ? { voice } : {}),
    inference_timesteps: TTS_INFERENCE_TIMESTEPS,
  };
}

export default function Chat() {
  const [voiceOn, setVoiceOn] = useState(true);
  const [model, setModel] = useState(GROK_MODELS[0].id);
  const [asrModel, setAsrModel] = useState<AsrModelId>(STT_MODELS[0].id);
  const [input, setInput] = useState("");
  const [voicePhase, setVoicePhase] = useState<"idle" | "synthesizing" | "speaking">("idle");
  const [voice, setVoice] = useState("");
  const [voices, setVoices] = useState<VoicePreset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadStage, setUploadStage] = useState(0);
  const [cloneRequesting, setCloneRequesting] = useState(false);
  const [cloneRecording, setCloneRecording] = useState(false);
  const [metrics, setMetrics] = useState<MetricState>({});
  const [voiceLoopActive, setVoiceLoopActive] = useState(false);
  const speaking = voicePhase === "speaking";
  const ttsBusy = voicePhase !== "idle";

  const playerRef = useRef<VoicePlayer | null>(null);
  const spokenRef = useRef<{ id: string; len: number }>({ id: "", len: 0 });
  const ttsOptsRef = useRef<Record<string, unknown>>({});
  const llmStartRef = useRef(0);
  const llmFirstTokenReportedRef = useRef(false);
  const ttsStartRef = useRef(0);
  const ttsFirstAudioReportedRef = useRef(false);
  const cloneMediaRef = useRef<MediaRecorder | null>(null);
  const cloneChunksRef = useRef<Blob[]>([]);
  const cloneStreamRef = useRef<MediaStream | null>(null);
  const voiceLoopActiveRef = useRef(false);
  const voiceTurnInFlightRef = useRef(false);
  const listenAfterSpeechRef = useRef(false);
  const recorderStartRef = useRef<(() => void) | null>(null);
  const listeningStartPendingRef = useRef(false);
  const chatBusyRef = useRef(false);
  const ttsTailRef = useRef("");
  const ttsSpeechQueuedRef = useRef(false);

  const { messages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  useEffect(() => {
    voiceLoopActiveRef.current = voiceLoopActive;
  }, [voiceLoopActive]);

  useEffect(() => {
    chatBusyRef.current = status === "streaming" || status === "submitted";
  }, [status]);

  const getPlayer = useCallback(() => {
    if (!playerRef.current) {
      const p = new VoicePlayer(ttsOptsRef.current);
      p.onPhase = (phase) => {
        setVoicePhase(phase);
        if (phase !== "idle") {
          ttsSpeechQueuedRef.current = true;
        }
        if (phase === "idle") {
          ttsSpeechQueuedRef.current = false;
        }
        if (phase === "idle" && ttsStartRef.current && !chatBusyRef.current) {
          const total = Math.round(performance.now() - ttsStartRef.current);
          setMetrics((m) => ({ ...m, ttsTotalMs: total }));
          ttsStartRef.current = 0;
        }
        if (
          phase === "idle" &&
          listenAfterSpeechRef.current &&
          voiceLoopActiveRef.current &&
          !chatBusyRef.current
        ) {
          listenAfterSpeechRef.current = false;
          voiceTurnInFlightRef.current = false;
          window.setTimeout(() => recorderStartRef.current?.(), 520);
        }
      };
      p.onFirstAudio = () => {
        if (!ttsStartRef.current || ttsFirstAudioReportedRef.current) return;
        ttsFirstAudioReportedRef.current = true;
        const first = Math.round(performance.now() - ttsStartRef.current);
        setMetrics((m) => ({ ...m, ttsFirstAudioMs: first }));
      };
      playerRef.current = p;
    }
    return playerRef.current;
  }, []);

  const refreshVoices = useCallback(async () => {
    try {
      const data = await (await fetch("/api/voices")).json();
      const nextVoices = Array.isArray(data.voices) ? data.voices : [];
      setVoices(nextVoices);
      setVoice((current) => current || data.default || nextVoices[0]?.id || "");
    } catch {
      setVoices([]);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void refreshVoices(), 0);
    return () => window.clearTimeout(id);
  }, [refreshVoices]);

  useEffect(() => {
    ttsOptsRef.current = ttsOptionsForVoice(voice);
    playerRef.current?.setOptions(ttsOptsRef.current);
  }, [voice]);

  useEffect(() => {
    if (!uploading) return;
    const id = window.setInterval(
      () => setUploadStage((s) => Math.min(s + 1, UPLOAD_STAGES.length - 1)),
      1300,
    );
    return () => window.clearInterval(id);
  }, [uploading]);

  useEffect(() => {
    if (!llmStartRef.current || llmFirstTokenReportedRef.current) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const text = displayText(messageText(last)).trim();
    if (!text) return;
    llmFirstTokenReportedRef.current = true;
    setMetrics((m) => ({
      ...m,
      llmFirstTokenMs: Math.round(performance.now() - llmStartRef.current),
    }));
  }, [messages]);

  useEffect(() => {
    if (!llmStartRef.current) return;
    if (status === "streaming" || status === "submitted") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const total = Math.round(performance.now() - llmStartRef.current);
    setMetrics((m) => ({ ...m, llmTotalMs: total }));
    llmStartRef.current = 0;
  }, [messages, status]);

  useEffect(() => {
    if (!voiceOn) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;

    const raw = messageText(last);
    if (raw.trimStart().startsWith("[[") && !raw.includes("]]")) return;
    const clean = parseEmotion(raw).text;

    if (spokenRef.current.id !== last.id) {
      spokenRef.current = { id: last.id, len: 0 };
      ttsTailRef.current = "";
    }
    if (clean.length < spokenRef.current.len) {
      spokenRef.current = { id: last.id, len: 0 };
      ttsTailRef.current = "";
    }

    const delta = clean.slice(spokenRef.current.len);
    const final = status !== "streaming" && status !== "submitted";
    if (!delta && !final) return;

    const pulled = takeSentences(ttsTailRef.current + delta, { allowSoftBreaks: final });
    const ready = pulled.sentences;
    let rest = pulled.rest;
    if (final && rest.trim()) {
      ready.push(rest.trim());
      rest = "";
    }

    ttsTailRef.current = rest;
    spokenRef.current = { id: last.id, len: clean.length };
    if (!ready.length) return;

    const player = getPlayer();
    player.setOptions(ttsOptionsForVoice(voice));
    if (!ttsStartRef.current) ttsStartRef.current = performance.now();
    listenAfterSpeechRef.current = voiceLoopActiveRef.current;
    for (const sentence of ready) {
      player.speak(sentence);
    }
  }, [messages, status, voiceOn, getPlayer, voice]);

  const submit = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || status === "streaming" || status === "submitted") return false;
      playerRef.current?.stop();
      if (voiceOn) getPlayer().prime();
      if (voiceLoopActiveRef.current) voiceTurnInFlightRef.current = true;
      spokenRef.current = { id: "", len: 0 };
      ttsTailRef.current = "";
      llmStartRef.current = performance.now();
      llmFirstTokenReportedRef.current = false;
      ttsFirstAudioReportedRef.current = false;
      setMetrics((m) => ({
        ...m,
        llmFirstTokenMs: undefined,
        llmTotalMs: undefined,
        ttsFirstAudioMs: undefined,
        ttsTotalMs: undefined,
      }));
      sendMessage({ text: t }, { body: { model } });
      setInput("");
      return true;
    },
    [sendMessage, status, model, voiceOn, getPlayer],
  );

  const handleTranscription = useCallback(
    (result: TranscriptionResult) => {
      const text = result.text.trim();
      setMetrics((m) => ({
        ...m,
        asrModel: result.model,
        asrMs: result.latencyMs,
        language: result.language,
      }));
      if (!text) return;
      if (voiceLoopActiveRef.current && submit(text)) return;
      setInput((prev) => (prev ? `${prev} ${text}` : text));
    },
    [submit],
  );

  const recorder = useRecorder(asrModel, handleTranscription);

  useEffect(() => {
    if (!recorder.error) return;
    voiceTurnInFlightRef.current = false;
    listenAfterSpeechRef.current = false;
    listeningStartPendingRef.current = false;
    if (/RunPod|SSH|语音后端|连接失败|转写失败|ASR 转写超时/.test(recorder.error)) {
      voiceLoopActiveRef.current = false;
      const id = window.setTimeout(() => setVoiceLoopActive(false), 0);
      return () => window.clearTimeout(id);
    }
  }, [recorder.error]);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploadStage(0);
      setUploading(true);
      setUploadMsg("提取中");
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("label", file.name.replace(/\.[^.]+$/, "").slice(0, 24) || "我的音色");
        fd.append("gender", "custom");
        fd.append("ultimate", "true");
        const res = await fetch("/api/voices/add", { method: "POST", body: fd });
        const data = await res.json();
        if (data.id) {
          await refreshVoices();
          setVoice(data.id);
          playerRef.current?.stop();
          setUploadMsg(`已选用：${data.label}`);
        } else {
          setUploadMsg(data.error || data.detail || "提取失败");
        }
      } catch {
        setUploadMsg("上传失败");
      } finally {
        setUploading(false);
      }
    },
    [refreshVoices],
  );

  const stopCloneRecording = useCallback(() => {
    if (cloneMediaRef.current && cloneMediaRef.current.state !== "inactive") {
      cloneMediaRef.current.stop();
    }
  }, []);

  const startCloneRecording = useCallback(async () => {
    setCloneRequesting(true);
    setUploadMsg("正在请求麦克风权限");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("microphone API unavailable");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      cloneStreamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      cloneChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) cloneChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        cloneStreamRef.current?.getTracks().forEach((track) => track.stop());
        cloneStreamRef.current = null;
        setCloneRecording(false);
        const blob = new Blob(cloneChunksRef.current, { type: mime || "audio/webm" });
        if (blob.size < 2000) {
          setUploadMsg("录音太短");
          return;
        }
        const ext = (mime || "audio/webm").includes("mp4") ? "mp4" : "webm";
        const file = new File([blob], `voice_${new Date().toISOString().slice(11, 19)}.${ext}`, {
          type: mime || "audio/webm",
        });
        void handleUpload(file);
      };
      rec.start();
      cloneMediaRef.current = rec;
      setCloneRequesting(false);
      setCloneRecording(true);
      setUploadMsg("正在录制音色样本");
    } catch {
      setCloneRequesting(false);
      setUploadMsg(
        window.isSecureContext
          ? "麦克风权限被拒绝或不可用"
          : "当前地址不支持麦克风，请用 http://localhost 或 HTTPS 打开",
      );
    }
  }, [handleUpload]);

  const toggleCloneRecording = useCallback(() => {
    if (cloneRecording) stopCloneRecording();
    else void startCloneRecording();
  }, [cloneRecording, startCloneRecording, stopCloneRecording]);

  const renameVoice = useCallback(
    async (id: string, label: string) => {
      const t = label.trim();
      if (!t) return;
      await fetch("/api/voices/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", id, label: t }),
      });
      await refreshVoices();
    },
    [refreshVoices],
  );

  const deleteVoice = useCallback(
    async (id: string) => {
      await fetch("/api/voices/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      playerRef.current?.stop();
      await refreshVoices();
      setVoice((cur) => (cur === id ? "" : cur));
    },
    [refreshVoices],
  );

  const busy = status === "streaming" || status === "submitted";
  const empty = messages.length === 0;
  const selectedAsr = STT_MODELS.find((item) => item.id === asrModel) ?? STT_MODELS[0];
  const customVoices = voices.filter((v) => v.gender !== "male" && v.gender !== "female");
  const micBlocked =
    recorder.error?.includes("权限") ||
    recorder.error?.includes("不可用") ||
    recorder.error?.includes("不支持");

  const startVoiceListening = useCallback(() => {
    if (
      !voiceLoopActiveRef.current ||
      recorder.state !== "idle" ||
      micBlocked ||
      voiceTurnInFlightRef.current ||
      listeningStartPendingRef.current
    ) {
      return;
    }
    listeningStartPendingRef.current = true;
    setAsrModel(VOICE_ASR_MODEL);
    void recorder
      .start(VOICE_ASR_MODEL, {
        autoStop: true,
        silenceMs: 850,
        minRecordingMs: 700,
        maxRecordingMs: 12_000,
        noSpeechTimeoutMs: 5_500,
        speechThreshold: 0.035,
        minAudioLevel: 0.008,
      })
      .finally(() => {
        listeningStartPendingRef.current = false;
      });
  }, [micBlocked, recorder]);

  useEffect(() => {
    recorderStartRef.current = startVoiceListening;
    return () => {
      recorderStartRef.current = null;
    };
  }, [startVoiceListening]);

  useEffect(() => {
    if (
      !voiceLoopActive ||
      busy ||
      ttsBusy ||
      ttsSpeechQueuedRef.current ||
      !listenAfterSpeechRef.current
    ) {
      return;
    }
    const id = window.setTimeout(() => {
      if (
        !voiceLoopActiveRef.current ||
        chatBusyRef.current ||
        ttsSpeechQueuedRef.current ||
        !listenAfterSpeechRef.current
      ) {
        return;
      }
      if (ttsStartRef.current) {
        const total = Math.round(performance.now() - ttsStartRef.current);
        setMetrics((m) => ({ ...m, ttsTotalMs: total }));
        ttsStartRef.current = 0;
      }
      listenAfterSpeechRef.current = false;
      voiceTurnInFlightRef.current = false;
      recorderStartRef.current?.();
    }, 520);
    return () => window.clearTimeout(id);
  }, [busy, ttsBusy, voiceLoopActive]);

  useEffect(() => {
    if (
      !voiceLoopActive ||
      recorder.state !== "idle" ||
      micBlocked ||
      busy ||
      ttsBusy ||
      voiceTurnInFlightRef.current ||
      listenAfterSpeechRef.current ||
      listeningStartPendingRef.current
    ) {
      return;
    }
    const id = window.setTimeout(() => recorderStartRef.current?.(), 700);
    return () => window.clearTimeout(id);
  }, [busy, micBlocked, recorder.state, ttsBusy, voiceLoopActive]);

  const startVoiceLoop = useCallback(() => {
    getPlayer().prime();
    playerRef.current?.stop();
    if (busy) stop();
    voiceLoopActiveRef.current = true;
    voiceTurnInFlightRef.current = false;
    listenAfterSpeechRef.current = false;
    listeningStartPendingRef.current = false;
    setVoiceLoopActive(true);
    setVoiceOn(true);
    setAsrModel(VOICE_ASR_MODEL);
    if (
      recorder.state === "recording" ||
      recorder.state === "requesting" ||
      recorder.state === "transcribing"
    ) {
      recorder.cancel();
    }
    window.setTimeout(() => recorderStartRef.current?.(), 180);
  }, [busy, getPlayer, recorder, stop]);

  const stopVoiceLoop = useCallback(() => {
    voiceLoopActiveRef.current = false;
    voiceTurnInFlightRef.current = false;
    listenAfterSpeechRef.current = false;
    listeningStartPendingRef.current = false;
    setVoiceLoopActive(false);
    stop();
    playerRef.current?.stop();
    if (
      recorder.state === "recording" ||
      recorder.state === "requesting" ||
      recorder.state === "transcribing"
    ) {
      recorder.cancel();
    }
  }, [recorder, stop]);

  const interruptVoiceLoop = useCallback(() => {
    stop();
    playerRef.current?.stop();
    spokenRef.current = { id: "", len: 0 };
    llmStartRef.current = 0;
    voiceTurnInFlightRef.current = false;
    listenAfterSpeechRef.current = false;
    listeningStartPendingRef.current = false;
    window.setTimeout(() => recorderStartRef.current?.(), 520);
  }, [stop]);

  const placeholder = useMemo(() => {
    if (voiceLoopActive && speaking) return "正在回答";
    if (voiceLoopActive && voicePhase === "synthesizing") return "正在合成语音";
    if (voiceLoopActive && busy) return "正在思考";
    if (recorder.state === "requesting") return "正在请求麦克风权限";
    if (recorder.state === "recording") return `${selectedAsr.label} 聆听中`;
    if (recorder.state === "transcribing") return `${selectedAsr.label} 转写中`;
    if (voiceLoopActive) return "语音对话中";
    return "输入文字，或开始语音对话";
  }, [busy, recorder.state, selectedAsr.label, speaking, voiceLoopActive, voicePhase]);

  const voiceStageLabel = useMemo(() => {
    if (speaking) return "正在回答";
    if (voicePhase === "synthesizing") return "正在合成语音";
    if (busy) return "正在思考";
    if (recorder.state === "transcribing") return "正在理解";
    if (recorder.state === "requesting") return "请求麦克风权限";
    if (recorder.state === "recording") {
      return recorder.level > 0.07 ? "正在听你说话" : "聆听中";
    }
    return voiceLoopActive ? "准备聆听" : "语音待机";
  }, [busy, recorder.level, recorder.state, speaking, voiceLoopActive, voicePhase]);

  const voiceLevel = speaking
    ? 0.9
    : voicePhase === "synthesizing"
      ? 0.35
      : recorder.state === "recording"
        ? recorder.level
        : busy
          ? 0.45
          : 0.12;
  const orbScale = 1 + Math.min(0.28, voiceLevel * 0.26);

  return (
    <div className="flex h-dvh flex-col bg-[var(--bg)] text-[var(--fg)]">
      <header className="border-b border-white/10 bg-[#101418]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`relative flex h-2.5 w-2.5 ${speaking ? "" : "opacity-45"}`}>
              <span
                className={`absolute inline-flex h-full w-full rounded-full bg-cyan-300 ${
                  speaking ? "animate-ping" : ""
                }`}
              />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-300" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-normal">
                VoxCPM Voice Conversation Lab
              </h1>
              <p className="truncate text-xs text-white/45">
                {selectedAsr.label} · {GROK_MODELS.find((m) => m.id === model)?.label ?? model}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (voiceOn) {
                if (voiceLoopActive) stopVoiceLoop();
                playerRef.current?.stop();
                setVoiceOn(false);
                return;
              }
              getPlayer().prime();
              setVoiceOn(true);
            }}
            className={`h-9 rounded-md px-3 text-xs font-medium transition ${
              voiceOn
                ? "bg-cyan-400/16 text-cyan-200 hover:bg-cyan-400/24"
                : "bg-white/7 text-white/55 hover:bg-white/12"
            }`}
          >
            {voiceOn ? "Voice on" : "Voice off"}
          </button>
        </div>
      </header>

      <section className="border-b border-white/10 bg-[#15191d] px-4 py-3">
        <div className="mx-auto grid max-w-5xl gap-3 lg:grid-cols-[1.2fr_1fr_1.2fr]">
          <ControlGroup label="STT">
            <div className="grid grid-cols-2 gap-2">
              {STT_MODELS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={voiceLoopActive && item.id !== VOICE_ASR_MODEL}
                  onClick={() => {
                    if (!voiceLoopActive) setAsrModel(item.id);
                  }}
                  className={`min-h-16 rounded-md border px-3 py-2 text-left transition ${
                    asrModel === item.id
                      ? "border-cyan-300/60 bg-cyan-300/12 text-cyan-100"
                      : "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.07] disabled:opacity-40"
                  }`}
                >
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-xs text-white/45">{item.detail}</span>
                </button>
              ))}
            </div>
          </ControlGroup>

          <ControlGroup label="LLM">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-cyan-300/60"
            >
              {GROK_MODELS.map((m) => (
                <option key={m.id} value={m.id} className="bg-neutral-900">
                  {m.label}
                </option>
              ))}
            </select>
          </ControlGroup>

          <ControlGroup label="VoxCPM Voice">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select
                value={voice}
                onChange={(e) => {
                  setVoice(e.target.value);
                  playerRef.current?.stop();
                }}
                className="h-10 min-w-0 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-cyan-300/60"
              >
                <option value="" className="bg-neutral-900">
                  默认音色
                </option>
                <VoiceOptions voices={voices} />
              </select>
              <button
                type="button"
                disabled={uploading || cloneRequesting}
                onClick={toggleCloneRecording}
                className={`h-10 rounded-md px-3 text-xs font-medium transition disabled:opacity-50 ${
                  cloneRecording
                    ? "bg-red-500/85 text-white hover:bg-red-400"
                    : "bg-amber-400/15 text-amber-200 hover:bg-amber-400/24"
                }`}
              >
                {cloneRequesting ? "授权中" : cloneRecording ? "停止录制" : "录制音色"}
              </button>
            </div>
            <label className="mt-2 block">
              <input
                type="file"
                accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.flac,.amr"
                disabled={uploading || cloneRecording}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                  e.target.value = "";
                }}
                className="block w-full text-xs text-white/55 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white/75 disabled:opacity-50"
              />
            </label>
            <div className="mt-2 min-h-5 text-xs">
              {uploading ? (
                <span className="inline-flex items-center gap-2 text-cyan-200">
                  <Spinner />
                  {UPLOAD_STAGES[uploadStage]}
                </span>
              ) : (
                <span className={uploadMsg ? "text-amber-200/85" : "text-white/40"}>
                  {uploadMsg || "5-15 秒干净人声样本"}
                </span>
              )}
            </div>
          </ControlGroup>
        </div>

        <div className="mx-auto mt-3 grid max-w-5xl gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="ASR" value={formatMs(metrics.asrMs)} />
          <Metric label="ASR model" value={metrics.asrModel ?? "—"} />
          <Metric label="Language" value={metrics.language ?? "—"} />
          <Metric label="LLM first" value={formatMs(metrics.llmFirstTokenMs)} />
          <Metric label="TTS first" value={formatMs(metrics.ttsFirstAudioMs)} />
          <Metric label="TTS total" value={formatMs(metrics.ttsTotalMs)} />
        </div>

        {customVoices.length > 0 && (
          <div className="mx-auto mt-3 flex max-w-5xl flex-wrap gap-2">
            {customVoices.map((v) => (
              <div
                key={v.id}
                className="grid grid-cols-[minmax(120px,220px)_auto] items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] p-1"
              >
                <input
                  defaultValue={v.label}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  onBlur={(e) => {
                    const nv = e.target.value.trim();
                    if (nv && nv !== v.label) void renameVoice(v.id, nv);
                  }}
                  className="min-w-0 rounded bg-transparent px-2 py-1 text-xs outline-none focus:bg-white/8"
                />
                <button
                  type="button"
                  onClick={() => void deleteVoice(v.id)}
                  title="删除此音色"
                  className="h-7 w-7 rounded bg-red-500/15 text-sm text-red-200 transition hover:bg-red-500/25"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <main className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {empty && (
            <div className="mt-[14vh] flex flex-col items-center gap-4 text-center text-white/55">
              <div
                className={`grid h-20 w-20 place-items-center rounded-full border transition duration-200 ${
                  speaking
                    ? "border-cyan-200/70 bg-cyan-300/18 shadow-[0_0_42px_rgba(103,232,249,0.28)]"
                    : recorder.state === "recording"
                      ? "border-amber-200/60 bg-amber-300/16 shadow-[0_0_36px_rgba(252,211,77,0.2)]"
                      : voicePhase === "synthesizing"
                        ? "border-teal-200/60 bg-teal-300/14 shadow-[0_0_34px_rgba(94,234,212,0.16)]"
                      : busy || recorder.state === "transcribing"
                        ? "border-sky-200/60 bg-sky-300/14 shadow-[0_0_34px_rgba(125,211,252,0.18)]"
                        : "border-white/10 bg-white/[0.04]"
                }`}
                style={{ transform: `scale(${orbScale})` }}
              >
                <div
                  className="h-9 w-9 rounded-full bg-white/80 transition"
                  style={{ opacity: 0.28 + Math.min(0.45, voiceLevel * 0.45) }}
                />
              </div>
              <p className="text-sm">{voiceStageLabel}</p>
            </div>
          )}
          {messages.map((m) => {
            const isUser = m.role === "user";
            const text = isUser ? messageText(m) : displayText(messageText(m));
            return (
              <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-2.5 text-[15px] leading-relaxed ${
                    isUser
                      ? "bg-cyan-500 text-white"
                      : "border border-white/10 bg-white/[0.07] text-white/90"
                  }`}
                >
                  {text || (m.role === "assistant" && busy ? <Dots /> : null)}
                </div>
              </div>
            );
          })}
          {error && (
            <div className="rounded-md border border-red-400/20 bg-red-500/12 px-4 py-2 text-sm text-red-200">
              {error.message || "Something went wrong."}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-white/10 bg-[#101418]/95 px-4 py-3 backdrop-blur">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="mx-auto flex max-w-3xl items-end gap-2"
        >
          <button
            type="button"
            onClick={() => {
              if (voiceLoopActive) stopVoiceLoop();
              else startVoiceLoop();
            }}
            className={`h-11 w-14 shrink-0 rounded-md text-sm font-semibold transition ${
              voiceLoopActive
                ? "bg-red-500/90 text-white hover:bg-red-400"
                : "bg-cyan-500/85 text-white hover:bg-cyan-400"
            }`}
            title={voiceLoopActive ? "End voice conversation" : "Start voice conversation"}
          >
            {voiceLoopActive ? "End" : "Talk"}
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            rows={1}
            placeholder={placeholder}
            className="max-h-40 min-h-11 flex-1 resize-none rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-[15px] outline-none focus:border-cyan-300/60"
          />

          {voiceLoopActive && recorder.state === "recording" ? (
            <button
              type="button"
              onClick={recorder.stop}
              className="h-11 w-11 shrink-0 rounded-md bg-amber-400/85 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300"
              title="Finish recording"
            >
              Done
            </button>
          ) : voiceLoopActive && recorder.state === "transcribing" ? (
            <button
              type="button"
              disabled
              className="h-11 w-11 shrink-0 rounded-md bg-white/10 text-sm font-semibold text-white/50"
              title="Transcribing"
            >
              ...
            </button>
          ) : voiceLoopActive && (busy || ttsBusy) ? (
            <button
              type="button"
              onClick={interruptVoiceLoop}
              className="h-11 w-11 shrink-0 rounded-md bg-white/10 text-sm font-semibold text-white/80 transition hover:bg-white/16"
              title="Interrupt"
            >
              Cut
            </button>
          ) : busy || ttsBusy ? (
            <button
              type="button"
              onClick={() => {
                stop();
                playerRef.current?.stop();
              }}
              className="h-11 w-11 shrink-0 rounded-md bg-white/10 text-sm font-semibold text-white/80 transition hover:bg-white/16"
              title="Stop"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || (voiceLoopActive && recorder.state !== "idle")}
              className="h-11 w-11 shrink-0 rounded-md bg-cyan-500 text-sm font-semibold text-white transition hover:bg-cyan-400 disabled:opacity-30"
              title="Send"
            >
              Send
            </button>
          )}
        </form>
        {(voiceLoopActive || recorder.state !== "idle" || ttsBusy) && (
          <div className="mx-auto mt-2 grid max-w-3xl grid-cols-[auto_1fr_auto] items-center gap-3 text-xs text-white/55">
            <span>{voiceStageLabel}</span>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-[width] ${
                  speaking
                    ? "bg-cyan-300"
                    : recorder.level > 0.08
                      ? "bg-cyan-300"
                      : "bg-amber-300"
                }`}
                style={{ width: `${Math.max(4, Math.round(voiceLevel * 100))}%` }}
              />
            </div>
            <span>
              {recorder.state === "recording"
                ? formatElapsed(recorder.elapsedMs)
                : voiceLoopActive
                  ? selectedAsr.label
                  : ""}
            </span>
          </div>
        )}
        {recorder.error && (
          <p className="mx-auto mt-1.5 max-w-3xl text-xs text-red-300">{recorder.error}</p>
        )}
      </footer>
    </div>
  );
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-xs font-medium uppercase tracking-normal text-white/45">
        {label}
      </div>
      {children}
    </div>
  );
}

function VoiceOptions({ voices }: { voices: VoicePreset[] }) {
  const male = voices.filter((v) => v.gender === "male");
  const female = voices.filter((v) => v.gender === "female");
  const custom = voices.filter((v) => v.gender !== "male" && v.gender !== "female");

  return (
    <>
      {male.length > 0 && (
        <optgroup label="男声">
          {male.map((v) => (
            <option key={v.id} value={v.id} className="bg-neutral-900">
              {v.label}
            </option>
          ))}
        </optgroup>
      )}
      {female.length > 0 && (
        <optgroup label="女声">
          {female.map((v) => (
            <option key={v.id} value={v.id} className="bg-neutral-900">
              {v.label}
            </option>
          ))}
        </optgroup>
      )}
      {custom.length > 0 && (
        <optgroup label="自定义">
          {custom.map((v) => (
            <option key={v.id} value={v.id} className="bg-neutral-900">
              {v.label}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
      <div className="truncate text-[11px] uppercase tracking-normal text-white/40">{label}</div>
      <div className="truncate text-sm font-medium text-white/85">{value}</div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-300" />
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60" />
    </span>
  );
}
