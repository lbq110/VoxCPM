import type { BookBlock } from "./book-parser";

export type AskContext = {
  /** Text of the currently selected block. */
  passage: string;
  /** Preceding readable text in reading order — never includes anything
   *  AFTER the active block, so the companion cannot spoil the story. */
  before: string[];
};

export function buildAskContext(
  blocks: BookBlock[],
  activeId: string,
  maxChars = 1200,
): AskContext {
  const activeIndex = blocks.findIndex((b) => b.id === activeId);
  if (activeIndex < 0) return { passage: "", before: [] };

  const passage = blocks[activeIndex].text;

  // Walk backwards so the nearest context survives the budget cut,
  // then restore reading order for the prompt.
  const before: string[] = [];
  let used = 0;
  for (let i = activeIndex - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.kind === "rule" || !b.text.trim()) continue;
    if (used + b.text.length > maxChars) break;
    before.unshift(b.text);
    used += b.text.length;
  }

  return { passage, before };
}
