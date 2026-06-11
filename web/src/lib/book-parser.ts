export type BookBlockKind = "heading" | "paragraph" | "quote" | "list" | "rule";

export type BookBlock = {
  id: string;
  text: string;
  kind: BookBlockKind;
  level?: number;
  continued?: boolean;
};

const strongBreakMarks = "。！？!?；;";
const weakBreakMarks = "，,、：:";
const leadingPunctuation = `，,、。！？!?；;：:）)]】》」』’”`;
const closingPunctuation = `）)]】》」』’”`;

export function isStrongBreakMark(value: string) {
  return strongBreakMarks.includes(value);
}

export function isWeakBreakMark(value: string) {
  return weakBreakMarks.includes(value);
}

export function isLeadingPunctuation(value: string) {
  return leadingPunctuation.includes(value);
}

export function lastMeaningfulMark(line: string) {
  let text = line.trim();
  while (text && closingPunctuation.includes(text[text.length - 1])) {
    text = text.slice(0, -1).trimEnd();
  }
  return text[text.length - 1] ?? "";
}

export function cleanMarkdownInline(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function naturalBreakIndex(text: string, maxLength: number) {
  const softLimit = Math.min(text.length, maxLength + 10);
  const minUsefulLength = Math.floor(maxLength * 0.55);
  let strongCandidate = 0;
  let weakCandidate = 0;

  for (let index = 0; index < softLimit; index += 1) {
    if (index + 1 >= minUsefulLength && isStrongBreakMark(text[index])) {
      strongCandidate = index + 1;
    }
    if (index + 1 >= minUsefulLength && isWeakBreakMark(text[index])) {
      weakCandidate = index + 1;
    }
  }

  if (strongCandidate) return strongCandidate;
  if (weakCandidate) return weakCandidate;

  for (let index = maxLength; index > minUsefulLength; index -= 1) {
    if (isStrongBreakMark(text[index - 1])) return index;
  }

  for (let index = maxLength; index > minUsefulLength; index -= 1) {
    if (isWeakBreakMark(text[index - 1])) return index;
  }

  return Math.min(maxLength, text.length);
}

export function splitOversizedText(text: string, maxLength: number) {
  const chunks: string[] = [];
  let rest = text.trim();

  while (rest.length > maxLength) {
    let boundary = naturalBreakIndex(rest, maxLength);
    while (boundary < rest.length && isLeadingPunctuation(rest[boundary])) {
      boundary += 1;
    }

    const chunk = rest.slice(0, boundary).trim();
    if (chunk) chunks.push(chunk);
    rest = rest.slice(boundary).trim();
  }

  if (rest) chunks.push(rest);
  return chunks;
}

export function splitLongParagraph(text: string, maxLength = 68) {
  if (text.length <= maxLength) return [text];

  const sentences = text.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences.map((item) => item.trim()).filter(Boolean)) {
    const pieces = sentence.length > maxLength ? splitOversizedText(sentence, maxLength) : [sentence];

    for (let piece of pieces) {
      if (!piece) continue;

      while (current && piece && isLeadingPunctuation(piece[0])) {
        current += piece[0];
        piece = piece.slice(1).trim();
      }

      if (!piece) continue;

      if ((current + piece).length > maxLength && current) {
        chunks.push(current);
        current = piece;
      } else {
        current += piece;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export function hasSourceParagraphIndent(line: string) {
  return /^\s*　/.test(line) || /^( {4,}|\t+)\S/.test(line);
}

export function endsSourceParagraph(line: string) {
  const mark = lastMeaningfulMark(line);
  return Boolean(mark && isStrongBreakMark(mark));
}

export function continuesSourceParagraph(line: string | undefined) {
  if (!line) return false;
  const mark = lastMeaningfulMark(line);
  return !mark || isWeakBreakMark(mark) || !isStrongBreakMark(mark);
}

export function shouldStartSourceParagraph(previousLine: string | undefined, currentLine: string) {
  if (!previousLine || !currentLine) return false;
  return endsSourceParagraph(previousLine) && !isLeadingPunctuation(currentLine[0]);
}

export function normalizeParsedBlocks(blocks: BookBlock[]) {
  const normalized: BookBlock[] = [];

  for (const block of blocks) {
    if (!block.text) {
      normalized.push(block);
      continue;
    }

    let text = block.text;
    const previousTextBlock = [...normalized]
      .reverse()
      .find((item) => item.text && item.kind !== "heading");

    while (text && previousTextBlock && isLeadingPunctuation(text[0])) {
      previousTextBlock.text += text[0];
      text = text.slice(1).trimStart();
    }

    if (!text) continue;
    normalized.push({ ...block, text });
  }

  return normalized;
}

const cjkRange =
  /[⺀-鿿豈-﫿︰-﹏\u{20000}-\u{2FA1F}]/u;

function isCJK(ch: string | undefined) {
  return ch ? cjkRange.test(ch) : false;
}

function joinBufferLines(lines: string[]) {
  if (!lines.length) return "";
  let result = lines[0];
  for (let i = 1; i < lines.length; i++) {
    const prev = result[result.length - 1];
    const next = lines[i][0];
    const needsSpace = prev && next && !isCJK(prev) && !isCJK(next);
    result += (needsSpace ? " " : "") + lines[i];
  }
  return result;
}

export function parseBookText(raw: string, idPrefix = "jiyuan"): BookBlock[] {
  const normalized = raw
    .replace(/\r/g, "")
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .trim();
  if (!normalized) return [];

  const blocks: BookBlock[] = [];
  const paragraphBuffer: string[] = [];
  let counter = 1;
  let inCodeFence = false;

  const pushBlock = (kind: BookBlockKind, text = "", level?: number, continued = false) => {
    blocks.push({
      id: `${idPrefix}-${counter}`,
      text,
      kind,
      level,
      continued,
    });
    counter += 1;
  };

  const pushParagraph = () => {
    const text = cleanMarkdownInline(joinBufferLines(paragraphBuffer));
    paragraphBuffer.length = 0;
    if (!text) return;
    const chunks = splitLongParagraph(text);
    chunks.forEach((chunk, index) => {
      const isContinued = index > 0 && !endsSourceParagraph(chunks[index - 1]);
      pushBlock("paragraph", chunk, undefined, isContinued);
    });
  };

  for (const line of normalized.split("\n")) {
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) continue;

    if (!trimmed) {
      if (!continuesSourceParagraph(paragraphBuffer.at(-1))) {
        pushParagraph();
      }
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      pushParagraph();
      pushBlock("heading", cleanMarkdownInline(heading[2]), heading[1].length);
      continue;
    }

    // Plain-text chapter markers: a bare short number ("1") or a 第X章 line.
    // Only when the previous line completed its sentence — a number right
    // after a comma is wrapped text, not a chapter break.
    const isChapterMarker =
      /^\d{1,3}$/.test(trimmed) ||
      /^第[零一二三四五六七八九十百千万0-9]{1,8}[章节卷部回篇]$/.test(trimmed);
    if (
      isChapterMarker &&
      (!paragraphBuffer.length || !continuesSourceParagraph(paragraphBuffer.at(-1)))
    ) {
      pushParagraph();
      pushBlock("heading", trimmed, 2);
      continue;
    }

    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      pushParagraph();
      pushBlock("rule");
      continue;
    }

    const quote = trimmed.match(/^>\s*(.+)$/);
    if (quote) {
      pushParagraph();
      pushBlock("quote", cleanMarkdownInline(quote[1]));
      continue;
    }

    const listItem = trimmed.match(/^([-*+]|\d+[.)])\s+(.+)$/);
    if (listItem) {
      pushParagraph();
      pushBlock("list", cleanMarkdownInline(listItem[2]));
      continue;
    }

    if (
      paragraphBuffer.length &&
      !continuesSourceParagraph(paragraphBuffer.at(-1)) &&
      (hasSourceParagraphIndent(line) || shouldStartSourceParagraph(paragraphBuffer.at(-1), trimmed))
    ) {
      pushParagraph();
    }

    paragraphBuffer.push(trimmed);
  }

  pushParagraph();

  if (blocks.some((item) => item.text || item.kind === "rule")) return normalizeParsedBlocks(blocks);

  return normalizeParsedBlocks(splitLongParagraph(cleanMarkdownInline(normalized)).map((text, index) => ({
    id: `${idPrefix}-${index + 1}`,
    text,
    kind: "paragraph",
    continued: index > 0,
  })));
}

export function firstSelectableId(blocks: BookBlock[], fallbackId = "placeholder") {
  return (
    blocks.find((item) => ["paragraph", "quote", "list"].includes(item.kind))?.id ??
    blocks.find((item) => item.kind !== "rule")?.id ??
    fallbackId
  );
}
