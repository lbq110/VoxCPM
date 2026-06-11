// Sentence voice player.
//
// Speaks assistant text as it arrives. Text is split into sentences; each
// sentence is sent to /api/tts, which streams int16 PCM. We keep one TTS request
// per sentence to preserve prosody, but start playback once a small buffer is
// available instead of waiting for the whole sentence.

type Phase = "idle" | "synthesizing" | "speaking";

export class VoicePlayer {
  private ctx: AudioContext | null = null;
  private nextTime = 0;
  private queue: { text: string; tag?: unknown }[] = [];
  private draining = false;
  private generation = 0; // bumped on stop() to cancel in-flight work
  private activeSources = new Set<AudioBufferSourceNode>();
  private activeFetches = new Set<AbortController>();
  private ttsOptions: Record<string, unknown>;
  private waitingForFirstAudio = false;
  onPhase?: (phase: Phase) => void;
  onFirstAudio?: () => void;
  /** Fires when an utterance's audio actually STARTS playing (by tag). */
  onUtteranceStart?: (tag: unknown) => void;

  constructor(ttsOptions: Record<string, unknown> = {}) {
    this.ttsOptions = ttsOptions;
  }

  setOptions(opts: Record<string, unknown>) {
    this.ttsOptions = opts;
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.nextTime = 0;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /**
   * Unlock audio. MUST be called synchronously inside a user gesture
   * (click/tap) so the browser's autoplay policy lets us play later.
   */
  prime() {
    this.ensureCtx();
  }

  /** Queue a finished sentence/segment for synthesis + playback. */
  speak(text: string, tag?: unknown) {
    const t = text.trim();
    if (!t) return;
    this.queue.push({ text: t, tag });
    this.waitingForFirstAudio = true;
    void this.drain();
  }

  /** Pause playback (audio clock freezes; scheduled buffers resume later). */
  pause() {
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend();
  }

  /** Resume after pause(). */
  resume() {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  /** Stop everything and reset (barge-in). */
  stop() {
    this.generation++;
    this.queue = [];
    this.draining = false;
    for (const src of this.activeSources) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    this.activeSources.clear();
    for (const controller of this.activeFetches) {
      controller.abort();
    }
    this.activeFetches.clear();
    this.waitingForFirstAudio = false;
    if (this.ctx) this.nextTime = this.ctx.currentTime;
    this.onPhase?.("idle");
  }

  private async drain() {
    if (this.draining) return;
    this.draining = true;
    const gen = this.generation;
    if (!this.activeSources.size) this.onPhase?.("synthesizing");

    while (this.queue.length && gen === this.generation) {
      const item = this.queue.shift()!;
      try {
        if (!this.activeSources.size) this.onPhase?.("synthesizing");
        await this.synthAndSchedule(item.text, gen, item.tag);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("tts error", err);
      }
    }

    this.draining = false;
    if (gen === this.generation) {
      // Flip back to idle once the last scheduled buffer has played.
      const ctx = this.ctx;
      if (ctx) {
        const remaining = Math.max(0, (this.nextTime - ctx.currentTime) * 1000);
        window.setTimeout(() => {
          if (gen === this.generation && !this.queue.length && !this.draining) {
            this.onPhase?.("idle");
          }
        }, remaining + 50);
      } else {
        this.onPhase?.("idle");
      }
    }
  }

  private async synthAndSchedule(text: string, gen: number, tag?: unknown) {
    const controller = new AbortController();
    this.activeFetches.add(controller);
    let announcedStart = false;
    const announceStartAt = (startAt: number, ctx: AudioContext) => {
      if (announcedStart || tag === undefined) return;
      announcedStart = true;
      const delay = Math.max(0, (startAt - ctx.currentTime) * 1000);
      window.setTimeout(() => {
        if (gen === this.generation) this.onUtteranceStart?.(tag);
      }, delay);
    };
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, ...this.ttsOptions }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`tts ${res.status}`);

      const sampleRate = parseInt(res.headers.get("X-Sample-Rate") || "24000", 10);
      const ctx = this.ensureCtx();
      const reader = res.body.getReader();

      let leftover: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
      const chunks: Uint8Array<ArrayBufferLike>[] = [];
      let totalBytes = 0;
      let startedPlayback = false;
      const initialBufferSeconds = 0.42;
      const continuationBufferSeconds = 0.18;

      const flush = (force = false) => {
        if (!totalBytes || gen !== this.generation) return;
        const bufferedSeconds = totalBytes / 2 / sampleRate;
        const target = startedPlayback ? continuationBufferSeconds : initialBufferSeconds;
        if (!force && bufferedSeconds < target) return;

        const pcm = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
          pcm.set(chunk, offset);
          offset += chunk.byteLength;
        }
        chunks.length = 0;
        totalBytes = 0;

        if (!startedPlayback && this.waitingForFirstAudio) {
          startedPlayback = true;
          this.waitingForFirstAudio = false;
          this.onPhase?.("speaking");
          this.onFirstAudio?.();
        } else {
          startedPlayback = true;
        }
        const startAt = this.schedulePcm(ctx, pcm, sampleRate, gen);
        announceStartAt(startAt, ctx);
      };

