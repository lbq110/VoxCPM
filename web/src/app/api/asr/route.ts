import { config, voiceHeaders } from "@/lib/config";

export const maxDuration = 60;

// Proxy mic audio to the voice server's Whisper endpoint.
export async function POST(req: Request) {
  const form = await req.formData();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);

  let upstream: Response;
  try {
    upstream = await fetch(`${config.voiceServerUrl}/asr`, {
      method: "POST",
      headers: voiceHeaders(),
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    return new Response(JSON.stringify({
      error: aborted
        ? "ASR 转写超时，请检查 RunPod 服务或 SSH 隧道"
        : "语音后端连接失败，请检查 RunPod 服务或 SSH 隧道",
    }), {
      status: aborted ? 504 : 502,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
