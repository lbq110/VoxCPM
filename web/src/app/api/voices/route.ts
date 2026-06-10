import { config, voiceHeaders } from "@/lib/config";

// Proxy the voice server's preset list to the browser.
export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const upstream = await fetch(`${config.voiceServerUrl}/voices`, {
      headers: voiceHeaders(),
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ voices: [], default: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    clearTimeout(timeout);
  }
}
