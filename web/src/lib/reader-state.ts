export type ReaderThemeId = "paper" | "white" | "night";
export type AskMessage = { role: "user" | "assistant"; content: string };

export type ReaderState = {
  /** Block id at the top of the page being read — survives font-size changes. */
  anchorBlockId: string | null;
  fontSize: number;
  lineHeight: number;
  themeId: ReaderThemeId;
  notes: string[];
  highlightedIds: string[];
  askMessages: AskMessage[];
};

const THEMES: ReaderThemeId[] = ["paper", "white", "night"];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function serializeReaderState(state: ReaderState): string {
  return JSON.stringify(state);
}

/** Parse persisted state defensively — corrupted storage must never crash the reader. */
export function parseReaderState(raw: string | null): ReaderState | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;

  return {
    anchorBlockId: typeof d.anchorBlockId === "string" ? d.anchorBlockId : null,
    fontSize: clamp(typeof d.fontSize === "number" ? d.fontSize : 20, 16, 26),
    lineHeight: clamp(typeof d.lineHeight === "number" ? d.lineHeight : 2.05, 1.65, 2.35),
    themeId: THEMES.includes(d.themeId as ReaderThemeId) ? (d.themeId as ReaderThemeId) : "night",
    notes: Array.isArray(d.notes) ? d.notes.filter((n): n is string => typeof n === "string") : [],
    highlightedIds: Array.isArray(d.highlightedIds)
      ? d.highlightedIds.filter((n): n is string => typeof n === "string")
      : [],
    askMessages: Array.isArray(d.askMessages)
      ? d.askMessages.filter(
          (m): m is AskMessage =>
            !!m &&
            typeof m === "object" &&
            ((m as AskMessage).role === "user" || (m as AskMessage).role === "assistant") &&
            typeof (m as AskMessage).content === "string",
        )
      : [],
  };
}
