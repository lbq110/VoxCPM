import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, type ModelMessage } from "ai";
import { config } from "@/lib/config";

export const maxDuration = 60;

type HistoryItem = { role: "user" | "assistant"; content: string };

type CompanionRequest = {
  chapterTitle?: string;
  passage?: string;
  /** Preceding text in reading order — spoiler-safe context. */
  before?: string[];
  /** Relevant excerpts retrieved from the book. */
  retrieved?: string[];
  question?: string;
  mode?: string;
  notes?: string[];
  history?: HistoryItem[];
  /** "passage" (default, spoiler-safe) or "book" (whole-book view). */
  scope?: "passage" | "book";
};

export async function POST(req: Request) {
  if (!config.openRouterApiKey) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const body = (await req.json()) as CompanionRequest;
  const scope = body.scope === "book" ? "book" : "passage";
  const chapterTitle = body.chapterTitle?.trim() || "当前章节";
  const passage = body.passage?.trim();
  const question = body.question?.trim();

  if (!question || (scope === "passage" && !passage)) {
    return Response.json({ error: "Missing passage or question" }, { status: 400 });
  }

  const notes = (body.notes ?? [])
    .map((note) => note.trim())
    .filter(Boolean)
    .slice(0, 6);

  // Keep the tail of `before` within a char budget. Recap mode sends a
  // curated opening+sample+recent list (~2800 chars) that must pass intact;
  // a fixed item-count cap would chop off the opening.
  const beforeRaw = (body.before ?? []).map((t) => t.trim()).filter(Boolean);
  const before: string[] = [];
  let beforeChars = 0;
  for (let i = beforeRaw.length - 1; i >= 0; i--) {
    if (beforeChars + beforeRaw[i].length > 4000) break;
    before.unshift(beforeRaw[i]);
    beforeChars += beforeRaw[i].length;
  }

  const retrieved = (body.retrieved ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, scope === "book" ? 10 : 6);

  const history: HistoryItem[] = (body.history ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content?.trim())
    .slice(-8);

  const contextBlock = [
    `章节：${chapterTitle}`,
    retrieved.length
      ? scope === "book"
        ? `从全书检索到的相关片段：\n${retrieved.map((t) => `- ${t}`).join("\n")}`
        : `从读者已读过的章节里检索到的相关片段（可能来自更早的章节）：\n${retrieved.map((t) => `- ${t}`).join("\n")}`
      : "",
    before.length ? `读者刚读过的前文（按顺序）：\n${before.join("\n")}` : "",
    passage ? `读者当前正在读的段落：${passage}` : "",
    notes.length ? `读者已有笔记：\n${notes.map((note) => `- ${note}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: ModelMessage[] = [
    { role: "user", content: `【阅读上下文，供你参考，不需要回应】\n\n${contextBlock}` },
    { role: "assistant", content: "好的，我已了解读者当前的阅读位置和上下文。" },
    ...history,
    {
      role: "user",
      content: body.mode ? `${question}\n（回答模式：${body.mode}）` : question,
    },
  ];

  const openrouter = createOpenRouter({ apiKey: config.openRouterApiKey });
  const result = streamText({
    model: openrouter(config.chatModel),
    temperature: 0.55,
    system: [
      "你是“书伴”，一个中文互动电子书陪读伙伴。",
      scope === "book"
        ? "当前是全书问答模式：依据提供的全书检索片段回答，可以引用任何章节的内容。检索片段没覆盖的细节，如实说不确定，不要编造。"
        : "回答围绕读者正在读的段落和已读过的前文，不要泛泛发挥。",
      scope === "book"
        ? ""
        : "【防剧透铁律】你只能依据“读者已经读过的前文”和“当前段落”回答。即使你知道这本书的后续情节，也绝对不能提及、暗示或推测任何后文内容。读者问到后文时，回答：这个问题等读到后面再聊。",
      "语气自然、短句优先，像语音陪读。输出纯文本：不要使用任何 markdown 标记（加粗星号、列表符号、表格、标题）。",
      "首次回答：先给一句直接结论，再用 2-4 句话解释，最后给一个很短的追问。追问式对话中则自然衔接，不必重复格式。",
    ]
      .filter(Boolean)
      .join("\n"),
    messages,
  });

  return result.toTextStreamResponse();
}
