import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";
import { config } from "@/lib/config";

export const maxDuration = 90;

type DialogueRequest = {
  chapterTitle?: string;
  /** Story-so-far context (spoiler-safe, curated by the client). */
  recap?: string[];
  /** Text near the reading position, in reading order. */
  nearby?: string[];
  selectedPassage?: string;
  authorView?: string;
  partner?: {
    name?: string;
    role?: string;
    edge?: string;
  };
  length?: string;
  depth?: string;
  notes?: string[];
};

const depthLabel: Record<string, string> = {
  light: "轻松",
  deep: "深入",
  sharp: "尖锐",
};

export async function POST(req: Request) {
  if (!config.openRouterApiKey) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const body = (await req.json()) as DialogueRequest;
  const chapterTitle = body.chapterTitle?.trim() || "当前章节";
  const nearby = (body.nearby ?? []).map((t) => t.trim()).filter(Boolean);
  const recap = (body.recap ?? []).map((t) => t.trim()).filter(Boolean);

  if (!nearby.length && !recap.length) {
    return Response.json({ error: "Missing chapter passages" }, { status: 400 });
  }

  const partnerName = body.partner?.name || "文化追问者";
  const partnerRole = body.partner?.role || "对话者";
  const partnerEdge = body.partner?.edge || "追问章节的关键矛盾";
  const notes = (body.notes ?? [])
    .map((note) => note.trim())
    .filter(Boolean)
    .slice(0, 8);

  const openrouter = createOpenRouter({ apiKey: config.openRouterApiKey });
  const result = streamText({
    model: openrouter(config.chatModel),
    temperature: 0.72,
    system: [
      "你是互动电子书“书伴”的章节对谈编剧。基于读者已读的内容生成双人对谈稿。",
      "重要限制：不要声称真实作家或真实名人正在发言；所有角色都是“视角模拟”或“风格化对话者”。不要模仿任何真实人物的私人声音、口癖或未公开事实。",
      "【防剧透】只讨论提供的已读材料。即使你知道这本书的后续情节，也绝对不能提及或暗示。",
      "【输出格式，必须严格遵守，将用于语音合成】",
      `每行一句台词，格式为「说话人：台词」。说话人只有两个：「${partnerName}」和「研究者」。`,
      "不要输出标题、提纲、舞台说明、markdown 标记，台词行之外不要有任何其他内容。",
      "对谈 10-14 轮，每轮 1-3 句话，口语化、有张力：先聊读到的内容，再追问最刺人的地方，最后由对话者留一个给读者的问题。",
    ].join("\n"),
    prompt: [
      `章节：${chapterTitle}`,
      `作者侧角色（研究者）：${body.authorView || "文本研究者，不代表作者本人"}`,
      `对话者：${partnerName}（${partnerRole}）。定位：${partnerEdge}。`,
      `深度：${depthLabel[body.depth || ""] || "尖锐"}；目标时长 ${body.length || "10"} 分钟的文字稿预览。`,
      recap.length ? `读者已读的前情（按时间顺序）：\n${recap.map((t) => `- ${t}`).join("\n")}` : "",
      nearby.length ? `读者当前位置附近的内容：\n${nearby.join("\n")}` : "",
      body.selectedPassage ? `读者高亮的段落：${body.selectedPassage}` : "",
      notes.length ? `读者笔记：\n${notes.map((note) => `- ${note}`).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  return result.toTextStreamResponse();
}
