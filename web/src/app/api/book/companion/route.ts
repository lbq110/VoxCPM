import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { config } from "@/lib/config";

export const maxDuration = 60;

type CompanionRequest = {
  chapterTitle?: string;
  passage?: string;
  question?: string;
  mode?: string;
  notes?: string[];
};

export async function POST(req: Request) {
  if (!config.openRouterApiKey) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const body = (await req.json()) as CompanionRequest;
  const chapterTitle = body.chapterTitle?.trim() || "当前章节";
  const passage = body.passage?.trim();
  const question = body.question?.trim();

  if (!passage || !question) {
    return Response.json({ error: "Missing passage or question" }, { status: 400 });
  }

  const notes = (body.notes ?? [])
    .map((note) => note.trim())
    .filter(Boolean)
    .slice(0, 6);

  const openrouter = createOpenRouter({ apiKey: config.openRouterApiKey });
  const result = await generateText({
    model: openrouter(config.chatModel),
    temperature: 0.55,
    system:
      "你是“书伴”，一个中文互动电子书陪读伙伴。回答必须围绕用户正在读的段落，不要泛泛发挥。语气自然、短句优先，像语音陪读。不要使用 markdown 表格。若信息不足，明确说这是基于当前段落的理解。",
    prompt: [
      `章节：${chapterTitle}`,
      `当前段落：${passage}`,
      notes.length ? `读者已有笔记：\n${notes.map((note) => `- ${note}`).join("\n")}` : "",
      `用户问题：${question}`,
      `回答模式：${body.mode || "解释"}`,
      "请用中文回答。先给一句直接结论，再用 2-4 句话解释。最后给一个很短的追问，帮助读者继续思考。",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  return Response.json({ answer: result.text.trim() });
}