      while (true) {
        if (gen !== this.generation) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          return;
        }
        const { value, done } = await reader.read();
        if (done) break;
        if (!value || value.length === 0) continue;

        // Merge any odd trailing byte from the previous chunk (int16 = 2 bytes).
        let bytes: Uint8Array<ArrayBufferLike>;
        if (leftover.length) {
          bytes = new Uint8Array(leftover.length + value.length);
          bytes.set(leftover, 0);
          bytes.set(value, leftover.length);
        } else {
          bytes = value;
        }
        const usable = bytes.length - (bytes.length % 2);
        leftover = bytes.subarray(usable);
        if (usable === 0) continue;

        const chunk = bytes.subarray(0, usable);
        chunks.push(chunk);
        totalBytes += chunk.byteLength;
        flush(false);
      }

      flush(true);
    } finally {
      this.activeFetches.delete(controller);
    }
  }

  private schedulePcm(
    ctx: AudioContext,
    bytes: Uint8Array<ArrayBufferLike>,
    sampleRate: number,
    gen: number,
  ): number {
    const sampleCount = bytes.length / 2;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const buffer = ctx.createBuffer(1, sampleCount, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      channel[i] = view.getInt16(i * 2, true) / 32768;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    // The sentence is fully buffered, so only a tiny preroll is needed to avoid
    // scheduling right on top of currentTime.
    const PREROLL = 0.08;
    const startAt = Math.max(ctx.currentTime + PREROLL, this.nextTime);
    src.start(startAt);
    this.nextTime = startAt + buffer.duration;

    this.activeSources.add(src);
    src.onended = () => {
      this.activeSources.delete(src);
      if (gen === this.generation && !this.activeSources.size && this.draining) {
        this.onPhase?.("synthesizing");
      }
      if (gen === this.generation && !this.activeSources.size && !this.queue.length && !this.draining) {
        this.onPhase?.("idle");
      }
    };
    return startAt;
  }
}

// --- sentence segmentation for streaming text ---------------------------- //

const SENTENCE_END = /[.!?。！？…\n]+/;
const SOFT_BREAK_CHARS = new Set([",", "，", ";", "；", ":", "：", "、"]);
const MIN_SOFT_SEGMENT_CHARS = 24;
const MAX_TTS_SEGMENT_CHARS = 72;
const FORCE_TTS_SEGMENT_CHARS = 96;

function findSoftBreak(text: string): number {
  const end = Math.min(text.length, MAX_TTS_SEGMENT_CHARS + 1);
  let best = -1;
  for (let i = MIN_SOFT_SEGMENT_CHARS; i < end; i++) {
    if (SOFT_BREAK_CHARS.has(text[i])) best = i + 1;
  }
  return best;
}

function findForcedBreak(text: string): number {
  const windowText = text.slice(0, MAX_TTS_SEGMENT_CHARS);
  const lastSpace = Math.max(windowText.lastIndexOf(" "), windowText.lastIndexOf("\t"));
  if (lastSpace >= MIN_SOFT_SEGMENT_CHARS) return lastSpace + 1;
  return MAX_TTS_SEGMENT_CHARS;
}

/**
 * Pull complete sentences out of a growing text buffer. Returns the sentences
 * that are "ready to speak" and the remaining tail to keep buffering.
 */
export function takeSentences(
  buffer: string,
  options: { allowSoftBreaks?: boolean } = {},
): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let rest = buffer;
  while (true) {
    const m = SENTENCE_END.exec(rest);
    let end = m ? m.index + m[0].length : -1;
    if (end < 0 && options.allowSoftBreaks && rest.length > MAX_TTS_SEGMENT_CHARS) {
      end = findSoftBreak(rest);
    }
    if (end < 0 && options.allowSoftBreaks && rest.length >= FORCE_TTS_SEGMENT_CHARS) {
      end = findForcedBreak(rest);
    }
    if (end < 0) break;
    const sentence = rest.slice(0, end).trim();
    if (sentence) sentences.push(sentence);
    rest = rest.slice(end);
  }
  return { sentences, rest };
}
