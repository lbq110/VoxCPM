import { config, voiceHeaders } from "@/lib/config";

export const maxDuration = 120;

// Proxy to the voice server so the browser never needs the voice API key,
// and we sidestep CORS. Streams int16 PCM straight through with the
// X-Sample-Rate header preserved for the Web Audio player.
export async function POST(req: Request) {
  const body = await req.text();

  let upstream: Response;
  try {
    upstream = await fetch(`${config.voiceServerUrl}/tts/stream`, {
      method: "POST",
      headers: voiceHeaders({ "Content-Type": "application/json" }),
      body,
    });
  } catch {
    return new Response("voice server unreachable", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return new Response(`tts upstream error: ${detail}`, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Sample-Rate": upstream.headers.get("X-Sample-Rate") ?? "24000",
      "Cache-Control": "no-store",
    },
  });
}
