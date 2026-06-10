import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { config } from "@/lib/config";

export const maxDuration = 90;

type DialogueRequest = {
  chapterTitle?: string;
  passages?: string[];
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
  const passages = (body.passages ?? []).map((item) => item.trim()).filter(Boolean);

  if (!passages.length) {
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
  const result = await generateText({
    model: openrouter(config.chatModel),
    temperature: 0.72,
    system:
      "你是互动电子书“书伴”的章节对谈编剧。你要基于章节内容生成双人对谈稿。重要限制：不要声称真实作家或真实名人正在发言；所有角色都是“视角模拟”或“风格化对话者”。不要模仿任何真实人物的私人声音、口癖或未公开事实。重点是帮助读者理解章节。",
    prompt: [
      `章节标题：${chapterTitle}`,
      `作者侧角色：${body.authorView || "王朔作品文本研究者，不代表作者本人，也不模拟真人发言"}`,
      `对话者：${partnerName}（${partnerRole}）。定位：${partnerEdge}。`,
      `目标时长：${body.length || "10"} 分钟。当前先生成文字稿预览，不需要真的写满时长。`,
      `深度：${depthLabel[body.depth || ""] || "尖锐"}`,
      `章节材料：\n${passages.map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
      body.selectedPassage ? `当前高亮段落：${body.selectedPassage}` : "",
      notes.length ? `读者笔记：\n${notes.map((note) => `- ${note}`).join("\n")}` : "",
      [
        "请输出中文。",
        "结构：",
        "1. 标题，一行。",
        "2. 三条提纲。",
        "3. 双人对谈文字稿，8-12 轮，每轮短一点。",
        "4. 最后留下一个给读者的问题。",
        "对谈必须有张力：先复述本章，再追问最刺人的地方，再回到读者今天为什么还需要读这一章。",
      ].join("\n"),
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  return Response.json({ transcript: result.text.trim() });
}
