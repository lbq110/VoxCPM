import { createHash } from "node:crypto";
import { config } from "@/lib/config";

export const maxDuration = 120;

/**
 * Server-side gateway to Open Notebook for whole-book Q&A.
 * The browser never talks to Open Notebook directly (VAS principle).
 *
 * POST body:
 *   { question, sessionId?, syncText? }
 * - syncText: full book text; synced once per content hash (idempotent)
 * - sessionId: Open Notebook chat session for multi-turn memory
 */

const ON = () => config.openNotebookUrl;
const NOTEBOOK_NAME = "起初·纪年";

type AskBookRequest = {
  question?: string;
  sessionId?: string;
  syncText?: string;
};

async function onFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${ON()}${path}`, init);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Open Notebook ${path} -> ${res.status} ${detail.slice(0, 200)}`);
  }
  return res.json();
}

async function ensureNotebook(): Promise<string> {
  const list = (await onFetch("/api/notebooks")) as Array<{ id: string; name: string }>;
  const found = list.find((n) => n.name === NOTEBOOK_NAME);
  if (found) return found.id;
  const created = await onFetch("/api/notebooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: NOTEBOOK_NAME, description: "互动阅读全书问答" }),
  });
  return created.id as string;
}

/** Import the book text as a source unless an identical version already exists. */
async function syncBook(notebookId: string, text: string): Promise<string> {
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 12);
  const title = `${NOTEBOOK_NAME}#${hash}`;

  const sources = (await onFetch(
    `/api/sources?notebook_id=${encodeURIComponent(notebookId)}&limit=100`,
  )) as Array<{ id: string; title?: string }>;
  const existing = sources.find((s) => s.title === title);
  if (existing) return existing.id;

  // stale versions of the book are removed so chat context stays clean
  for (const s of sources) {
    if (s.title?.startsWith(`${NOTEBOOK_NAME}#`)) {
      await fetch(`${ON()}/api/sources/${encodeURIComponent(s.id)}`, { method: "DELETE" }).catch(
        () => undefined,
      );
    }
  }

  const form = new FormData();
  form.set("type", "text");
  form.set("notebook_id", notebookId);
  form.set("title", title);
  form.set("content", text);
  form.set("embed", "false");
  const created = await fetch(`${ON()}/api/sources`, { method: "POST", body: form });
  if (!created.ok) throw new Error(`source import failed: ${created.status}`);
  const data = await created.json();
  return data.id as string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as AskBookRequest;
  const question = body.question?.trim();

  try {
    const notebookId = await ensureNotebook();

    if (body.syncText?.trim()) {
      await syncBook(notebookId, body.syncText.trim());
    }

    if (!question) {
      return Response.json({ synced: true });
    }

    let sessionId = body.sessionId;
    if (!sessionId) {
      const session = await onFetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notebook_id: notebookId, title: "问全书" }),
      });
      sessionId = session.id as string;
    }

    // Include every source of the notebook as full content.
    const sources = (await onFetch(
      `/api/sources?notebook_id=${encodeURIComponent(notebookId)}&limit=100`,
    )) as Array<{ id: string }>;
    const contextConfig = {
      sources: Object.fromEntries(sources.map((s) => [s.id, "full content"])),
      notes: {},
    };

    const built = await onFetch("/api/chat/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notebook_id: notebookId, context_config: contextConfig }),
    });

    const result = await onFetch("/api/chat/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        message: question,
        context: built.context ?? built,
      }),
    });

    const messages = (result.messages ?? []) as Array<{ content?: string }>;
    const answer = messages.length ? String(messages[messages.length - 1].content ?? "") : "";
    if (!answer.trim()) throw new Error("Open Notebook 返回了空回答");

    return Response.json({ answer: answer.trim(), sessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "全书问答失败";
    const offline = /ECONNREFUSED|fetch failed/i.test(message);
    return Response.json(
      { error: offline ? "全书问答服务未启动（Open Notebook 离线）" : message },
      { status: offline ? 503 : 500 },
    );
  }
}
