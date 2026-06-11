import type { BookBlock } from "./book-parser";

export type SearchHit = { id: string; text: string; score: number };

/** Character bigrams (with unigram fallback) — the standard cheap CJK tokenizer. */
function grams(text: string): string[] {
  const chars = Array.from(text.replace(/[\s，,。.！!？?；;：:、"'「」『』（）()【】《》—…·]/g, ""));
  if (chars.length <= 1) return chars;
  const out: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) out.push(chars[i] + chars[i + 1]);
  return out;
}

/**
 * Spoiler-safe retrieval: BM25-flavoured bigram search over the blocks the
 * reader has ALREADY read (strictly before the active block).
 */
export function searchReadBlocks(
  blocks: BookBlock[],
  activeId: string,
  query: string,
  topK = 5,
): SearchHit[] {
  const activeIndex = blocks.findIndex((b) => b.id === activeId);
  if (activeIndex <= 0) return [];

  const queryGrams = new Set(grams(query));
  if (!queryGrams.size) return [];

  const read = blocks
    .slice(0, activeIndex)
    .filter((b) => b.kind !== "rule" && b.text.trim());

  // document frequency for IDF weighting
  const df = new Map<string, number>();
  const blockGrams: Set<string>[] = read.map((b) => {
    const set = new Set(grams(b.text));
    for (const g of set) if (queryGrams.has(g)) df.set(g, (df.get(g) ?? 0) + 1);
    return set;
  });

  const n = read.length;
  const hits: SearchHit[] = [];
  for (let i = 0; i < read.length; i++) {
    let score = 0;
    for (const g of queryGrams) {
      if (!blockGrams[i].has(g)) continue;
      const idf = Math.log(1 + n / (df.get(g) ?? 1));
      score += idf;
    }
    if (score > 0) {
      // normalize so long blocks don't win on length alone
      hits.push({ id: read[i].id, text: read[i].text, score: score / Math.sqrt(read[i].text.length) });
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, topK);
}
