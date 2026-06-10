// Server-side config. Never import this from a client component.

export const config = {
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  // OpenRouter model id. Defaults to xAI/Grok for the voice chat loop.
  chatModel: process.env.CHAT_MODEL ?? "x-ai/grok-4.3",
  // The RunPod (or local) voice server base URL, e.g. https://xxxx-8000.proxy.runpod.net
  voiceServerUrl: (process.env.VOICE_SERVER_URL ?? "http://localhost:8000").replace(/\/$/, ""),
  voiceApiKey: process.env.VOICE_API_KEY ?? "",
  systemPrompt:
    process.env.SYSTEM_PROMPT ??
    "You are a warm, caring voice companion. Replies are read aloud, so write for spoken conversation. Start with a short direct sentence. Then add 1-3 short sentences when useful, and occasionally one medium sentence if it helps the thought feel complete. Prefer clear punctuation and natural pauses. Avoid long run-on sentences, markdown, lists, code blocks, and emoji unless explicitly asked. Let emotion come from word choice and rhythm. Match the user's language.",
};

export function voiceHeaders(extra: Record<string, string> = {}) {
  const h: Record<string, string> = { ...extra };
  if (config.voiceApiKey) h["Authorization"] = `Bearer ${config.voiceApiKey}`;
  return h;
}
