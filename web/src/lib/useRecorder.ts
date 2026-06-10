import { useCallback, useEffect, useRef, useState } from "react";

type RecorderState = "idle" | "requesting" | "recording" | "transcribing";

export type AsrModelId = "sensevoice-small" | "voxtral-realtime";

export type TranscriptionResult = {
  text: string;
  model: AsrModelId;
  language?: string;
  latencyMs: number;
};

type RecorderStartOptions = {
  autoStop?: boolean;
  silenceMs?: number;
  minRecordingMs?: number;
  maxRecordingMs?: number;
  noSpeechTimeoutMs?: number;
  speechThreshold?: number;
  minAudioLevel?: number;
};

export function useRecorder(
  asrModel: AsrModelId,
  onText: (result: TranscriptionResult) => void,
) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const meterTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const maxLevelRef = useRef(0);
  const asrModelRef = useRef(asrModel);
  const cancelRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const heardSpeechRef = useRef(false);
  const lastVoiceAtRef = useRef(0);
  const smoothedLevelRef = useRef(0);
  const speechFramesRef = useRef(0);
  const startOptionsRef = useRef<Required<RecorderStartOptions>>({
    autoStop: false,
    silenceMs: 950,
    minRecordingMs: 900,
    maxRecordingMs: 12_000,
    noSpeechTimeoutMs: 6_500,
    speechThreshold: 0.035,
    minAudioLevel: 0.008,
  });

  useEffect(() => {
    asrModelRef.current = asrModel;
  }, [asrModel]);

  const stopMeter = useCallback(() => {
    if (meterTimerRef.current) {
      window.clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
    }
    audioContextRef.current = null;
    setLevel(0);
  }, []);

  const startMeter = useCallback((stream: MediaStream) => {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = ctx;

    const data = new Uint8Array(analyser.fftSize);
    meterTimerRef.current = window.setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) {
        const centered = (value - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / data.length);
      const normalized = Math.min(1, rms * 8);
      const smoothed = smoothedLevelRef.current * 0.68 + normalized * 0.32;
      smoothedLevelRef.current = smoothed;
      const now = performance.now();
      maxLevelRef.current = Math.max(maxLevelRef.current, smoothed);
      setLevel(smoothed);
      setElapsedMs(Math.round(now - startedAtRef.current));

      const opts = startOptionsRef.current;
      if (!opts.autoStop || mediaRef.current?.state !== "recording") return;

      if (smoothed > opts.speechThreshold) {
        speechFramesRef.current += 1;
        if (speechFramesRef.current >= 3) {
          heardSpeechRef.current = true;
          lastVoiceAtRef.current = now;
        }
        return;
      }

      if (heardSpeechRef.current && smoothed > opts.speechThreshold * 0.65) {
        lastVoiceAtRef.current = now;
        return;
      }
      speechFramesRef.current = 0;

      const elapsed = now - startedAtRef.current;
      const silence = now - lastVoiceAtRef.current;
      if (heardSpeechRef.current && elapsed > opts.minRecordingMs && silence > opts.silenceMs) {
        mediaRef.current.stop();
        return;
      }
      if (elapsed > opts.maxRecordingMs) {
        mediaRef.current.stop();
        return;
      }
      if (
        !heardSpeechRef.current &&
        elapsed > opts.noSpeechTimeoutMs &&
        maxLevelRef.current > opts.minAudioLevel
      ) {
        mediaRef.current.stop();
      }
    }, 100);
  }, []);

  const start = useCallback(async (modelOverride?: AsrModelId, options?: RecorderStartOptions) => {
    setError(null);
    setLevel(0);
    setElapsedMs(0);
    maxLevelRef.current = 0;
    smoothedLevelRef.current = 0;
    speechFramesRef.current = 0;
    cancelRef.current = false;
    heardSpeechRef.current = false;
    const selectedModel = modelOverride ?? asrModelRef.current;
    startOptionsRef.current = {
      autoStop: options?.autoStop ?? false,
      silenceMs: options?.silenceMs ?? 950,
      minRecordingMs: options?.minRecordingMs ?? 900,
      maxRecordingMs: options?.maxRecordingMs ?? 12_000,
      noSpeechTimeoutMs: options?.noSpeechTimeoutMs ?? 6_500,
      speechThreshold: options?.speechThreshold ?? 0.035,
      minAudioLevel: options?.minAudioLevel ?? 0.008,
    };
    setState("requesting");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("microphone API unavailable");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stream.getAudioTracks().length === 0) {
        throw new Error("no audio track");
      }
      streamRef.current = stream;
      startedAtRef.current = performance.now();
      lastVoiceAtRef.current = startedAtRef.current;
      startMeter(stream);
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stopMeter();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (cancelRef.current) {
          cancelRef.current = false;
          setState("idle");
          return;
        }
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        if (blob.size < 1200) {
          setError("录音太短或为空，请说完后再点 Stop");
          setState("idle");
          return;
        }
        if (maxLevelRef.current < startOptionsRef.current.minAudioLevel) {
          setError("录音电平太低，请检查系统输入设备和浏览器麦克风权限");
          setState("idle");
          return;
        }
        setState("transcribing");
        try {
          const startedAt = performance.now();
          const controller = new AbortController();
          abortRef.current = controller;
          const fd = new FormData();
          const ext = (mime || "audio/webm").includes("mp4") ? "mp4" : "webm";
          fd.append("file", blob, `speech.${ext}`);
          fd.append("model", selectedModel);
          const res = await fetch("/api/asr", { method: "POST", body: fd, signal: controller.signal });
          const raw = await res.text();
          const data = raw ? JSON.parse(raw) : {};
          if (!res.ok) {
            setError(String(data.error || data.detail || `ASR request failed (${res.status})`));
            return;
          }
          if (data.text) {
            onText({
              text: data.text as string,
              model: selectedModel,
              language: typeof data.language === "string" ? data.language : undefined,
              latencyMs: Math.round(performance.now() - startedAt),
            });
          } else if (data.error) {
            setError(String(data.error));
          } else if (data.detail) {
            setError(String(data.detail));
          } else {
            setError("没有识别到文字");
          }
        } catch (err) {
          if (cancelRef.current) return;
          const aborted = err instanceof DOMException && err.name === "AbortError";
          setError(aborted ? "转写已取消" : "转写失败，请检查 RunPod 服务或 SSH 隧道");
        } finally {
          abortRef.current = null;
          cancelRef.current = false;
          setState("idle");
        }
      };
      rec.start(250);
      mediaRef.current = rec;
      setState("recording");
    } catch {
      stopMeter();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setError(
        window.isSecureContext
          ? "麦克风权限被拒绝或不可用"
          : "当前地址不支持麦克风，请用 http://localhost 或 HTTPS 打开",
      );
      setState("idle");
    }
  }, [onText, startMeter, stopMeter]);

  const stop = useCallback(() => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    abortRef.current?.abort();
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
      return;
    }
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState("idle");
  }, [stopMeter]);

  const toggle = useCallback(() => {
    if (state === "recording") stop();
    else if (state === "idle") void start();
  }, [state, start, stop]);

  return { state, error, level, elapsedMs, start, stop, cancel, toggle };
}
