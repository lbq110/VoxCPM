import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { config } from "@/lib/config";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!config.openRouterApiKey) {
    return new Response("OPENROUTER_API_KEY is not configured", { status: 500 });
  }

  const { messages, model }: { messages: UIMessage[]; model?: string } = await req.json();

  const openrouter = createOpenRouter({ apiKey: config.openRouterApiKey });

  const result = streamText({
    model: openrouter(model || config.chatModel),
    system: config.systemPrompt,
    messages: await convertToModelMessages(messages),
    temperature: 0.7,
  });

  return result.toUIMessageStreamResponse();
}
