import type { BookBlock } from "./book-parser";

export type AskContext = {
  /** Text of the currently selected block. */
  passage: string;
  /** Preceding readable text in reading order — never includes anything
   *  AFTER the active block, so the companion cannot spoil the story. */
  before: string[];
};

/**
 * Context for a "story so far" recap: opening blocks (setup) + an even
 * sample of the middle + the most recent blocks, strictly BEFORE the
 * reading position, in reading order, within a character budget.
 */
export function buildRecapContext(
  blocks: BookBlock[],
  activeId: string,
  maxChars = 2800,
): string[] {
  const activeIndex = blocks.findIndex((b) => b.id === activeId);
  if (activeIndex <= 0) return [];

  const read = blocks
    .slice(0, activeIndex)
    .filter((b) => b.kind !== "rule" && b.text.trim());
  if (!read.length) return [];

  const picked = new Map<string, BookBlock>();
  const take = (b: BookBlock | undefined) => {
    if (b) picked.set(b.id, b);
  };

  read.slice(0, 3).forEach(take); // opening
  read.slice(-8).forEach(take); // most recent

  // sample the middle evenly with whatever budget remains
  const middle = read.slice(3, Math.max(3, read.length - 8));
  if (middle.length) {
    const usedSoFar = [...picked.values()].reduce((s, b) => s + b.text.length, 0);
    const avgLen = middle.reduce((s, b) => s + b.text.length, 0) / middle.length;
    const slots = Math.max(0, Math.floor((maxChars - usedSoFar) / Math.max(1, avgLen)));
    if (slots > 0) {
      const step = Math.max(1, Math.ceil(middle.length / slots));
      for (let i = 0; i < middle.length; i += step) take(middle[i]);
    }
  }

  // reading order, then trim to budget (recent blocks are most valuable, so
  // drop middle samples first when over budget)
  const orderIndex = new Map(read.map((b, i) => [b.id, i]));
  let ordered = [...picked.values()].sort(
    (a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0),
  );
  const recentIds = new Set(read.slice(-8).map((b) => b.id));
  const openingIds = new Set(read.slice(0, 3).map((b) => b.id));
  let total = ordered.reduce((s, b) => s + b.text.length, 0);
  while (total > maxChars) {
    const dropIndex = ordered.findIndex((b) => !recentIds.has(b.id) && !openingIds.has(b.id));
    const victim = dropIndex >= 0 ? dropIndex : ordered.length > 1 ? 0 : -1;
    if (victim < 0) break;
    total -= ordered[victim].text.length;
    ordered = ordered.filter((_, i) => i !== victim);
  }

  return ordered.map((b) => b.text);
}

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
