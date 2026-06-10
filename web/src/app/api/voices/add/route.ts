import { config, voiceHeaders } from "@/lib/config";

export const maxDuration = 120;

// Proxy a voice-clip upload to the voice server's /voices/add (extract a voice).
export async function POST(req: Request) {
  const form = await req.formData();
  try {
    const upstream = await fetch(`${config.voiceServerUrl}/voices/add`, {
      method: "POST",
      headers: voiceHeaders(),
      body: form,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "voice server unreachable" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
